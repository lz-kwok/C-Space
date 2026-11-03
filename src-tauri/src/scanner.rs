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

/// 快速计算单项目录总大小与文件数（流式单线程迭代遍历，常数级 O(1) 内存占用）
/// 严格不跟随链接或重解析点，避免循环和跨卷扫描；遇到权限不足静默跳过
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
            // 对子目录做检查：若是软链接或 Junction，过滤掉不向下深入
            if entry.depth() > 0 && entry.file_type().is_dir() {
                let (link, _) = get_link_info(entry.path());
                return !link;
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

/// 渐进式流式扫描：
/// 1. 先快速把一级子项元数据读出；
/// 2. 依次计算每个子项的真实体积并实时通过 `scan-node-found` 事件推送给前端；
/// 3. 前端无需等到整个目录（可能有数百个大子目录）完全扫完，即可立即看到已算好的项；
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

    let mut nodes: Vec<FileNode> = Vec::with_capacity(paths.len());

    for p in paths {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        let (is_link, link_target) = get_link_info(&p);
        let meta = match fs::symlink_metadata(&p) {
            Ok(m) => m,
            Err(_) => continue, // 无法读取元数据则跳过
        };

        let is_dir = meta.is_dir();
        let name = match p.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
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
        };

        // 立即渐进式广播此节点
        let _ = app.emit("scan-node-found", ScanProgressEvent {
            scan_id: scan_id.to_string(),
            parent_path: parent_str.clone(),
            node: node.clone(),
            is_done: false,
        });

        nodes.push(node);
    }

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
        },
        is_done: true,
    });

    Ok(nodes)
}
