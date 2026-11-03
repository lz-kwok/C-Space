//! 高性能低内存扫描器：迭代式遍历、零冗余内存分配、软链接/Junction 识别、安全跳过

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use rayon::prelude::*;
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
/// 严格不跟随链接或重解析点，避免循环和跨卷扫描
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

    // 使用 walkdir 流式迭代器，follow_links 设为 false，不把整个目录树塞入 Vec
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

/// 扫描某一目录的一级直接子项（按需展开），控制并发度，内存开销极小
pub fn scan_dir_level(parent: &Path, cancel: &Arc<AtomicBool>) -> Result<Vec<FileNode>, String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Scan cancelled".into());
    }

    let entries = fs::read_dir(parent).map_err(|e| format!("无法读取目录: {}", e))?;
    
    // 只取一级直接子项的 PathBuf
    let mut paths = Vec::new();
    for entry in entries.flatten() {
        paths.push(entry.path());
    }

    // 采用 rayon 并行处理一级子项，每个子项内部采用流式 walkdir 迭代
    let mut nodes: Vec<FileNode> = paths
        .into_par_iter()
        .filter_map(|p| {
            if cancel.load(Ordering::Relaxed) {
                return None;
            }
            let (is_link, link_target) = get_link_info(&p);
            let meta = fs::symlink_metadata(&p).ok()?;
            let is_dir = meta.is_dir();
            let name = p.file_name()?.to_string_lossy().to_string();

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

            Some(FileNode {
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
            })
        })
        .collect();

    // 默认按占用大小降序排序
    nodes.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(nodes)
}
