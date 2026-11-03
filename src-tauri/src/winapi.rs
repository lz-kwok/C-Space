//! Windows 原生 API 薄封装：管理员检测/提权、磁盘信息、进程枚举、Restart Manager 占用检测、结束进程。

use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows_sys::Win32::Foundation::{CloseHandle, ERROR_MORE_DATA, ERROR_SUCCESS, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows_sys::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW, SetFileAttributesW};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::RestartManager::{
    RmEndSession, RmGetList, RmRegisterResources, RmStartSession, CCH_RM_SESSION_KEY, RM_PROCESS_INFO,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcess, OpenProcessToken, TerminateProcess, PROCESS_TERMINATE};
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

pub fn wide(s: impl AsRef<OsStr>) -> Vec<u16> {
    s.as_ref().encode_wide().chain(std::iter::once(0)).collect()
}

fn from_wide(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

/// 当前进程是否以管理员身份（已提升）运行
pub fn is_elevated() -> bool {
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut ret_len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut core::ffi::c_void,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

/// 以管理员身份重新启动自身（触发 UAC）
pub fn relaunch_as_admin() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let verb = wide("runas");
    let file = wide(exe.as_os_str());
    let r = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if (r as isize) > 32 {
        Ok(())
    } else {
        Err("用户取消了 UAC 授权或启动失败".into())
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub letter: String,
    pub root: String,
    pub label: String,
    pub kind: String,
    pub total: u64,
    pub free: u64,
}

pub fn disk_space(path: &Path) -> Option<(u64, u64)> {
    // 取路径所在盘根
    let s = path.to_string_lossy();
    let root = if s.len() >= 2 && s.as_bytes()[1] == b':' { format!("{}\\", &s[..2]) } else { s.to_string() };
    let w = wide(&root);
    let (mut avail, mut total, mut free) = (0u64, 0u64, 0u64);
    let ok = unsafe { GetDiskFreeSpaceExW(w.as_ptr(), &mut avail, &mut total, &mut free) };
    if ok != 0 { Some((total, avail)) } else { None }
}

pub fn list_drives() -> Vec<DriveInfo> {
    let mask = unsafe { GetLogicalDrives() };
    let mut out = vec![];
    for i in 0..26u32 {
        if mask & (1 << i) == 0 {
            continue;
        }
        let letter = ((b'A' + i as u8) as char).to_string();
        let root = format!("{}:\\", letter);
        let w = wide(&root);
        let t = unsafe { GetDriveTypeW(w.as_ptr()) };
        let kind = match t {
            2 => "removable",
            3 => "fixed",
            4 => "network",
            _ => continue,
        };
        let mut label_buf = [0u16; 261];
        unsafe {
            GetVolumeInformationW(
                w.as_ptr(),
                label_buf.as_mut_ptr(),
                label_buf.len() as u32,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
            );
        }
        let (total, free) = disk_space(Path::new(&root)).unwrap_or((0, 0));
        out.push(DriveInfo { letter, root, label: from_wide(&label_buf), kind: kind.into(), total, free });
    }
    out
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    /// "lock" = Restart Manager 检测到占用；"rule" = 规则声明的关联进程正在运行
    pub source: String,
}

/// 枚举所有进程 (pid, exe 名)
pub fn list_processes() -> Vec<(u32, String)> {
    let mut out = vec![];
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut pe: PROCESSENTRY32W = std::mem::zeroed();
        pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut pe) != 0 {
            loop {
                out.push((pe.th32ProcessID, from_wide(&pe.szExeFile)));
                if Process32NextW(snap, &mut pe) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
    }
    out
}

/// 查找规则声明的关联进程中正在运行的
pub fn running_by_names(names: &[String]) -> Vec<ProcInfo> {
    if names.is_empty() {
        return vec![];
    }
    let lower: Vec<String> = names.iter().map(|n| n.to_lowercase()).collect();
    list_processes()
        .into_iter()
        .filter(|(_, n)| lower.contains(&n.to_lowercase()))
        .map(|(pid, name)| ProcInfo { pid, name, source: "rule".into() })
        .collect()
}

/// 使用 Restart Manager 检测哪些进程占用了给定文件
pub fn find_lockers(files: &[std::path::PathBuf]) -> Vec<ProcInfo> {
    if files.is_empty() {
        return vec![];
    }
    let mut out: Vec<ProcInfo> = vec![];
    unsafe {
        let mut session = 0u32;
        let mut key = [0u16; CCH_RM_SESSION_KEY as usize + 1];
        if RmStartSession(&mut session, 0, key.as_mut_ptr()) != ERROR_SUCCESS {
            return out;
        }
        let wides: Vec<Vec<u16>> = files.iter().map(|f| wide(f.as_os_str())).collect();
        for chunk in wides.chunks(500) {
            let ptrs: Vec<*const u16> = chunk.iter().map(|w| w.as_ptr()).collect();
            RmRegisterResources(session, ptrs.len() as u32, ptrs.as_ptr(), 0, std::ptr::null(), 0, std::ptr::null());
        }
        let mut needed = 0u32;
        let mut count = 0u32;
        let mut reasons = 0u32;
        let mut infos: Vec<RM_PROCESS_INFO> = vec![];
        for _ in 0..5 {
            let r = RmGetList(session, &mut needed, &mut count, if infos.is_empty() { std::ptr::null_mut() } else { infos.as_mut_ptr() }, &mut reasons);
            if r == ERROR_MORE_DATA {
                infos = vec![std::mem::zeroed(); needed as usize];
                count = needed;
                continue;
            }
            if r == ERROR_SUCCESS {
                for info in infos.iter().take(count as usize) {
                    let pid = info.Process.dwProcessId;
                    if pid == std::process::id() || out.iter().any(|p| p.pid == pid) {
                        continue;
                    }
                    out.push(ProcInfo { pid, name: from_wide(&info.strAppName), source: "lock".into() });
                }
            }
            break;
        }
        RmEndSession(session);
    }
    // 用 exe 名补全显示名
    let procs = list_processes();
    for p in out.iter_mut() {
        if let Some((_, exe)) = procs.iter().find(|(pid, _)| *pid == p.pid) {
            if p.name.is_empty() {
                p.name = exe.clone();
            } else if !p.name.eq_ignore_ascii_case(exe) {
                p.name = format!("{} ({})", p.name, exe);
            }
        }
    }
    out
}

pub fn kill_process(pid: u32) -> Result<(), String> {
    if pid == std::process::id() {
        return Err("不能结束自身".into());
    }
    unsafe {
        let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if h.is_null() {
            return Err(format!("无法打开进程 {}（可能需要管理员权限）", pid));
        }
        let ok = TerminateProcess(h, 1);
        CloseHandle(h);
        if ok == 0 {
            return Err(format!("结束进程 {} 失败", pid));
        }
    }
    Ok(())
}

pub fn set_attributes(path: &Path, attrs: u32) {
    let w = wide(path.as_os_str());
    unsafe {
        SetFileAttributesW(w.as_ptr(), attrs);
    }
}

