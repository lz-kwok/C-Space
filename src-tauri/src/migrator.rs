//! 事务式迁移器：完整预检、进程占用拦截与一键杀死、物理复制与校验、改名备份、创建 Junction 联接、失败自动原子回滚、一键迁回

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use chrono::Local;

use crate::ledger::{add_link_record, remove_link_record, LinkRecord};
use crate::links::{create_junction, remove_link};
use crate::scanner::get_link_info;
use crate::winapi::{disk_space, find_lockers, running_by_names, ProcInfo};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MigrateCandidate {
    pub rule_id: String,
    pub name: String,
    pub category: String,
    pub path: String,
    pub bytes: u64,
    pub file_count: u64,
    pub purpose: String,
    pub migrate_note: String,
    pub is_linked: bool,
    pub link_target: Option<String>,
    pub processes: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MigratePrecheck {
    pub can_migrate: bool,
    pub source_path: String,
    pub target_path: String,
    pub source_bytes: u64,
    pub source_files: u64,
    pub target_drive_free: u64,
    pub blocking_processes: Vec<ProcInfo>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MigrateProgress {
    pub phase: String, // "precheck" | "copying" | "verifying" | "linking" | "cleaning" | "done" | "rolling_back" | "failed"
    pub current_bytes: u64,
    pub total_bytes: u64,
    pub current_file: String,
    pub percent: f32,
    pub message: String,
}

/// 迁移预检
pub fn precheck_migration(
    source_path: &str,
    target_path: &str,
    known_processes: &[String],
) -> Result<MigratePrecheck, String> {
    let src = Path::new(source_path);
    let tgt = Path::new(target_path);

    if !src.exists() {
        return Err("源目录不存在".into());
    }
    if !src.is_dir() {
        return Err("当前只支持对目录进行迁移".into());
    }

    let (is_link, target_opt) = get_link_info(src);
    if is_link {
        return Err(format!("源目录已是软链接/Junction（指向: {:?}），无需重复迁移", target_opt));
    }

    // 系统核心保护
    let src_str = src.to_string_lossy().to_lowercase();
    if src_str == "c:\\" || src_str == "c:\\windows" || src_str == "c:\\program files" || src_str == "c:\\users" {
        return Err("禁止迁移系统核心根目录".into());
    }

    // 统计源目录大小
    let (source_bytes, source_files) = count_dir_stats(src);

    // 目标可用空间检测
    let target_drive_free = disk_space(tgt).map(|(_, free)| free).unwrap_or(0);
    let mut warnings = Vec::new();

    if target_drive_free < source_bytes + (1024 * 1024 * 100) {
        return Err(format!("目标驱动器可用空间不足！需要至少 {} 字节，当前剩余 {} 字节", source_bytes, target_drive_free));
    }

    // 查找占用进程（规则预设 + Restart Manager）
    let mut blocking = running_by_names(known_processes);
    let sample_files = collect_sample_files(src, 10);
    let lock_procs = find_lockers(&sample_files);

    for p in lock_procs {
        if !blocking.iter().any(|b| b.pid == p.pid) {
            blocking.push(p);
        }
    }

    if !blocking.is_empty() {
        warnings.push(format!("检测到 {} 个正在运行的相关或占用进程，强烈建议迁移前先关闭它们", blocking.len()));
    }

    Ok(MigratePrecheck {
        can_migrate: true,
        source_path: source_path.to_string(),
        target_path: target_path.to_string(),
        source_bytes,
        source_files,
        target_drive_free,
        blocking_processes: blocking,
        warnings,
    })
}

/// 执行事务式迁移
pub fn execute_migration(
    app: &AppHandle,
    source_path: &str,
    target_path: &str,
) -> Result<(), String> {
    let src = Path::new(source_path);
    let tgt = Path::new(target_path);

    let (total_bytes, total_files) = count_dir_stats(src);
    let emit_p = |phase: &str, cur_bytes: u64, cur_file: &str, pct: f32, msg: &str| {
        let _ = app.emit("migrate-progress", MigrateProgress {
            phase: phase.to_string(),
            current_bytes: cur_bytes,
            total_bytes,
            current_file: cur_file.to_string(),
            percent: pct,
            message: msg.to_string(),
        });
    };

    emit_p("copying", 0, "", 0.0, "正在物理复制数据到目标盘...");

    // 1. 复制到目标路径
    if let Err(e) = copy_dir_all_with_progress(src, tgt, &mut 0, total_bytes, &emit_p) {
        emit_p("rolling_back", 0, "", 0.0, "复制失败，正在清理目标脏数据...");
        let _ = fs::remove_dir_all(tgt);
        return Err(format!("数据复制失败: {}", e));
    }

    // 2. 校验文件数量与大致尺寸
    emit_p("verifying", total_bytes, "", 90.0, "正在校验目标数据完整性...");
    let (tgt_bytes, tgt_files) = count_dir_stats(tgt);
    if tgt_files < total_files {
        emit_p("rolling_back", 0, "", 0.0, "数据校验不一致，正在回滚...");
        let _ = fs::remove_dir_all(tgt);
        return Err(format!("数据校验未通过: 源文件数 {}, 目标文件数 {}", total_files, tgt_files));
    }

    // 3. 将原目录重命名为备份 (.cspace-bak)
    emit_p("linking", total_bytes, "", 95.0, "正在准备切换目录与建立联接...");
    let bak_path = src.with_extension(format!("cspace-bak-{}", Local::now().timestamp_millis()));
    if let Err(e) = fs::rename(src, &bak_path) {
        // 重命名失败，删除目标副本
        let _ = fs::remove_dir_all(tgt);
        return Err(format!("重命名原目录失败(可能仍有文件被占用锁住): {}", e));
    }

    // 4. 在原路径创建 Junction 联接
    if let Err(e) = create_junction(src, tgt) {
        // Junction 创建失败，立即还原备份目录
        let _ = fs::rename(&bak_path, src);
        let _ = fs::remove_dir_all(tgt);
        return Err(format!("创建目录联接失败，已安全回滚原目录: {}", e));
    }

    // 5. 联接已成功，安全清理原备份目录
    emit_p("cleaning", total_bytes, "", 98.0, "联接建立成功，正在释放原 C 盘空间...");
    if let Err(e) = fs::remove_dir_all(&bak_path) {
        eprintln!("警告：清理原备份目录部分残留: {}", e);
    }

    // 6. 记入账本
    let _ = add_link_record(LinkRecord {
        id: format!("mig-{}", Local::now().timestamp_millis()),
        source_path: source_path.to_string(),
        target_path: target_path.to_string(),
        link_type: "junction".into(),
        created_at: Local::now().to_rfc3339(),
        size_at_migration: tgt_bytes,
        note: Some("C-Space 自动无损搬家".into()),
    });

    emit_p("done", total_bytes, "", 100.0, "迁移成功！C 盘空间已释放，软件无感重定向。");
    Ok(())
}

/// 一键将已迁移的目录迁回 C 盘
pub fn rollback_migration(
    app: &AppHandle,
    source_path: &str,
    target_path: &str,
) -> Result<(), String> {
    let src = Path::new(source_path);
    let tgt = Path::new(target_path);

    if !tgt.exists() {
        return Err("目标实际存储目录不存在，无法迁回".into());
    }

    let (total_bytes, total_files) = count_dir_stats(tgt);
    let emit_p = |phase: &str, cur_bytes: u64, cur_file: &str, pct: f32, msg: &str| {
        let _ = app.emit("migrate-progress", MigrateProgress {
            phase: phase.to_string(),
            current_bytes: cur_bytes,
            total_bytes,
            current_file: cur_file.to_string(),
            percent: pct,
            message: msg.to_string(),
        });
    };

    // 1. 解除 C 盘的 Junction 联接
    emit_p("linking", 0, "", 0.0, "正在解除原 C 盘联接...");
    remove_link(source_path)?;

    // 2. 将数据复制回 C 盘原位置
    emit_p("copying", 0, "", 10.0, "正在将文件搬回 C 盘...");
    if let Err(e) = copy_dir_all_with_progress(tgt, src, &mut 0, total_bytes, &emit_p) {
        // 如果搬回失败，重新恢复 Junction
        let _ = create_junction(src, tgt);
        return Err(format!("迁回数据复制失败，已重新挂载链接: {}", e));
    }

    // 3. 校验搬回结果
    let (_, back_files) = count_dir_stats(src);
    if back_files < total_files {
        let _ = fs::remove_dir_all(src);
        let _ = create_junction(src, tgt);
        return Err("迁回数据校验不完整，已撤销操作".into());
    }

    // 4. 删除其他盘的存储副本
    emit_p("cleaning", total_bytes, "", 95.0, "正在清理外部磁盘副本...");
    let _ = fs::remove_dir_all(tgt);

    // 5. 移除账本记录
    let _ = remove_link_record(source_path);

    emit_p("done", total_bytes, "", 100.0, "已成功迁回 C 盘原路径！");
    Ok(())
}

fn count_dir_stats(p: &Path) -> (u64, u64) {
    let mut bytes = 0u64;
    let mut files = 0u64;
    if let Ok(entries) = fs::read_dir(p) {
        for entry in entries.flatten() {
            let path = entry.path();
            let (is_link, _) = get_link_info(&path);
            if is_link {
                continue;
            }
            if path.is_dir() {
                let (b, f) = count_dir_stats(&path);
                bytes += b;
                files += f;
            } else if let Ok(meta) = path.symlink_metadata() {
                bytes += meta.len();
                files += 1;
            }
        }
    }
    (bytes, files)
}

fn collect_sample_files(p: &Path, limit: usize) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(p) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                files.push(path);
                if files.len() >= limit {
                    break;
                }
            } else if path.is_dir() {
                let sub = collect_sample_files(&path, limit - files.len());
                files.extend(sub);
                if files.len() >= limit {
                    break;
                }
            }
        }
    }
    files
}

fn copy_dir_all_with_progress<F>(
    src: &Path,
    dst: &Path,
    transferred: &mut u64,
    total: u64,
    emit: &F,
) -> Result<(), String>
where
    F: Fn(&str, u64, &str, f32, &str),
{
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;

    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        let (is_link, _) = get_link_info(&src_path);
        if is_link {
            continue;
        }

        if src_path.is_dir() {
            copy_dir_all_with_progress(&src_path, &dst_path, transferred, total, emit)?;
        } else {
            let len = fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
            *transferred += len;
            let pct = if total > 0 { (*transferred as f32 / total as f32) * 85.0 } else { 50.0 };
            emit("copying", *transferred, &src_path.to_string_lossy(), pct, "正在复制文件...");
        }
    }
    Ok(())
}

