//! 规则引擎：规则定义、路径宏展开、通配符解析、规则库加载与启发式规则匹配

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use once_cell::sync::Lazy;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Safe,    // 🟢 安全清理
    Caution, // 🟡 谨慎清理 (说明副作用)
    Danger,  // 🔴 高危禁删 (仅建议迁移)
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CleanTarget {
    Contents, // 清空目录下内容
    SelfNode, // 删除目录或文件本身
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub category: String, // system, browser, dev, social, office, design, media, game, custom
    pub paths: Vec<String>,
    pub purpose: String,
    pub risk: RiskLevel,
    pub risk_note: String,
    #[serde(default)]
    pub cleanable: bool,
    #[serde(default)]
    pub clean_target: Option<CleanTarget>,
    #[serde(default)]
    pub min_age_days: Option<u32>,
    #[serde(default)]
    pub migratable: bool,
    #[serde(default)]
    pub migrate_note: Option<String>,
    #[serde(default)]
    pub processes: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTarget {
    pub rule_id: String,
    pub name: String,
    pub category: String,
    pub path: String,
    pub purpose: String,
    pub risk: RiskLevel,
    pub risk_note: String,
    pub cleanable: bool,
    pub clean_target: CleanTarget,
    pub min_age_days: Option<u32>,
    pub migratable: bool,
    pub migrate_note: Option<String>,
    pub processes: Vec<String>,
    pub is_heuristic: bool,
}

static RULES_REGISTRY: Lazy<RwLock<Vec<Rule>>> = Lazy::new(|| RwLock::new(Vec::new()));

pub fn get_env_map() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let sys_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
    let windir = std::env::var("windir").unwrap_or_else(|_| format!("{}\\Windows", sys_drive));
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let programdata = std::env::var("ProgramData").unwrap_or_else(|_| format!("{}\\ProgramData", sys_drive));
    let userprofile = std::env::var("USERPROFILE").unwrap_or_default();

    map.insert("%SYSTEMDRIVE%".to_lowercase(), sys_drive);
    map.insert("%WINDIR%".to_lowercase(), windir);
    map.insert("%APPDATA%".to_lowercase(), appdata);
    map.insert("%LOCALAPPDATA%".to_lowercase(), localappdata);
    map.insert("%PROGRAMDATA%".to_lowercase(), programdata);
    map.insert("%USERPROFILE%".to_lowercase(), userprofile);
    map
}

/// 展开路径中的环境变量
pub fn expand_macros(raw: &str) -> String {
    let env_map = get_env_map();
    let mut result = raw.to_string();
    for (macro_key, val) in &env_map {
        // 大小写不敏感替换
        let upper_key = macro_key.to_uppercase();
        let lower_key = macro_key.to_lowercase();
        result = result.replace(&upper_key, val).replace(&lower_key, val);
    }
    result
}

/// 展开带通配符 '*' 的路径
pub fn resolve_wildcards(path_str: &str) -> Vec<PathBuf> {
    let expanded = expand_macros(path_str);
    let parts: Vec<&str> = expanded.split('\\').collect();
    let mut current_paths = vec![PathBuf::new()];

    for part in parts {
        if part.is_empty() {
            continue;
        }
        let mut next_paths = Vec::new();
        for base in current_paths {
            if part.contains('*') {
                if base.as_os_str().is_empty() {
                    continue;
                }
                if let Ok(entries) = fs::read_dir(&base) {
                    let pattern = part.replace('*', ".*");
                    let regex = regex_lite(&pattern);
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if regex_match(&regex, &name) {
                            next_paths.push(entry.path());
                        }
                    }
                }
            } else {
                let p = if base.as_os_str().is_empty() {
                    PathBuf::from(format!("{}\\", part))
                } else {
                    base.join(part)
                };
                next_paths.push(p);
            }
        }
        current_paths = next_paths;
    }

    current_paths.into_iter().filter(|p| p.exists()).collect()
}

fn regex_lite(pat: &str) -> String {
    format!("(?i)^{}$", pat)
}

fn regex_match(pattern: &str, text: &str) -> bool {
    let simple_pat = pattern.trim_start_matches("(?i)^").trim_end_matches('$');
    if simple_pat == ".*" {
        return true;
    }
    if let Some(prefix) = simple_pat.strip_suffix(".*") {
        return text.to_lowercase().starts_with(&prefix.to_lowercase());
    }
    if let Some(suffix) = simple_pat.strip_prefix(".*") {
        return text.to_lowercase().ends_with(&suffix.to_lowercase());
    }
    text.eq_ignore_ascii_case(simple_pat)
}

/// 初始化加载内置规则与自定义规则
pub fn load_rules() {
    let mut all_rules = Vec::new();

    let sys_str = include_str!("../rules/system.json");
    if let Ok(sys_rules) = serde_json::from_str::<Vec<Rule>>(sys_str) {
        all_rules.extend(sys_rules);
    }

    let dev_str = include_str!("../rules/dev_browser.json");
    if let Ok(dev_rules) = serde_json::from_str::<Vec<Rule>>(dev_str) {
        all_rules.extend(dev_rules);
    }

    let app_str = include_str!("../rules/apps.json");
    if let Ok(app_rules) = serde_json::from_str::<Vec<Rule>>(app_str) {
        all_rules.extend(app_rules);
    }

    // 用户自定义规则：读取 %APPDATA%\com.cspace.app\custom_rules.json
    if let Ok(app_data) = std::env::var("APPDATA") {
        let custom_file = Path::new(&app_data).join("com.cspace.app").join("custom_rules.json");
        if custom_file.exists() {
            if let Ok(content) = fs::read_to_string(custom_file) {
                if let Ok(user_rules) = serde_json::from_str::<Vec<Rule>>(&content) {
                    all_rules.extend(user_rules);
                }
            }
        }
    }

    let mut lock = RULES_REGISTRY.write().unwrap();
    *lock = all_rules;
}

