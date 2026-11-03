//! 软链接账本与设置管理：%APPDATA%\com.cspace.app\ledger.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use chrono::Local;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkRecord {
    pub id: String,
    pub source_path: String,
    pub target_path: String,
    pub link_type: String, // "junction" | "symlink_dir" | "symlink_file" | "hardlink"
    pub created_at: String,
    pub size_at_migration: u64,
    pub note: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_vault_dir: String,
    pub auto_uac: bool,
    pub clean_to_recycle_bin: bool,
    pub exclude_patterns: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_vault_dir: "D:\\C-SpaceVault".into(),
            auto_uac: true,
            clean_to_recycle_bin: true,
            exclude_patterns: vec![],
        }
    }
}

pub fn get_app_data_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| "C:\\ProgramData".into());
    let dir = Path::new(&base).join("com.cspace.app");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn load_ledger() -> Vec<LinkRecord> {
    let path = get_app_data_dir().join("ledger.json");
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(records) = serde_json::from_str::<Vec<LinkRecord>>(&content) {
                return records;
            }
        }
    }
    Vec::new()
}

pub fn save_ledger(records: &[LinkRecord]) -> Result<(), String> {
    let path = get_app_data_dir().join("ledger.json");
    let json = serde_json::to_string_pretty(records).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn add_link_record(record: LinkRecord) -> Result<(), String> {
    let mut records = load_ledger();
    records.retain(|r| !r.source_path.eq_ignore_ascii_case(&record.source_path));
    records.push(record);
    save_ledger(&records)
}

pub fn remove_link_record(source_path: &str) -> Result<(), String> {
    let mut records = load_ledger();
    records.retain(|r| !r.source_path.eq_ignore_ascii_case(source_path));
    save_ledger(&records)
}

pub fn load_settings() -> AppSettings {
    let path = get_app_data_dir().join("settings.json");
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(s) = serde_json::from_str::<AppSettings>(&content) {
                return s;
            }
        }
    }
    let default_val = AppSettings::default();
    let _ = save_settings(&default_val);
    default_val
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = get_app_data_dir().join("settings.json");
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

