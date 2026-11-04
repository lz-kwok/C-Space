//! 原生 Windows NTFS MFT (主文件表) 极速秒读与内存树索引引擎
//!
//! 工作原理：
//! 1. 提权后打开物理卷句柄 `\\.\C:`；
//! 2. 调用 `FSCTL_GET_NTFS_VOLUME_DATA` (0x00090064) 获取簇大小与 $MFT 起始簇号；
//! 3. 读取第 0 号记录（$MFT 自身的元数据），解析其 $DATA (0x80) 属性的 Data Runs 簇运行列表；
//! 4. 按簇运行列表快速顺序读取全部 MFT 记录（每条 1024 字节，校验 "FILE" 魔数并应用 Fixup 修复）；
//! 5. 解析 $FILE_NAME (0x30) 与 $DATA (0x80) 属性，提取父目录 MFT 引用、真实文件大小、修改时间与文件名；
//! 6. 自底向上 O(N) 累加计算全部分区目录的递归体积与文件数；
//! 7. 构建秒级索引，支持瞬间提取任意目录层级（耗时 < 1ms），并在离开视图时彻底释放内存。

use std::collections::HashMap;
use std::ffi::c_void;
use std::fs;
use std::mem::size_of;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;

use once_cell::sync::Lazy;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, GetVolumeInformationW, ReadFile, SetFilePointerEx, FILE_BEGIN, FILE_SHARE_READ,
    FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows_sys::Win32::System::IO::DeviceIoControl;

use crate::rules::match_path;
use crate::scanner::FileNode;
use crate::winapi::wide;

/// NTFS 卷数据缓冲区结构
#[repr(C)]
#[derive(Debug, Default, Clone, Copy)]
pub struct NTFS_VOLUME_DATA_BUFFER {
    pub volume_serial_number: i64,
    pub number_sectors: i64,
    pub total_clusters: i64,
    pub free_clusters: i64,
    pub total_reserved: i64,
    pub bytes_per_sector: u32,
    pub bytes_per_cluster: u32,
    pub bytes_per_file_record_segment: u32,
    pub clusters_per_file_record_segment: u32,
    pub mft_valid_data_length: i64,
    pub mft_start_lcn: i64,
    pub mft2_start_lcn: i64,
    pub mft_zone_start: i64,
    pub mft_zone_end: i64,
}

const FSCTL_GET_NTFS_VOLUME_DATA: u32 = 0x00090064;
const FILE_RECORD_MAGIC: u32 = 0x454C4946; // "FILE"
const ATTR_STANDARD_INFORMATION: u32 = 0x10;
const ATTR_FILE_NAME: u32 = 0x30;
const ATTR_DATA: u32 = 0x80;
const ATTR_END: u32 = 0xFFFFFFFF;
const MFT_ROOT_INDEX: u64 = 5; // NTFS 根目录始终为第 5 号记录

/// 检查给定驱动器是否为 NTFS 格式
pub fn is_ntfs_drive(drive_letter: char) -> bool {
    let root = format!("{}:\\", drive_letter);
    let w = wide(&root);
    let mut fs_buf = [0u16; 64];
    let ok = unsafe {
        GetVolumeInformationW(
            w.as_ptr(),
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            fs_buf.as_mut_ptr(),
            fs_buf.len() as u32,
        )
    };
    if ok != 0 {
        let len = fs_buf.iter().position(|&c| c == 0).unwrap_or(fs_buf.len());
        let fs_name = String::from_utf16_lossy(&fs_buf[..len]);
        fs_name.eq_ignore_ascii_case("NTFS")
    } else {
        false
    }
}

/// 紧凑的 MFT 记录项
#[derive(Debug, Clone)]
pub struct MftEntry {
    pub id: u64,
    pub parent_id: u64,
    pub name: String,
    pub size: u64,
    pub file_count: u64,
    pub is_dir: bool,
    pub days_since_modified: u32,
}

/// 整个卷的 MFT 内存树缓存
pub struct MftVolumeTree {
    pub drive: char,
    pub entries: Vec<MftEntry>,
    pub id_to_index: HashMap<u64, usize>,
    pub children_map: HashMap<u64, Vec<usize>>,
    pub root_id: u64,
}