pub fn get_all_rules() -> Vec<Rule> {
    RULES_REGISTRY.read().unwrap().clone()
}

/// 解析所有建议搬家的目标路径
pub fn get_migrate_targets() -> Vec<ResolvedTarget> {
    let rules = get_all_rules();
    let mut targets = Vec::new();

    for rule in rules.into_iter().filter(|r| r.migratable) {
        for path_pattern in &rule.paths {
            let matched_paths = resolve_wildcards(path_pattern);
            for p in matched_paths {
                targets.push(ResolvedTarget {
                    rule_id: rule.id.clone(),
                    name: rule.name.clone(),
                    category: rule.category.clone(),
                    path: p.to_string_lossy().to_string(),
                    purpose: rule.purpose.clone(),
                    risk: rule.risk.clone(),
                    risk_note: rule.risk_note.clone(),
                    cleanable: rule.cleanable,
                    clean_target: rule.clean_target.clone().unwrap_or(CleanTarget::Contents),
                    min_age_days: rule.min_age_days,
                    migratable: true,
                    migrate_note: rule.migrate_note.clone(),
                    processes: rule.processes.clone(),
                    is_heuristic: false,
                });
            }
        }
    }
    targets
}

/// 解析所有可清理的目标路径
pub fn get_clean_targets() -> Vec<ResolvedTarget> {
    let rules = get_all_rules();
    let mut targets = Vec::new();

    for rule in rules.into_iter().filter(|r| r.cleanable) {
        for path_pattern in &rule.paths {
            let matched_paths = resolve_wildcards(path_pattern);
            for p in matched_paths {
                targets.push(ResolvedTarget {
                    rule_id: rule.id.clone(),
                    name: rule.name.clone(),
                    category: rule.category.clone(),
                    path: p.to_string_lossy().to_string(),
                    purpose: rule.purpose.clone(),
                    risk: rule.risk.clone(),
                    risk_note: rule.risk_note.clone(),
                    cleanable: true,
                    clean_target: rule.clean_target.clone().unwrap_or(CleanTarget::Contents),
                    min_age_days: rule.min_age_days,
                    migratable: rule.migratable,
                    migrate_note: rule.migrate_note.clone(),
                    processes: rule.processes.clone(),
                    is_heuristic: false,
                });
            }
        }
    }
    targets
}

/// 匹配某路径是否符合已知规则或启发式规则
pub fn match_path(path: &Path) -> Option<ResolvedTarget> {
    let path_str = path.to_string_lossy();
    let path_norm = path_str.to_lowercase().replace('/', "\\");
    let rules = get_all_rules();

    for rule in rules {
        for pattern in &rule.paths {
            let expanded = expand_macros(pattern).to_lowercase().replace('/', "\\");
            if pattern.contains('*') {
                let resolved = resolve_wildcards(pattern);
                for r in resolved {
                    if r.to_string_lossy().eq_ignore_ascii_case(&path_str) {
                        return Some(ResolvedTarget {
                            rule_id: rule.id.clone(),
                            name: rule.name.clone(),
                            category: rule.category.clone(),
                            path: path_str.to_string(),
                            purpose: rule.purpose.clone(),
                            risk: rule.risk.clone(),
                            risk_note: rule.risk_note.clone(),
                            cleanable: rule.cleanable,
                            clean_target: rule.clean_target.clone().unwrap_or(CleanTarget::Contents),
                            min_age_days: rule.min_age_days,
                            migratable: rule.migratable,
                            migrate_note: rule.migrate_note.clone(),
                            processes: rule.processes.clone(),
                            is_heuristic: false,
                        });
                    }
                }
            } else if path_norm == expanded || path_norm.starts_with(&format!("{}\\", expanded)) {
                return Some(ResolvedTarget {
                    rule_id: rule.id.clone(),
                    name: rule.name.clone(),
                    category: rule.category.clone(),
                    path: path_str.to_string(),
                    purpose: rule.purpose.clone(),
                    risk: rule.risk.clone(),
                    risk_note: rule.risk_note.clone(),
                    cleanable: rule.cleanable,
                    clean_target: rule.clean_target.clone().unwrap_or(CleanTarget::Contents),
                    min_age_days: rule.min_age_days,
                    migratable: rule.migratable,
                    migrate_note: rule.migrate_note.clone(),
                    processes: rule.processes.clone(),
                    is_heuristic: false,
                });
            }
        }
    }

    // 启发式检测
    let file_name = path.file_name()?.to_string_lossy().to_lowercase();
    if file_name.contains("cache") || file_name.ends_with(".log") || file_name == "logs" || file_name == "temp" || file_name == "tmp" {
        return Some(ResolvedTarget {
            rule_id: format!("heuristic-{}", file_name),
            name: format!("疑似缓存/日志: {}", path.file_name()?.to_string_lossy()),
            category: "heuristic".into(),
            path: path_str.to_string(),
            purpose: "根据名称特征推断为软件临时缓存或运行日志".into(),
            risk: RiskLevel::Caution,
            risk_note: "此为启发式识别出的缓存，清理通常安全但请自行核实文件内容".into(),
            cleanable: true,
            clean_target: CleanTarget::Contents,
            min_age_days: None,
            migratable: true,
            migrate_note: Some("支持搬迁到其他盘".into()),
            processes: vec![],
            is_heuristic: true,
        });
    }

    None
}

