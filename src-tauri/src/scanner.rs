//! 极速低内存渐进式扫描器：
//! 1. 采用零冗余流式迭代，拒绝将海量路径全量 collect 入内存；
//! 2. 支持边扫描边通过 Tauri 事件实时渐进式推送单项结果，前端无感流式渲染；
//! 3. 严格不跟随 Reparse Point (Junction / Symlink)，绝不跨卷重复统计；
//! 4. 遇到无权限目录静默跳过，绝不中断整体扫描。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use chrono::{DateTime, Local};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::rules::{match_path, RiskLevel};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub file_count: u64,
    pub is_link: bool,
    pub link_target: Option<String>,
    pub purpose: Option<String>,
    pub risk: Option<RiskLevel>,
    pub risk_note: Option<String>,
    pub cleanable: bool,
    pub migratable: bool,
    pub is_heuristic: bool,
    pub has_children: bool,
    pub modified_time: Option<String>,
    pub days_since_modified: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    pub scan_id: String,
    pub parent_path: String,
    pub node: FileNode,
    pub is_done: bool,
}

#[derive(Default)]
pub struct ScanContext {
    pub cancel_flag: Arc<AtomicBool>,
}

/// 检查给定路径是否为 Junction、软链接或重解析点
pub fn get_link_info(path: &Path) -> (bool, Option<String>) {
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() {
            if let Ok(target) = fs::read_link(path) {
                return (true, Some(target.to_string_lossy().to_string()));
            }
            return (true, None);
        }
    }
    // 检查是否为 Windows 目录联接 Junction
    if junction::exists(path).unwrap_or(false) {
        if let Ok(target) = junction::get_target(path) {
            return (true, Some(target.to_string_lossy().to_string()));
        }
        return (true, None);
    }
    (false, None)
}

