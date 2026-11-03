//! Tauri 命令注册与主入口

mod cleaner;
mod ledger;
mod links;
mod migrator;
mod rules;
mod scanner;
mod winapi;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

use cleaner::{clean_targets, CleanItemSummary, CleanResult};
use ledger::{load_ledger, load_settings, save_settings, AppSettings, LinkRecord};
use links::{list_all_links, manual_create_link, remove_link, LinkDetail};
use migrator::{execute_migration, precheck_migration, rollback_migration, MigrateCandidate, MigratePrecheck};
use rules::{get_all_rules, get_clean_targets, get_migrate_targets, load_rules, match_path, ResolvedTarget, Rule};
use scanner::{scan_dir_level_progressive, FileNode, ScanContext};
use winapi::{is_elevated, kill_process, list_drives, relaunch_as_admin, DriveInfo, ProcInfo};

#[tauri::command]
fn check_elevation() -> bool {
    is_elevated()
}

#[tauri::command]
fn trigger_admin_relaunch() -> Result<(), String> {
    relaunch_as_admin()
}

#[tauri::command]
fn get_drives() -> Vec<DriveInfo> {
    list_drives()
}

#[tauri::command]
fn get_rules() -> Vec<Rule> {
    get_all_rules()
}

#[tauri::command]
fn scan_directory(
    app: AppHandle,
    path: String,
    scan_id: Option<String>,
    state: State<'_, ScanContext>,
) -> Result<Vec<FileNode>, String> {
    state.cancel_flag.store(false, Ordering::Relaxed);
    let id = scan_id.unwrap_or_else(|| "default".into());
    scan_dir_level_progressive(&app, Path::new(&path), &id, &state.cancel_flag)
}

#[tauri::command]
fn cancel_scan(state: State<'_, ScanContext>) {
    state.cancel_flag.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn get_clean_candidates() -> Vec<CleanItemSummary> {
    let targets = get_clean_targets();
    let cancel = Arc::new(AtomicBool::new(false));

    use rayon::prelude::*;
    let summaries: Vec<CleanItemSummary> = targets
        .into_par_iter()
        .filter_map(|t| {
            let p = Path::new(&t.path);
            if !p.exists() {
                return None;
            }
            let (bytes, files) = scanner::calc_dir_size_fast(p, &cancel);
            if bytes > 0 || files > 0 {
                Some(CleanItemSummary {
                    path: t.path,
                    name: t.name,
                    category: t.category,
                    bytes,
                    file_count: files,
                    risk: t.risk,
                    risk_note: t.risk_note,
                    processes: t.processes,
                })
            } else {
                None
            }
        })
        .collect();

    summaries
}

#[tauri::command]
fn run_clean(app: AppHandle, paths: Vec<String>, to_recycle_bin: bool) -> CleanResult {
    let all_targets = get_clean_targets();
    let targets_to_clean: Vec<ResolvedTarget> = all_targets
        .into_iter()
        .filter(|t| paths.iter().any(|p| p.eq_ignore_ascii_case(&t.path)))
        .collect();

    clean_targets(&app, &targets_to_clean, to_recycle_bin)
}

#[tauri::command]
fn get_migrate_candidates() -> Vec<MigrateCandidate> {
    let targets = get_migrate_targets();
    let cancel = Arc::new(AtomicBool::new(false));

    use rayon::prelude::*;
    let candidates: Vec<MigrateCandidate> = targets
        .into_par_iter()
        .filter_map(|t| {
            let p = Path::new(&t.path);
            let (is_linked, link_target) = scanner::get_link_info(p);
            if !p.exists() && !is_linked {
                return None;
            }

            let (bytes, files) = if is_linked {
                (0, 0)
            } else {
                scanner::calc_dir_size_fast(p, &cancel)
            };

            Some(MigrateCandidate {
                rule_id: t.rule_id,
                name: t.name,
                category: t.category,
                path: t.path,
                bytes,
                file_count: files,
                purpose: t.purpose,
                migrate_note: t.migrate_note.unwrap_or_else(|| "支持跨盘迁移与创建目录联接".into()),
                is_linked,
                link_target,
                processes: t.processes,
            })
        })
        .collect();

    candidates
}

#[tauri::command]
fn precheck_migrate(
    source_path: String,
    target_path: String,
    known_processes: Vec<String>,
) -> Result<MigratePrecheck, String> {
    precheck_migration(&source_path, &target_path, &known_processes)
}

#[tauri::command]
fn run_migrate(
    app: AppHandle,
    source_path: String,
    target_path: String,
) -> Result<(), String> {
    execute_migration(&app, &source_path, &target_path)
}

#[tauri::command]
fn run_rollback(
    app: AppHandle,
    source_path: String,
    target_path: String,
) -> Result<(), String> {
    rollback_migration(&app, &source_path, &target_path)
}

#[tauri::command]
fn terminate_process_by_pid(pid: u32) -> Result<(), String> {
    kill_process(pid)
}

#[tauri::command]
fn get_links() -> Vec<LinkDetail> {
    list_all_links()
}

#[tauri::command]
fn create_custom_link(
    source_path: String,
    target_path: String,
    link_type: String,
    note: Option<String>,
) -> Result<(), String> {
    manual_create_link(&source_path, &target_path, &link_type, note)
}

#[tauri::command]
fn delete_link(source_path: String) -> Result<(), String> {
    remove_link(&source_path)
}

#[tauri::command]
fn get_settings() -> AppSettings {
    load_settings()
}

#[tauri::command]
fn update_settings(settings: AppSettings) -> Result<(), String> {
    save_settings(&settings)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_rules();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ScanContext::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(icon) = tauri::image::Image::from_app_icon_resource(256) {
                    let _ = window.set_icon(icon);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_elevation,
            trigger_admin_relaunch,
            get_drives,
            get_rules,
            scan_directory,
            cancel_scan,
            get_clean_candidates,
            run_clean,
            get_migrate_candidates,
            precheck_migrate,
            run_migrate,
            run_rollback,
            terminate_process_by_pid,
            get_links,
            create_custom_link,
            delete_link,
            get_settings,
            update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running C-Space tauri application");
}

