# NTFS MFT 秒读引擎与智能提权联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建原生 NTFS `$MFT` (Master File Table) 极速秒读与内存树索引引擎，支持 0.5 秒全盘/分区层级体积秒级构建，实现未提权自动引导 UAC 提权，并在离开视图时自动释放内存。

**Architecture:** 
1. 在 Rust 后端编写 `src-tauri/src/mft.rs` 模块，通过 Win32 API (`\\.\<Volume>`, `FSCTL_GET_NTFS_VOLUME_DATA`, 原始 MFT 簇流连续读取与 1024 字节记录解析) 提取 `ParentRef`, `RealSize`, `FileAttributes`, `ModifiedTime`, `FileName`；
2. 建立极轻量 `MftTree` 紧凑图结构（父子关系数组与子树体积聚合），单次 O(N) 累加计算全部分区目录真实占用；
3. 对外暴露 Tauri 指令 `scan_mft_partition(drive: String)` 与 `release_mft_cache()`，非管理员/非 NTFS 自动引导 UAC 提权并保留无缝 fallback；
4. 前端 `TreemapView.tsx` 与 `App.tsx` 联动：切到星系图时若为 NTFS 分区优先调用 MFT 秒级生成“星球图谱”与“星盘罗盘”，页面离开时调用 `release_mft_cache()` 自动销毁显存与内存树。

**Tech Stack:** Rust 2021, `windows-sys` (Win32 IO/Storage API), Tauri v2, React 19, TypeScript.

**Spec:** docs/superpowers/plans/2026-11-04-ntfs-mft-scanner.md

## Global Constraints

- 仅在管理员权限且为 NTFS 卷时启用 MFT 原始句柄读取；
- 非 NTFS 盘（FAT32/exFAT/外接移动设备）必须 100% 自动无缝降级走多核 `scan_dir_level_progressive`，绝不抛出未处理异常；
- MFT 记录解析器必须容错破损记录（校验 `"FILE"` 魔数 0x454C4946，跳过 Fixup 异常或无效记录）；
- 内存严格受控：解析完成后释放原始大缓冲区，仅保留扁平索引向量，离开星系图页面时前端 `useEffect` 销毁钩子触发后端缓存清空。

## Review Focus

1. **UAC 提权联动**：未提权状态下，点击透视是否正常弹出 Windows 提权弹窗并重启无缝衔接；
2. **非 NTFS 格式防御**：U 盘 (exFAT) 或 RAM 磁盘选择时，是否平滑降级而非报错卡死；
3. **MFT 卷锁与共享模式**：`CreateFileW` 必须使用 `FILE_SHARE_READ | FILE_SHARE_WRITE`，避免与系统文件锁定冲突；
4. **生命周期回收**：从星系图切换至“专项智能清理”或其他页面时，后端 MFT 内存树是否立即被清空归还；
5. **星球图谱与星盘展现**：0.5 秒解析完成后，Top-10 星球与外圈碎文件聚合扇区是否瞬间点亮并保持流畅交互。

---

### Task 1: 扩展 Windows API 依赖与 Win32 IO 控制支持

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Test: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 1.1**: 在 `src-tauri/Cargo.toml` 的 `windows-sys` features 中添加 `"Win32_System_IO"`，以便使用 `DeviceIoControl`。
- [ ] **Step 1.2**: 运行 `cargo check --manifest-path src-tauri/Cargo.toml` 验证编译。
- [ ] **Step 1.3**: Git commit: `chore: add Win32_System_IO to windows-sys features`.

---

### Task 2: 编写原生 NTFS MFT 卷解析引擎 `src-tauri/src/mft.rs`

