//! C 盘全景系统体检模块：
//! 1. 严格排查 Junction / 软链接（ReparsePoint），杜绝跨卷穿透统计；
//! 2. 识别并免责已生效的软链接（物理计 0 字节）；
//! 3. 精准测量 C 盘各真实大目录的物理扇区占用；
//! 4. 汇总可安全清理的系统垃圾与开发缓存。

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use rayon::prelude::*;

use crate::cleaner::CleanItemSummary;
use crate::ledger::load_ledger;
use crate::rules::{expand_macros, get_clean_targets, RiskLevel};
use crate::scanner::{calc_dir_size_fast, get_link_info, is_path_reparse_point};
use crate::winapi::list_drives;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReparseAuditItem {
    pub path: String,
    pub name: String,
    pub link_type: String, // "Junction" | "Symlink"
    pub target: String,
    pub is_valid: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealPhysicalUsage {
    pub path: String,
    pub name: String,
    pub category: String, // "开发环境" | "用户配置" | "系统核心" | "软件安装" | "应用缓存"
    pub size_bytes: u64,
    pub file_count: u64,
    pub is_reparse: bool,
    pub target: Option<String>,
    pub suggestion: String, // "可清理" | "可迁移" | "系统保留" | "已外迁(0字节)"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CDriveAuditReport {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub reparse_points: Vec<ReparseAuditItem>,
    pub real_top_dirs: Vec<RealPhysicalUsage>,
    pub safe_clean_items: Vec<CleanItemSummary>,
    pub total_cleanable_bytes: u64,
}

/// 执行系统 C 盘全景物理透视体检
pub fn run_c_drive_audit(cancel: &Arc<AtomicBool>) -> CDriveAuditReport {
    // 1. 获取 C 盘基础物理容量
    let drives = list_drives();
    let c_drive = drives
        .iter()
        .find(|d| d.letter.to_uppercase().starts_with('C') || d.root.to_uppercase().starts_with('C'));
    let total_bytes = c_drive.map(|d| d.total).unwrap_or(0);
    let free_bytes = c_drive.map(|d| d.free).unwrap_or(0);
    let used_bytes = total_bytes.saturating_sub(free_bytes);

    // 2. 扫描并发现所有已生效的 ReparsePoints (Junction / Symlink)
    let mut reparse_points = Vec::new();
    let mut scanned_link_paths = HashSet::new();

    // 先从账本中读取
    for record in load_ledger() {
        let p = Path::new(&record.source_path);
        let (_is_link, target) = get_link_info(p);
        let actual_target = target.unwrap_or(record.target_path);
        let is_valid = Path::new(&actual_target).exists();
        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        scanned_link_paths.insert(record.source_path.to_lowercase());

        reparse_points.push(ReparseAuditItem {
            path: record.source_path,
            name,
            link_type: if record.link_type == "junction" {
                "Junction".to_string()
            } else {
                "Symlink".to_string()
            },
            target: actual_target,
            is_valid,
        });
    }

    // 深入现场扫描常见目录下的 ReparsePoints (例如用户根目录、AppData\Roaming、AppData\Local、C:\ 根)
    let scan_roots = vec![
        expand_macros("%USERPROFILE%"),
        expand_macros("%APPDATA%"),
        expand_macros("%LOCALAPPDATA%"),
        "C:\\".to_string(),
    ];

    for root_str in scan_roots {
        let root = Path::new(&root_str);
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let path = entry.path();
                let path_str = path.to_string_lossy().to_string();
                let path_lower = path_str.to_lowercase();

                if scanned_link_paths.contains(&path_lower) {
                    continue;
                }

                let (is_link, target) = get_link_info(&path);
                if is_link || is_path_reparse_point(&path) {
                    scanned_link_paths.insert(path_lower);
                    let target_str = target.unwrap_or_else(|| "未知或外部卷".to_string());
                    let is_valid = Path::new(&target_str).exists();
                    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

                    let link_type = if junction::exists(&path).unwrap_or(false) {
                        "Junction".to_string()
                    } else {
                        "Symlink".to_string()
                    };

                    reparse_points.push(ReparseAuditItem {
                        path: path_str,
                        name,
                        link_type,
                        target: target_str,
                        is_valid,
                    });
                }
            }
        }
    }

    // 3. 并行扫描 C 盘真实物理大头目录
    // 候选重要目录清单（开发缓存、大软件、系统关键库等）
    let candidate_dirs = vec![
        // 开发/运行环境
        ("%USERPROFILE%\\.gemini", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.rustup", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.cargo", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.cursor", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.vscode", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.trae-cn", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.m2", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.gradle", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.docker", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.conda", "开发环境", "建议迁移"),
        ("%USERPROFILE%\\.ollama", "开发环境", "建议迁移"),
        // 软件数据与缓存
        ("%LOCALAPPDATA%\\ms-playwright", "开发缓存", "可安全清理"),
        ("%LOCALAPPDATA%\\antigravity-updater", "应用更新", "可安全清理"),
        ("%LOCALAPPDATA%\\Temp", "系统临时", "可安全清理"),
        ("%LOCALAPPDATA%\\Programs", "软件安装", "建议迁移"),
        ("%LOCALAPPDATA%\\Google", "应用数据", "建议保留"),
        ("%LOCALAPPDATA%\\Microsoft", "应用数据", "系统保留"),
        ("%APPDATA%\\Trae CN", "开发环境", "建议迁移"),
        ("%APPDATA%\\Code", "应用数据", "建议迁移"),
        ("%APPDATA%\\npm-cache", "开发缓存", "可安全清理"),
        ("%APPDATA%\\OfficePLUS", "应用缓存", "可安全清理"),
        // 系统目录
        ("C:\\Windows", "系统核心", "系统保护"),
        ("C:\\Program Files", "软件安装", "建议按需迁移"),
        ("C:\\Program Files (x86)", "软件安装", "建议按需迁移"),
        ("C:\\ProgramData", "系统数据", "系统保护"),
    ];

    let real_top_dirs: Vec<RealPhysicalUsage> = candidate_dirs
        .par_iter()
        .filter_map(|(raw_path, cat, default_sugg)| {
            if cancel.load(Ordering::Relaxed) {
                return None;
            }

            let expanded = expand_macros(raw_path);
            let path = Path::new(&expanded);
            if !path.exists() {
                return None;
            }

            let (is_link, target) = get_link_info(path);
            let is_reparse = is_link || is_path_reparse_point(path);
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| expanded.clone());

            if is_reparse {
                // 如果是软链接，物理占用严格计 0 字节
                Some(RealPhysicalUsage {
                    path: expanded,
                    name,
                    category: cat.to_string(),
                    size_bytes: 0,
                    file_count: 0,
                    is_reparse: true,
                    target,
                    suggestion: "已外迁软链(物理0B)".to_string(),
                })
            } else {
                let (bytes, files) = calc_dir_size_fast(path, cancel);
                // 仅保留大于 5MB 的目录以聚焦重点大头
                if bytes >= 5 * 1024 * 1024 {
                    Some(RealPhysicalUsage {
                        path: expanded,
                        name,
                        category: cat.to_string(),
                        size_bytes: bytes,
                        file_count: files,
                        is_reparse: false,
                        target: None,
                        suggestion: default_sugg.to_string(),
                    })
                } else {
                    None
                }
            }
        })
        .collect();

    // 排序：先排未外迁的大目录（按体积降序），再排已外迁的软链
    let mut sorted_top_dirs = real_top_dirs;
    sorted_top_dirs.sort_by(|a, b| {
        if a.is_reparse && !b.is_reparse {
            std::cmp::Ordering::Greater
        } else if !a.is_reparse && b.is_reparse {
            std::cmp::Ordering::Less
        } else {
            b.size_bytes.cmp(&a.size_bytes)
        }
    });

    // 4. 获取当前可安全清理的所有垃圾项目
    let resolved_clean_targets = get_clean_targets();
    let safe_clean_items: Vec<CleanItemSummary> = resolved_clean_targets
        .par_iter()
        .filter_map(|rt| {
            if cancel.load(Ordering::Relaxed) {
                return None;
            }
            let p = Path::new(&rt.path);
            if !p.exists() {
                return None;
            }
            // 如果已经被做了软链接，不作为清理对象
            if is_path_reparse_point(p) {
                return None;
            }

            let (bytes, file_count) = calc_dir_size_fast(p, cancel);
            if bytes == 0 && file_count == 0 {
                return None;
            }

            Some(CleanItemSummary {
                path: rt.path.clone(),
                name: rt.name.clone(),
                category: rt.category.clone(),
                bytes,
                file_count,
                risk: rt.risk.clone(),
                risk_note: rt.risk_note.clone(),
                processes: rt.processes.clone(),
            })
        })
        .collect();

    let total_cleanable_bytes: u64 = safe_clean_items
        .iter()
        .filter(|i| i.risk == RiskLevel::Safe)
        .map(|i| i.bytes)
        .sum();

    CDriveAuditReport {
        total_bytes,
        used_bytes,
        free_bytes,
        reparse_points,
        real_top_dirs: sorted_top_dirs,
        safe_clean_items,
        total_cleanable_bytes,
    }
}
