//! 大文件扫描与两阶段重复文件查找引擎
//! 1. 大文件流式扫描：支持过滤阈值（默认 >=100MB），分类识别，排除系统危险路径；
//! 2. 两阶段重复文件哈希比对：
//!    - Phase 1: 文件精确字节长度分组筛选（只留 >=2 份且 >= 阈值）；
//!    - Phase 2: 头部 8KB + 尾部 8KB 快速校验；
//!    - Phase 3: 全文 SHA-256 计算确认真实重复；
//! 3. 支持硬链接替换、软链接替换与移入回收站。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::Write;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use chrono::{DateTime, Local};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::scanner::get_link_info;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BigFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub category: String, // "disk_image" | "media" | "model" | "archive" | "executable" | "database" | "other"
    pub extension: String,
    pub modified_time: String,
    pub is_read_only: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFileItem {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_time: String,
    pub is_primary: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub group_id: String,
    pub hash: String,
    pub size_each: u64,
    pub wasted_bytes: u64,
    pub files: Vec<DuplicateFileItem>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatusEvent {
    pub task_type: String, // "big_file" | "dup_scan"
    pub current_path: String,
    pub scanned_files: u64,
    pub message: String,
    pub is_done: bool,
}

pub fn classify_file_type(ext: &str) -> String {
    let lower = ext.to_lowercase();
    match lower.as_str() {
        "vhdx" | "vhd" | "vmdk" | "qcow2" | "iso" | "img" => "disk_image".into(),
        "mp4" | "mkv" | "avi" | "mov" | "flv" | "wmv" | "mp3" | "wav" | "flac" => "media".into(),
        "gguf" | "safetensors" | "ckpt" | "bin" | "pt" | "pth" | "onnx" => "model".into(),
        "zip" | "7z" | "rar" | "tar" | "gz" | "bz2" | "xz" => "archive".into(),
        "exe" | "msi" | "dll" | "sys" => "executable".into(),
        "bak" | "mdf" | "ldf" | "db" | "sqlite" | "pst" | "ost" => "database".into(),
        _ => "other".into(),
    }
}

/// 扫描大于指定字节（默认 >= 100MB）的大文件
pub fn scan_big_files(
    app: &AppHandle,
    min_bytes: u64,
    scan_windows_dir: bool,
    cancel: &Arc<AtomicBool>,
) -> Vec<BigFileInfo> {
    let mut results = Vec::new();

    let sys_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
    let mut scan_roots = vec![
        PathBuf::from(format!("{}\\Users", sys_drive)),
        PathBuf::from(format!("{}\\ProgramData", sys_drive)),
        PathBuf::from(format!("{}\\Program Files", sys_drive)),
        PathBuf::from(format!("{}\\Program Files (x86)", sys_drive)),
    ];

    if scan_windows_dir {
        scan_roots.push(PathBuf::from(format!("{}\\Windows", sys_drive)));
    }

    let mut scanned_count = 0u64;

    for root in scan_roots {
        if !root.exists() || cancel.load(Ordering::Relaxed) {
            continue;
        }

        let walker = WalkDir::new(&root)
            .follow_links(false)
            .same_file_system(true)
            .into_iter()
            .filter_entry(|entry| {
                if entry.depth() > 0 && entry.file_type().is_dir() {
                    let (is_link, _) = get_link_info(entry.path());
                    return !is_link;
                }
                true
            });

        for entry_res in walker {
            if cancel.load(Ordering::Relaxed) {
                break;
            }

            if let Ok(entry) = entry_res {
                let ft = entry.file_type();
                if ft.is_file() {
                    scanned_count += 1;
                    if let Ok(meta) = entry.metadata() {
                        let len = meta.len();
                        if len >= min_bytes {
                            let path = entry.path();
                            let ext = path
                                .extension()
                                .map(|e| e.to_string_lossy().to_string())
                                .unwrap_or_default();
                            let name = entry.file_name().to_string_lossy().to_string();

                            let modified_time = meta
                                .modified()
                                .ok()
                                .map(|m| {
                                    let dt: DateTime<Local> = m.into();
                                    dt.format("%Y-%m-%d %H:%M").to_string()
                                })
                                .unwrap_or_else(|| "-".into());

                            let is_read_only = meta.permissions().readonly();
                            let category = classify_file_type(&ext);

                            results.push(BigFileInfo {
                                name,
                                path: path.to_string_lossy().to_string(),
                                size: len,
                                category,
                                extension: ext,
                                modified_time,
                                is_read_only,
                            });
                        }
                    }

                    if scanned_count % 300 == 0 {
                        let _ = app.emit("big-file-scan-progress", ScanStatusEvent {
                            task_type: "big_file".into(),
                            current_path: entry.path().to_string_lossy().to_string(),
                            scanned_files: scanned_count,
                            message: format!("已扫描 {} 个文件，发现 {} 个大文件...", scanned_count, results.len()),
                            is_done: false,
                        });
                    }
                }
            }
        }
    }

    results.sort_by(|a, b| b.size.cmp(&a.size));

    let _ = app.emit("big-file-scan-progress", ScanStatusEvent {
        task_type: "big_file".into(),
        current_path: "".into(),
        scanned_files: scanned_count,
        message: format!("扫描完成！共定位到 {} 个大文件", results.len()),
        is_done: true,
    });

    results
}

/// 计算小样点快速哈希（头部 8KB + 尾部 8KB）
fn sample_hash(path: &Path, file_size: u64) -> Option<[u8; 32]> {
    let mut file = File::open(path).ok()?;
    let mut hasher = Sha256::new();

    let sample_size = 8192; // 8KB
    let mut head_buf = vec![0u8; sample_size];
    let head_read = file.read(&mut head_buf).ok()?;
    hasher.update(&head_buf[..head_read]);

    if file_size > (sample_size as u64) * 2 {
        if file.seek(SeekFrom::End(-(sample_size as i64))).is_ok() {
            let mut tail_buf = vec![0u8; sample_size];
            if let Ok(tail_read) = file.read(&mut tail_buf) {
                hasher.update(&tail_buf[..tail_read]);
            }
        }
    }

    Some(hasher.finalize().into())
}

/// 计算文件完整 SHA-256 哈希
fn full_file_hash(path: &Path, cancel: &Arc<AtomicBool>) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536]; // 64KB 缓冲区

    loop {
        if cancel.load(Ordering::Relaxed) {
            return None;
        }
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    let hash_bytes = hasher.finalize();
    let mut hex_str = String::with_capacity(64);
    for b in hash_bytes {
        let _ = write!(hex_str, "{:02x}", b);
    }
    Some(hex_str)
}