#[cfg(windows)]
fn is_reparse_point(entry: &walkdir::DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    if entry.path_is_symlink() {
        return true;
    }
    if let Ok(meta) = entry.metadata() {
        // FILE_ATTRIBUTE_REPARSE_POINT = 0x400
        if meta.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}

#[cfg(not(windows))]
fn is_reparse_point(entry: &walkdir::DirEntry) -> bool {
    entry.path_is_symlink()
}

/// 快速计算单项目录总大小与文件数（流式轻量迭代遍历，常数级 O(1) 内存占用）
/// 严格不跟随链接或重解析点（直接通过 WIN32 属性过滤，免除系统句柄开销），避免循环和跨卷扫描；遇到权限不足静默跳过
pub fn calc_dir_size_fast(path: &Path, cancel: &Arc<AtomicBool>) -> (u64, u64) {
    if cancel.load(Ordering::Relaxed) {
        return (0, 0);
    }

    let (is_link, _) = get_link_info(path);
    if is_link {
        return (0, 0);
    }

    let mut total_bytes = 0u64;
    let mut total_files = 0u64;

    // 使用 walkdir 流式迭代器，follow_links 设为 false，不缓存路径树
    let walker = WalkDir::new(path)
        .follow_links(false)
        .same_file_system(true)
        .into_iter()
        .filter_entry(|entry| {
            // 对子目录做轻量检查：若是软链接或 ReparsePoint (Junction)，过滤掉不向下深入
            if entry.depth() > 0 && entry.file_type().is_dir() {
                return !is_reparse_point(entry);
            }
            true
        });

    for entry_res in walker {
        if cancel.load(Ordering::Relaxed) {
            return (total_bytes, total_files);
        }

        if let Ok(entry) = entry_res {
            let ft = entry.file_type();
            if ft.is_file() {
                if let Ok(meta) = entry.metadata() {
                    total_bytes += meta.len();
                    total_files += 1;
                }
            }
        }
    }

    (total_bytes, total_files)
}

/// 渐进式多核并行扫描：
/// 1. 先快速读取一级子项；
/// 2. 使用 Rayon 线程池多核并发计算每个子项的真实体积，避免单核排队卡死；
/// 3. 每个子项计算完成后立即通过 `scan-node-found` 事件推送给前端；
/// 4. 返回完整最终结果作为兜底。
pub fn scan_dir_level_progressive(
    app: &AppHandle,
    parent: &Path,
    scan_id: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<Vec<FileNode>, String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Scan cancelled".into());
    }

    let entries = fs::read_dir(parent).map_err(|e| format!("无法读取目录: {}", e))?;
    let parent_str = parent.to_string_lossy().to_string();

    let mut paths: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        paths.push(entry.path());
    }

    use rayon::prelude::*;

    let total_count = paths.len();
    let mut nodes: Vec<FileNode> = paths
        .into_par_iter()
        .filter_map(|p| {
            if cancel.load(Ordering::Relaxed) {
                return None;
            }

            let (is_link, link_target) = get_link_info(&p);
            let meta = match fs::symlink_metadata(&p) {
                Ok(m) => m,
                Err(_) => return None,
            };

            let is_dir = meta.is_dir();
            let name = match p.file_name() {
                Some(n) => n.to_string_lossy().to_string(),
                None => return None,
            };

            let (size, file_count) = if is_link {
                (0, 0)
            } else if is_dir {
                calc_dir_size_fast(&p, cancel)
            } else {
                (meta.len(), 1)
            };

            let matched = match_path(&p);
            let has_children = if is_dir && !is_link {
                fs::read_dir(&p).map(|mut d| d.next().is_some()).unwrap_or(false)
            } else {
                false
            };

            let (modified_time, days_since_modified) = if let Ok(mod_time) = meta.modified() {
                let dt: DateTime<Local> = mod_time.into();
                let days = SystemTime::now()
                    .duration_since(mod_time)
                    .map(|d| (d.as_secs() / 86400) as u32)
                    .unwrap_or(0);
                (Some(dt.format("%Y-%m-%d %H:%M").to_string()), Some(days))
            } else {
                (None, None)
            };

            let node = FileNode {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir,
                size,
                file_count,
                is_link,
                link_target,
                purpose: matched.as_ref().map(|m| m.purpose.clone()),
                risk: matched.as_ref().map(|m| m.risk.clone()),
                risk_note: matched.as_ref().map(|m| m.risk_note.clone()),
                cleanable: matched.as_ref().map(|m| m.cleanable).unwrap_or(false),
                migratable: matched.as_ref().map(|m| m.migratable).unwrap_or(is_dir && !is_link),
                is_heuristic: matched.as_ref().map(|m| m.is_heuristic).unwrap_or(false),
                has_children,
                modified_time,
                days_since_modified,
            };

            // 渐进式广播：对目录或体积大于 5MB 的重要项目实时推送；避免对成百上千个微小琐碎文件滥发 IPC 导致前端消息积压与显存暴涨
            if is_dir || size >= 5 * 1024 * 1024 || total_count <= 50 {
                let _ = app.emit("scan-node-found", ScanProgressEvent {
                    scan_id: scan_id.to_string(),
                    parent_path: parent_str.clone(),
                    node: node.clone(),
                    is_done: false,
                });
            }

            Some(node)
        })
        .collect();

    // 默认按占用大小降序排序
    nodes.sort_by(|a, b| b.size.cmp(&a.size));

    // 广播扫描结束标记
    let _ = app.emit("scan-node-found", ScanProgressEvent {
        scan_id: scan_id.to_string(),
        parent_path: parent_str,
        node: FileNode {
            name: String::new(),
            path: String::new(),
            is_dir: false,
            size: 0,
            file_count: 0,
            is_link: false,
            link_target: None,
            purpose: None,
            risk: None,
            risk_note: None,
            cleanable: false,
            migratable: false,
            is_heuristic: false,
            has_children: false,
            modified_time: None,
            days_since_modified: None,
        },
        is_done: true,
    });

    Ok(nodes)
}
