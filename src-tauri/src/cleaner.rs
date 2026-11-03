//! 清理执行器：支持回收站/永久删除、文件年龄过滤、失败跳过与被占用跳过统计、清理历史日志记录与实时进度推送

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::SystemTime;
use chrono::Local;
use tauri::{AppHandle, Emitter};

use crate::rules::{CleanTarget, ResolvedTarget, RiskLevel};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanItemSummary {
    pub path: String,
    pub name: String,
    pub category: String,
    pub bytes: u64,
    pub file_count: u64,
    pub risk: RiskLevel,
    pub risk_note: String,
    pub processes: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanProgress {
    pub current_index: usize,
    pub total_items: usize,
    pub current_path: String,
    pub current_name: String,
    pub freed_bytes: u64,
    pub deleted_files: u64,
    pub skipped_files: u64,
    pub percent: f32,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanResult {
    pub success: bool,
    pub freed_bytes: u64,
    pub deleted_files: u64,
    pub skipped_files: u64,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanLogRecord {
    pub timestamp: String,
    pub items_cleaned: usize,
    pub freed_bytes: u64,
    pub to_recycle_bin: bool,
    pub skipped_files: u64,
}

/// 执行单批项清理，并通过 tauri event 实时广播清理进度
pub fn clean_targets(
    app: &AppHandle,
    targets: &[ResolvedTarget],
    to_recycle_bin: bool,
) -> CleanResult {
    let mut total_freed = 0u64;
    let mut deleted_count = 0u64;
    let mut skipped_count = 0u64;
    let mut errors = Vec::new();

    let total_items = targets.len();

    let emit_p = |idx: usize, path: &str, name: &str, freed: u64, del: u64, skip: u64, pct: f32, msg: &str| {
        let _ = app.emit("clean-progress", CleanProgress {
            current_index: idx,
            total_items,
            current_path: path.to_string(),
            current_name: name.to_string(),
            freed_bytes: freed,
            deleted_files: del,
            skipped_files: skip,
            percent: pct,
            message: msg.to_string(),
        });
    };

    for (idx, target) in targets.iter().enumerate() {
        let pct = if total_items > 0 {
            (idx as f32 / total_items as f32) * 100.0
        } else {
            0.0
        };

        emit_p(
            idx + 1,
            &target.path,
            &target.name,
            total_freed,
            deleted_count,
            skipped_count,
            pct,
            &format!("正在清理 ({}/{}): {}", idx + 1, total_items, target.name),
        );

        // 安全拦截：禁止直接清理危险级别的规则（前端与后端双校验）
        if target.risk == RiskLevel::Danger {
            errors.push(format!("拒绝清理高风险目录: {}", target.path));
            continue;
        }

        let p = Path::new(&target.path);
        if !p.exists() {
            continue;
        }

        match target.clean_target {
            CleanTarget::SelfNode => {
                let bytes = get_path_size(p);
                if delete_item(p, to_recycle_bin).is_ok() {
                    total_freed += bytes;
                    deleted_count += 1;
                } else {
                    skipped_count += 1;
                    errors.push(format!("删除失败(可能被占用): {}", target.path));
                }
            }
            CleanTarget::Contents => {
                if let Ok(entries) = fs::read_dir(p) {
                    for entry in entries.flatten() {
                        let sub = entry.path();
                        // 过滤 min_age_days
                        if let Some(days) = target.min_age_days {
                            if let Ok(meta) = sub.metadata() {
                                if let Ok(modified) = meta.modified() {
                                    if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                                        if elapsed.as_secs() < (days as u64) * 86400 {
                                            continue; // 较新文件，跳过不删
                                        }
                                    }
                                }
                            }
                        }

                        let bytes = get_path_size(&sub);
                        if delete_item(&sub, to_recycle_bin).is_ok() {
                            total_freed += bytes;
                            deleted_count += 1;
                        } else {
                            skipped_count += 1;
                        }
                    }
                }
            }
        }
    }

    emit_p(
        total_items,
        "",
        "",
        total_freed,
        deleted_count,
        skipped_count,
        100.0,
        "清理完成！",
    );

    // 记录审计日志
    record_clean_log(CleanLogRecord {
        timestamp: Local::now().to_rfc3339(),
        items_cleaned: targets.len(),
        freed_bytes: total_freed,
        to_recycle_bin,
        skipped_files: skipped_count,
    });

    CleanResult {
        success: errors.is_empty(),
        freed_bytes: total_freed,
        deleted_files: deleted_count,
        skipped_files: skipped_count,
        errors,
    }
}

fn delete_item(p: &Path, to_recycle_bin: bool) -> Result<(), String> {
    if to_recycle_bin {
        trash::delete(p).map_err(|e| e.to_string())
    } else if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

fn get_path_size(p: &Path) -> u64 {
    if let Ok(meta) = fs::symlink_metadata(p) {
        if meta.is_file() {
            return meta.len();
        }
    }
    0
}

fn record_clean_log(record: CleanLogRecord) {
    if let Ok(app_data) = std::env::var("APPDATA") {
        let dir = Path::new(&app_data).join("com.cspace.app");
        let _ = fs::create_dir_all(&dir);
        let log_file = dir.join("clean_history.jsonl");
        if let Ok(json) = serde_json::to_string(&record) {
            use std::io::Write;
            if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(log_file) {
                let _ = writeln!(file, "{}", json);
            }
        }
    }
}