/// 两阶段渐进式扫描重复文件
pub fn scan_duplicate_files(
    app: &AppHandle,
    min_bytes: u64,
    target_dirs: Vec<String>,
    cancel: &Arc<AtomicBool>,
) -> Vec<DuplicateGroup> {
    let mut size_map: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut scanned_count = 0u64;

    // 默认扫描用户主目录 (包括 Downloads, Desktop, Documents, AppData, 开发项目等)
    let roots = if target_dirs.is_empty() {
        let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users".into());
        vec![PathBuf::from(user_profile)]
    } else {
        target_dirs.into_iter().map(PathBuf::from).collect()
    };

    // Phase 1: 遍历并按照文件确切大小 (bytes) 聚合
    for root in &roots {
        if !root.exists() || cancel.load(Ordering::Relaxed) {
            continue;
        }

        let walker = WalkDir::new(root)
            .follow_links(false)
            .same_file_system(true)
            .into_iter()
            .filter_entry(|entry| {
                if entry.depth() > 0 && entry.file_type().is_dir() {
                    let (is_link, _) = get_link_info(entry.path());
                    return !is_link;
                }
                true
            });

        for entry_res in walker {
            if cancel.load(Ordering::Relaxed) {
                break;
            }

            if let Ok(entry) = entry_res {
                if entry.file_type().is_file() {
                    scanned_count += 1;
                    if let Ok(meta) = entry.metadata() {
                        let len = meta.len();
                        if len >= min_bytes {
                            size_map.entry(len).or_default().push(entry.path().to_path_buf());
                        }
                    }

                    if scanned_count % 300 == 0 {
                        let _ = app.emit("dup-file-scan-progress", ScanStatusEvent {
                            task_type: "dup_scan".into(),
                            current_path: entry.path().to_string_lossy().to_string(),
                            scanned_files: scanned_count,
                            message: format!("第一阶段 (尺寸筛选): 已扫描 {} 个文件...", scanned_count),
                            is_done: false,
                        });
                    }
                }
            }
        }
    }

    // 只保留体积完全相同的候选组 (>= 2 个文件)
    let potential_groups: Vec<(u64, Vec<PathBuf>)> = size_map
        .into_iter()
        .filter(|(_, files)| files.len() >= 2)
        .collect();

    // Phase 2: 采样哈希比对 (头尾 8KB)
    let mut sample_hash_map: HashMap<[u8; 32], Vec<PathBuf>> = HashMap::new();
    for (size, files) in potential_groups {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        for file_path in files {
            if let Some(h) = sample_hash(&file_path, size) {
                sample_hash_map.entry(h).or_default().push(file_path);
            }
        }
    }

    // Phase 3: 全文哈希比对
    let mut verified_groups: HashMap<String, Vec<PathBuf>> = HashMap::new();
    let sample_matched_candidates: Vec<Vec<PathBuf>> = sample_hash_map
        .into_iter()
        .filter(|(_, files)| files.len() >= 2)
        .map(|(_, files)| files)
        .collect();

    let mut phase3_idx = 0usize;
    let total_verify_files: usize = sample_matched_candidates.iter().map(|f| f.len()).sum();

    for file_list in sample_matched_candidates {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        for file_path in file_list {
            phase3_idx += 1;
            let _ = app.emit("dup-file-scan-progress", ScanStatusEvent {
                task_type: "dup_scan".into(),
                current_path: file_path.to_string_lossy().to_string(),
                scanned_files: scanned_count,
                message: format!("第二阶段 (校验内容哈希): 正在比对第 {}/{} 个候选文件...", phase3_idx, total_verify_files),
                is_done: false,
            });

            if let Some(full_hash) = full_file_hash(&file_path, cancel) {
                verified_groups.entry(full_hash).or_default().push(file_path);
            }
        }
    }

    // 构建 DuplicateGroup 输出
    let mut result_groups: Vec<DuplicateGroup> = Vec::new();
    let mut group_idx = 1;

    for (hash, files) in verified_groups {
        if files.len() >= 2 {
            let mut file_items = Vec::new();
            let mut size_each = 0u64;

            for (idx, f) in files.iter().enumerate() {
                let name = f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let size = f.metadata().map(|m| m.len()).unwrap_or(0);
                if idx == 0 {
                    size_each = size;
                }

                let modified_time = f
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .map(|m| {
                        let dt: DateTime<Local> = m.into();
                        dt.format("%Y-%m-%d %H:%M").to_string()
                    })
                    .unwrap_or_else(|| "-".into());

                file_items.push(DuplicateFileItem {
                    name,
                    path: f.to_string_lossy().to_string(),
                    size,
                    modified_time,
                    is_primary: idx == 0,
                });
            }

            let wasted = size_each * (file_items.len() as u64 - 1);

            result_groups.push(DuplicateGroup {
                group_id: format!("group-{}", group_idx),
                hash,
                size_each,
                wasted_bytes: wasted,
                files: file_items,
            });

            group_idx += 1;
        }
    }

    // 按浪费空间降序排序
    result_groups.sort_by(|a, b| b.wasted_bytes.cmp(&a.wasted_bytes));

    let _ = app.emit("dup-file-scan-progress", ScanStatusEvent {
        task_type: "dup_scan".into(),
        current_path: "".into(),
        scanned_files: scanned_count,
        message: format!("比对完成！共发现 {} 组完全相同的文件", result_groups.len()),
        is_done: true,
    });

    result_groups
}

/// 将重复副本替换为指向原文件的硬链接 (同盘) 或符号链接
pub fn replace_duplicate_with_link(
    original_path: &str,
    duplicate_path: &str,
    link_type: &str, // "hardlink" | "symlink"
) -> Result<(), String> {
    let orig = Path::new(original_path);
    let dup = Path::new(duplicate_path);

    if !orig.exists() {
        return Err("保留的原文件不存在".into());
    }
    if !dup.exists() {
        return Err("待替换的重复副本不存在".into());
    }

    // 1. 删除待替换的副本文件
    fs::remove_file(dup).map_err(|e| format!("无法删除重复副本: {}", e))?;

    // 2. 在原位置创建硬链接或软链接
    match link_type {
        "hardlink" => {
            fs::hard_link(orig, dup).map_err(|e| format!("创建硬链接失败: {}", e))?;
        }
        "symlink" => {
            #[cfg(windows)]
            {
                use std::os::windows::fs::symlink_file;
                symlink_file(orig, dup).map_err(|e| format!("创建文件符号链接失败: {}", e))?;
            }
        }
        _ => return Err("未知的链接替换类型".into()),
    }

    Ok(())
}