static GLOBAL_MFT_CACHE: Lazy<Mutex<Option<MftVolumeTree>>> = Lazy::new(|| Mutex::new(None));

/// 清空全局 MFT 内存缓存，离开页面时释放全部内存
pub fn clear_mft_cache() {
    let mut lock = GLOBAL_MFT_CACHE.lock().unwrap();
    *lock = None;
}

/// 打开卷的原始读取句柄
fn open_volume(drive_letter: char) -> Result<HANDLE, String> {
    let volume_path = format!(r"\\.\{}:", drive_letter.to_ascii_uppercase());
    let w = wide(&volume_path);
    let handle = unsafe {
        CreateFileW(
            w.as_ptr(),
            0x80000000u32 /* GENERIC_READ */,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            0,
            0 as HANDLE,
        )
    };

    if handle == INVALID_HANDLE_VALUE {
        Err(format!(
            "无法打开磁盘 \\\\.\\{}: 卷句柄，可能需要管理员权限",
            drive_letter
        ))
    } else {
        Ok(handle)
    }
}

/// 获取 NTFS 卷基本信息
fn get_ntfs_volume_data(handle: HANDLE) -> Result<NTFS_VOLUME_DATA_BUFFER, String> {
    let mut data: NTFS_VOLUME_DATA_BUFFER = Default::default();
    let mut bytes_returned = 0u32;
    let ok = unsafe {
        DeviceIoControl(
            handle,
            FSCTL_GET_NTFS_VOLUME_DATA,
            std::ptr::null(),
            0,
            &mut data as *mut _ as *mut c_void,
            size_of::<NTFS_VOLUME_DATA_BUFFER>() as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        )
    };
    if ok != 0 && bytes_returned >= size_of::<NTFS_VOLUME_DATA_BUFFER>() as u32 {
        Ok(data)
    } else {
        Err("获取 NTFS 卷信息失败".into())
    }
}