**Files:**
- Create: `src-tauri/src/mft.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 2.1**: 定义 MFT 数据结构与常量：
  - `FILE_RECORD_HEADER` (Magic 0x454C4946)
  - `NTFS_VOLUME_DATA_BUFFER` 与 `FSCTL_GET_NTFS_VOLUME_DATA` (0x00090064)
  - `MftEntry` 紧凑节点：`id: u64`, `parent_id: u64`, `size: u64`, `is_dir: bool`, `modified_days: u32`, `name: String`
- [ ] **Step 2.2**: 实现打开卷句柄 `open_volume(drive_letter: char) -> Result<HANDLE, String>`，使用 `FILE_SHARE_READ | FILE_SHARE_WRITE`。
- [ ] **Step 2.3**: 实现通过 `FSCTL_GET_NTFS_VOLUME_DATA` 获取簇大小、MFT 起始 LCN 与有效数据长度。
- [ ] **Step 2.4**: 实现批量分块读取与 `$FILE_NAME` (0x30) 属性解析，提取真实文件大小与父目录 ID。
- [ ] **Step 2.5**: 实现层级树体积累加聚合：建立 `parent_id -> Vec<MftEntry>` 索引，单次自底向上计算各层级目录真实占用体积。
- [ ] **Step 2.6**: 实现目标目录提取函数 `get_directory_children(tree, target_path) -> Vec<FileNode>`。
- [ ] **Step 2.7**: 在 `src-tauri/src/lib.rs` 中声明 `mod mft;`，注册全局 `MftCache` 状态管理器。
- [ ] **Step 2.8**: 运行 `cargo check` 验证。
- [ ] **Step 2.9**: Git commit: `feat(mft): implement native NTFS MFT parser and hierarchical aggregator`.

---

### Task 3: 注册 MFT Tauri 指令与动态生命周期回收

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Test: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 3.1**: 编写 `scan_partition_mft(drive: String, target_dir: String)` 命令：
  - 检查当前是否为 NTFS 格式与管理员权限；
  - 若已缓存当前驱动器的 MFT 树，直接根据 `target_dir` 提取子项并返回；
  - 若未缓存，执行极速 MFT 解析构建树，存入 `MftCache` 并返回首层数据；
  - 若失败或非 NTFS，返回明确降级指示错误。
- [ ] **Step 3.2**: 编写 `clear_mft_cache()` 命令：清空当前驱动器的 MFT 内存树，彻底释放内存。
- [ ] **Step 3.3**: 在 `tauri::generate_handler!` 宏中注册两个新指令。
- [ ] **Step 3.4**: 运行 `cargo check` 验证编译。
- [ ] **Step 3.5**: Git commit: `feat(mft): expose scan_partition_mft and clear_mft_cache Tauri commands`.

---

### Task 4: 前端视图对接与未提权自动引导 UAC 提权

**Files:**
- Modify: `src/pages/TreemapView.tsx`
- Test: `npm run build`

- [ ] **Step 4.1**: 在 `TreemapView.tsx` 中优先调用 `scan_partition_mft`：
  - 若检测到用户未提权且处于 NTFS 磁盘，弹出友好提示引导一键点击“提权启用 MFT 极速模式”（调用 `trigger_admin_relaunch`）；
  - 若用户取消或不支持，无缝平滑回退至多核流式扫描。
- [ ] **Step 4.2**: 在组件卸载 `useEffect cleanup` 钩子中自动调用 `clear_mft_cache`，满足用户“离开页面后立即释放内存”的要求。
- [ ] **Step 4.3**: 在 MFT 极速模式生效时，顶部状态条显示“⚡ MFT 极速引擎 (0.3s)”，增强用户极致速度心智。
- [ ] **Step 4.4**: 运行 `npm run build` 确保 TypeScript 与前端构建 0 错误。
- [ ] **Step 4.5**: Git commit: `feat(frontend): integrate MFT scan engine, UAC promotion prompt, and auto-cleanup`.

---

### Task 5: 全面生产打包与验证测试

**Files:**
- Test: `npm run tauri build`
- Modify: `release/SHA256SUMS.txt`

- [ ] **Step 5.1**: 运行 `npm run tauri build` 构建完整 Release 安装包与便携版。
- [ ] **Step 5.2**: 复制生成物至 `release/C-Space_1.1.0_x64-setup.exe` 与 `portable.exe`。
- [ ] **Step 5.3**: 更新 `release/SHA256SUMS.txt` 并记录校验和。
- [ ] **Step 5.4**: Git commit & push 到 `v1.1.0` 分支与更新 Tag。

