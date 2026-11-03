//! 软链接管理模块：创建 Junction / 符号链接 / 硬链接，断链检查，扫描已有重解析点，删除链接

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use chrono::Local;

use crate::ledger::{add_link_record, load_ledger, remove_link_record, LinkRecord};
use crate::scanner::get_link_info;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkDetail {
    pub id: String,
    pub source_path: String,
    pub target_path: String,
    pub link_type: String,
    pub created_at: String,
    pub exists: bool,
    pub target_exists: bool,
    pub is_broken: bool,
    pub is_managed: bool,
}

/// 创建 Windows 目录联接 Junction (mklink /J 等价)
pub fn create_junction(link_path: &Path, target_path: &Path) -> Result<(), String> {
    junction::create(target_path, link_path).map_err(|e| format!("创建 Junction 失败: {}", e))
}

/// 创建 Windows 符号链接 (mklink /D 或普通 mklink)
pub fn create_symlink(link_path: &Path, target_path: &Path, is_dir: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::{symlink_dir, symlink_file};
        if is_dir {
            symlink_dir(target_path, link_path).map_err(|e| format!("创建目录软链接失败: {}", e))
        } else {
            symlink_file(target_path, link_path).map_err(|e| format!("创建文件软链接失败: {}", e))
        }
    }
    #[cfg(not(windows))]
    {
        Err("仅支持 Windows 系统".into())
    }
}

/// 创建硬链接 (仅支持同驱动器文件)
pub fn create_hardlink(link_path: &Path, target_path: &Path) -> Result<(), String> {
    fs::hard_link(target_path, link_path).map_err(|e| format!("创建硬链接失败: {}", e))
}

/// 获取当前所有软链接状态（合并账本记录与现场检测）
pub fn list_all_links() -> Vec<LinkDetail> {
    let ledger_records = load_ledger();
    let mut results = Vec::new();

    for r in ledger_records {
        let src = Path::new(&r.source_path);
        let tgt = Path::new(&r.target_path);

        let exists = src.exists() || get_link_info(src).0;
        let target_exists = tgt.exists();
        let is_broken = !exists || !target_exists;

        results.push(LinkDetail {
            id: r.id,
            source_path: r.source_path,
            target_path: r.target_path,
            link_type: r.link_type,
            created_at: r.created_at,
            exists,
            target_exists,
            is_broken,
            is_managed: true,
        });
    }

    results
}

/// 安全移除一个软链接或 Junction（仅删除链接本身，绝不删除目标原文件）
pub fn remove_link(source_path: &str) -> Result<(), String> {
    let p = Path::new(source_path);
    if !p.exists() && !get_link_info(p).0 {
        let _ = remove_link_record(source_path);
        return Ok(());
    }

    let (is_link, _) = get_link_info(p);
    if !is_link {
        return Err("指定路径不是软链接或 Junction，拒绝操作以保安全".into());
    }

    // 对于 Windows Junction 或软链接目录，标准 remove_dir 只会解除联接，绝不级联删除目标内容
    if let Err(e) = fs::remove_dir(p) {
        // 如果是文件链接，尝试 remove_file
        fs::remove_file(p).map_err(|e2| format!("无法解除链接: {} / {}", e, e2))?;
    }

    let _ = remove_link_record(source_path);
    Ok(())
}

/// 手动创建软链接并存入账本
pub fn manual_create_link(
    source_path: &str,
    target_path: &str,
    link_type: &str,
    note: Option<String>,
) -> Result<(), String> {
    let src = Path::new(source_path);
    let tgt = Path::new(target_path);

    if !tgt.exists() {
        return Err("目标实际目录/文件不存在".into());
    }
    if src.exists() {
        return Err("源路径已存在实体文件或文件夹，无法直接创建链接".into());
    }

    let is_dir = tgt.is_dir();

    match link_type {
        "junction" => {
            if !is_dir {
                return Err("Junction 仅支持目录".into());
            }
            create_junction(src, tgt)?;
        }
        "symlink_dir" => {
            create_symlink(src, tgt, true)?;
        }
        "symlink_file" => {
            create_symlink(src, tgt, false)?;
        }
        "hardlink" => {
            create_hardlink(src, tgt)?;
        }
        _ => return Err("未知的链接类型".into()),
    }

    let record = LinkRecord {
        id: format!("link-{}", Local::now().timestamp_millis()),
        source_path: source_path.to_string(),
        target_path: target_path.to_string(),
        link_type: link_type.to_string(),
        created_at: Local::now().to_rfc3339(),
        size_at_migration: 0,
        note,
    };

    add_link_record(record)?;
    Ok(())
}