/// 从卷指定绝对字节偏移读取数据
fn read_volume_bytes(handle: HANDLE, offset: i64, buffer: &mut [u8]) -> Result<(), String> {
    let mut new_pos = 0i64;
    let ok = unsafe { SetFilePointerEx(handle, offset, &mut new_pos, FILE_BEGIN) };
    if ok == 0 {
        return Err(format!("卷指针定位失败: offset={}", offset));
    }
    let mut bytes_read = 0u32;
    let ok = unsafe {
        ReadFile(
            handle,
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            &mut bytes_read,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 || bytes_read != buffer.len() as u32 {
        return Err(format!("从卷读取数据失败: read {}/{}", bytes_read, buffer.len()));
    }
    Ok(())
}

/// 解析 NTFS Data Runs 簇运行列表
/// 返回 Vec<(起始簇号 LCN, 簇数量)>
fn parse_data_runs(data: &[u8]) -> Vec<(i64, u64)> {
    let mut runs = Vec::new();
    let mut pos = 0;
    let mut current_lcn: i64 = 0;

    while pos < data.len() {
        let header = data[pos];
        if header == 0 {
            break;
        }
        pos += 1;

        let len_bytes = (header & 0x0F) as usize;
        let offset_bytes = ((header >> 4) & 0x0F) as usize;

        if len_bytes == 0 || pos + len_bytes + offset_bytes > data.len() {
            break;
        }

        // 读取簇长度
        let mut count: u64 = 0;
        for i in 0..len_bytes {
            count |= (data[pos + i] as u64) << (i * 8);
        }
        pos += len_bytes;

        // 读取 LCN 偏移量 (有符号整数，补码扩展)
        if offset_bytes > 0 {
            let mut lcn_offset: i64 = 0;
            for i in 0..offset_bytes {
                lcn_offset |= (data[pos + i] as i64) << (i * 8);
            }
            // 符号扩展
            if (data[pos + offset_bytes - 1] & 0x80) != 0 {
                for i in offset_bytes..8 {
                    lcn_offset |= (-1i64) ^ ((1i64 << (i * 8)) - 1);
                }
            }
            pos += offset_bytes;
            current_lcn += lcn_offset;
            runs.push((current_lcn, count));
        } else {
            // 稀疏簇 (Sparse)
            runs.push((0, count));
        }
    }

    runs
}

/// 应用 NTFS Fixup 校验与扇区末尾修复
fn apply_fixup(record: &mut [u8], bytes_per_sector: usize) -> bool {
    if record.len() < 48 {
        return false;
    }
    let usa_offset = u16::from_le_bytes([record[4], record[5]]) as usize;
    let usa_count = u16::from_le_bytes([record[6], record[7]]) as usize;

    if usa_count < 2 || usa_offset + usa_count * 2 > record.len() {
        return false;
    }

    let check_word = [record[usa_offset], record[usa_offset + 1]];
    let num_sectors = (record.len() / bytes_per_sector).min(usa_count - 1);

    for i in 0..num_sectors {
        let sector_end = (i + 1) * bytes_per_sector;
        if sector_end > record.len() {
            break;
        }
        let word_pos = usa_offset + (i + 1) * 2;
        // 校验扇区尾部两字节是否匹配 check_word
        if record[sector_end - 2] != check_word[0] || record[sector_end - 1] != check_word[1] {
            return false;
        }
        // 替换还原原始字节
        record[sector_end - 2] = record[word_pos];
        record[sector_end - 1] = record[word_pos + 1];
    }

    true
}

/// 解析单个 MFT 记录 (1024 字节)
fn parse_mft_record(record: &mut [u8], record_id: u64, bytes_per_sector: usize) -> Option<MftEntry> {
    if record.len() < 1024 {
        return None;
    }

    // 检查 "FILE" 魔数 (0x454C4946)
    let magic = u32::from_le_bytes([record[0], record[1], record[2], record[3]]);
    if magic != FILE_RECORD_MAGIC {
        return None;
    }

    // 应用 Fixup
    if !apply_fixup(record, bytes_per_sector) {
        return None;
    }

    // 检查是否正在使用 (flags & 0x01 != 0)
    let flags = u16::from_le_bytes([record[22], record[23]]);
    if flags & 0x01 == 0 {
        return None; // 未使用的记录 (已删除)
    }
    let mut is_dir = (flags & 0x02) != 0;

    let first_attr_offset = u16::from_le_bytes([record[20], record[21]]) as usize;
    let mut offset = first_attr_offset;

    let mut parent_id: u64 = 0;
    let mut name = String::new();
    let mut best_namespace = 0u8;
    let mut real_size: u64 = 0;
    let mut data_size: Option<u64> = None;
    let mut modified_time: u64 = 0;

    while offset + 8 <= record.len() {
        let attr_type = u32::from_le_bytes([
            record[offset],
            record[offset + 1],
            record[offset + 2],
            record[offset + 3],
        ]);
        if attr_type == ATTR_END || attr_type == 0 {
            break;
        }

        let attr_len = u32::from_le_bytes([
            record[offset + 4],
            record[offset + 5],
            record[offset + 6],
            record[offset + 7],
        ]) as usize;

        if attr_len == 0 || offset + attr_len > record.len() {
            break;
        }

        let non_resident = record[offset + 8] != 0;

        match attr_type {
            ATTR_STANDARD_INFORMATION => {
                if !non_resident && attr_len >= 24 {
                    let val_offset = u16::from_le_bytes([record[offset + 20], record[offset + 21]]) as usize;
                    if offset + val_offset + 16 <= record.len() {
                        let mod_t = u64::from_le_bytes(
                            record[offset + val_offset + 8..offset + val_offset + 16]
                                .try_into()
                                .unwrap_or_default(),
                        );
                        if mod_t > 0 {
                            modified_time = mod_t;
                        }
                    }
                }
            }
            ATTR_FILE_NAME => {
                // $FILE_NAME 属性恒为常驻
                if !non_resident {
                    let val_offset = u16::from_le_bytes([record[offset + 20], record[offset + 21]]) as usize;
                    let val_len = u32::from_le_bytes([
                        record[offset + 16],
                        record[offset + 17],
                        record[offset + 18],
                        record[offset + 19],
                    ]) as usize;

                    let fn_base = offset + val_offset;
                    if fn_base + 66 <= record.len() && val_len >= 66 {
                        let p_ref = u64::from_le_bytes(record[fn_base..fn_base + 8].try_into().unwrap_or_default());
                        let p_id = p_ref & 0x0000_FFFF_FFFF_FFFF;

                        let mod_t = u64::from_le_bytes(record[fn_base + 16..fn_base + 24].try_into().unwrap_or_default());
                        if modified_time == 0 {
                            modified_time = mod_t;
                        }

                        let r_size = u64::from_le_bytes(record[fn_base + 40..fn_base + 48].try_into().unwrap_or_default());
                        let file_flags = u32::from_le_bytes(record[fn_base + 56..fn_base + 60].try_into().unwrap_or_default());
                        if (file_flags & 0x10000000) != 0 || (file_flags & 0x00000010) != 0 {
                            is_dir = true;
                        }

                        let name_len = record[fn_base + 64] as usize;
                        let namespace = record[fn_base + 65];

                        // 避免被 DOS 8.3 覆盖 Win32 名称
                        if name.is_empty() || namespace == 1 || namespace == 3 || (namespace == 0 && best_namespace == 2) {
                            if fn_base + 66 + name_len * 2 <= record.len() {
                                let mut u16_chars = Vec::with_capacity(name_len);
                                for i in 0..name_len {
                                    let c = u16::from_le_bytes([
                                        record[fn_base + 66 + i * 2],
                                        record[fn_base + 66 + i * 2 + 1],
                                    ]);
                                    u16_chars.push(c);
                                }
                                let parsed_name = String::from_utf16_lossy(&u16_chars);
                                if !parsed_name.is_empty() {
                                    name = parsed_name;
                                    parent_id = p_id;
                                    real_size = r_size;
                                    best_namespace = namespace;
                                }
                            }
                        }
                    }
                }
            }
            ATTR_DATA => {
                // 若有未命名 $DATA 属性，提取真实文件大小
                let name_len = record[offset + 9] as usize;
                if name_len == 0 {
                    if non_resident {
                        if offset + 56 <= record.len() {
                            let size = u64::from_le_bytes(record[offset + 48..offset + 56].try_into().unwrap_or_default());
                            data_size = Some(size);
                        }
                    } else {
                        if offset + 20 <= record.len() {
                            let size = u32::from_le_bytes(record[offset + 16..offset + 20].try_into().unwrap_or_default()) as u64;
                            data_size = Some(size);
                        }
                    }
                }
            }
            _ => {}
        }

        offset += attr_len;
    }

    if name.is_empty() {
        return None;
    }

    // Windows FILETIME 转换为天数 (自 1601-01-01 至今的 100ns 间隔)
    let days_since_modified = if modified_time > 0 {
        let unix_secs = (modified_time.saturating_sub(116444736000000000)) / 10_000_000;
        let now_secs = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        if now_secs > unix_secs {
            ((now_secs - unix_secs) / 86400) as u32
        } else {
            0
        }
    } else {
        0
    };

    let size = if is_dir {
        0
    } else {
        data_size.unwrap_or(real_size)
    };

    Some(MftEntry {
        id: record_id,
        parent_id,
        name,
        size,
        file_count: if is_dir { 0 } else { 1 },
        is_dir,
        days_since_modified,
    })
}

/// 扫描并构建指定 NTFS 驱动器的完整 MFT 内存树
pub fn scan_volume_mft(drive_letter: char) -> Result<(), String> {
    let drive = drive_letter.to_ascii_uppercase();

    // 检查是否已缓存
    {
        let lock = GLOBAL_MFT_CACHE.lock().unwrap();
        if let Some(ref cached) = *lock {
            if cached.drive == drive {
                return Ok(());
            }
        }
    }

    let handle = open_volume(drive)?;
    let vol_data = match get_ntfs_volume_data(handle) {
        Ok(d) => d,
        Err(e) => {
            unsafe { CloseHandle(handle) };
            return Err(e);
        }
    };

    let bytes_per_cluster = vol_data.bytes_per_cluster as u64;
    let bytes_per_record = vol_data.bytes_per_file_record_segment as usize;
    let bytes_per_sector = vol_data.bytes_per_sector as usize;

    if bytes_per_record < 512 || bytes_per_cluster < 512 {
        unsafe { CloseHandle(handle) };
        return Err("NTFS 记录或簇尺寸异常".into());
    }

    // 1. 读取 $MFT 自身的记录 (Record 0)
    let mft0_offset = vol_data.mft_start_lcn * bytes_per_cluster as i64;
    let mut mft0_buf = vec![0u8; bytes_per_record];
    if let Err(e) = read_volume_bytes(handle, mft0_offset, &mut mft0_buf) {
        unsafe { CloseHandle(handle) };
        return Err(format!("读取 $MFT 元数据失败: {}", e));
    }

    // 2. 校验并解析 Record 0，寻找 $DATA 属性的 Data Runs
    apply_fixup(&mut mft0_buf, bytes_per_sector);
    let mut offset = u16::from_le_bytes([mft0_buf[20], mft0_buf[21]]) as usize;
    let mut data_runs_raw = Vec::new();

    while offset + 8 <= mft0_buf.len() {
        let attr_type = u32::from_le_bytes([
            mft0_buf[offset],
            mft0_buf[offset + 1],
            mft0_buf[offset + 2],
            mft0_buf[offset + 3],
        ]);
        if attr_type == ATTR_END || attr_type == 0 {
            break;
        }
        let attr_len = u32::from_le_bytes([
            mft0_buf[offset + 4],
            mft0_buf[offset + 5],
            mft0_buf[offset + 6],
            mft0_buf[offset + 7],
        ]) as usize;
        if attr_len == 0 || offset + attr_len > mft0_buf.len() {
            break;
        }

        if attr_type == ATTR_DATA {
            let non_resident = mft0_buf[offset + 8] != 0;
            if non_resident {
                let run_offset = u16::from_le_bytes([mft0_buf[offset + 32], mft0_buf[offset + 33]]) as usize;
                if offset + run_offset < mft0_buf.len() {
                    data_runs_raw = mft0_buf[offset + run_offset..offset + attr_len].to_vec();
                    break;
                }
            }
        }
        offset += attr_len;
    }

    let runs = parse_data_runs(&data_runs_raw);
    if runs.is_empty() {
        unsafe { CloseHandle(handle) };
        return Err("解析 $MFT 簇运行列表失败".into());
    }

    // 3. 顺序分块读取并解析全部 MFT 记录
    let mut entries = Vec::with_capacity(250_000);
    let mut current_record_id: u64 = 0;

    // 采用 2MB 缓冲区连续批量读取
    const CHUNK_SIZE: usize = 2 * 1024 * 1024;
    let mut chunk_buf = vec![0u8; CHUNK_SIZE];

    for (lcn, cluster_count) in runs {
        if lcn == 0 {
            // 稀疏簇，跳过对应记录数
            let sparse_records = (cluster_count * bytes_per_cluster) / bytes_per_record as u64;
            current_record_id += sparse_records;
            continue;
        }

        let run_bytes = cluster_count * bytes_per_cluster;
        let mut run_offset = lcn * bytes_per_cluster as i64;
        let mut remaining = run_bytes;

        while remaining > 0 {
            let to_read = (remaining as usize).min(CHUNK_SIZE);
            // 确保按记录边界读取
            let to_read_aligned = (to_read / bytes_per_record) * bytes_per_record;
            if to_read_aligned == 0 {
                break;
            }

            let slice = &mut chunk_buf[..to_read_aligned];
            if read_volume_bytes(handle, run_offset, slice).is_err() {
                break;
            }

            for rec in slice.chunks_exact_mut(bytes_per_record) {
                if let Some(entry) = parse_mft_record(rec, current_record_id, bytes_per_sector) {
                    entries.push(entry);
                }
                current_record_id += 1;
            }

            run_offset += to_read_aligned as i64;
            remaining -= to_read_aligned as u64;
        }
    }

    unsafe { CloseHandle(handle) };

    // 4. 构建索引并进行自底向上目录体积聚合
    let mut id_to_index = HashMap::with_capacity(entries.len());
    let mut children_map: HashMap<u64, Vec<usize>> = HashMap::with_capacity(entries.len() / 4);

    for (idx, entry) in entries.iter().enumerate() {
        id_to_index.insert(entry.id, idx);
        if entry.id != entry.parent_id {
            children_map.entry(entry.parent_id).or_default().push(idx);
        }
    }

    // 自底向上聚合所有子目录的总体积与文件数
    aggregate_tree_sizes(&mut entries, &children_map, MFT_ROOT_INDEX);

    // 存入全局缓存
    let tree = MftVolumeTree {
        drive,
        entries,
        id_to_index,
        children_map,
        root_id: MFT_ROOT_INDEX,
    };

    let mut lock = GLOBAL_MFT_CACHE.lock().unwrap();
    *lock = Some(tree);

    Ok(())
}

/// 递归聚合目录大小和文件数
fn aggregate_tree_sizes(
    entries: &mut [MftEntry],
    children_map: &HashMap<u64, Vec<usize>>,
    current_id: u64,
) -> (u64, u64) {
    let mut total_size = 0u64;
    let mut total_files = 0u64;

    if let Some(children_indices) = children_map.get(&current_id) {
        for &child_idx in children_indices {
            let child = &entries[child_idx];
            if child.is_dir {
                let child_id = child.id;
                let (sub_size, sub_files) = aggregate_tree_sizes(entries, children_map, child_id);
                entries[child_idx].size = sub_size;
                entries[child_idx].file_count = sub_files;
                total_size += sub_size;
                total_files += sub_files;
            } else {
                total_size += child.size;
                total_files += 1;
            }
        }
    }

    (total_size, total_files)
}

/// 根据目标路径从 MFT 缓存中毫秒级提取子项列表
pub fn get_mft_directory_children(target_path: &str) -> Result<Vec<FileNode>, String> {
    let path = Path::new(target_path);
    let drive_letter = target_path
        .chars()
        .next()
        .ok_or_else(|| "路径无效".to_string())?
        .to_ascii_uppercase();

    // 确保已扫描该分区
    scan_volume_mft(drive_letter)?;

    let lock = GLOBAL_MFT_CACHE.lock().unwrap();
    let tree = lock
        .as_ref()
        .ok_or_else(|| "MFT 缓存未就绪".to_string())?;

    // 解析 target_path 定位目标节点 ID
    let mut target_id = tree.root_id;

    // 提取相对根目录的子组件
    let mut components = Vec::new();
    for c in path.components() {
        let s = c.as_os_str().to_string_lossy();
        if !s.contains(':') && s != "\\" && s != "/" {
            components.push(s.to_string());
        }
    }

    for comp in components {
        let mut found_id = None;
        if let Some(children) = tree.children_map.get(&target_id) {
            for &idx in children {
                let entry = &tree.entries[idx];
                if entry.is_dir && entry.name.eq_ignore_ascii_case(&comp) {
                    found_id = Some(entry.id);
                    break;
                }
            }
        }
        match found_id {
            Some(id) => target_id = id,
            None => {
                // 如果在 MFT 树中未找到特定深层子目录，返回降级指示
                return Err(format!("MFT 树中未找到子目录: {}", comp));
            }
        }
    }

    // 提取 target_id 的所有直接子项
    let mut result = Vec::new();
    if let Some(children_indices) = tree.children_map.get(&target_id) {
        for &idx in children_indices {
            let entry = &tree.entries[idx];
            let child_path = if target_path.ends_with('\\') || target_path.ends_with('/') {
                format!("{}{}", target_path, entry.name)
            } else {
                format!("{}\\{}", target_path, entry.name)
            };

            let matched = match_path(Path::new(&child_path));
            let (purpose, risk, risk_note, cleanable, migratable) = match matched {
                Some(r) => (
                    Some(r.purpose.clone()),
                    Some(r.risk),
                    Some(r.risk_note.clone()),
                    r.cleanable,
                    r.migratable,
                ),
                None => (None, None, None, false, false),
            };

            let has_children = if entry.is_dir {
                tree.children_map.get(&entry.id).map_or(false, |c| !c.is_empty())
            } else {
                false
            };

            result.push(FileNode {
                name: entry.name.clone(),
                path: child_path,
                is_dir: entry.is_dir,
                size: entry.size,
                file_count: entry.file_count,
                is_link: false,
                link_target: None,
                purpose,
                risk,
                risk_note,
                cleanable,
                migratable,
                is_heuristic: false,
                has_children,
                modified_time: None,
                days_since_modified: Some(entry.days_since_modified),
            });
        }
    }

    // 按体积降序排列
    result.sort_by(|a, b| b.size.cmp(&a.size));

    Ok(result)
}
