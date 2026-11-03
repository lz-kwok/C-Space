# C-Space 工程上下文记忆库 (Mem0 Memory Store)

> **项目标识 (Project ID)**: `c-space`  
> **更新时间**: 2026-11-03  
> **记忆层级**: User / Session / Agent 决策上下文持久化

---

## 1. 核心需求与设计基准 (Requirements & Invariants)

1. **准确识别 C 盘目录下文件夹用途**：
   - 依赖内置指纹库（`system.json`, `dev_browser.json`, `apps.json`）+ 启发式正则（`cache`, `logs`, `temp` 等）兜底。
   - 覆盖首批重点软件：开发工具链（npm/pnpm/pip/cargo/gradle/VS Code/Cursor/JetBrains）、社交办公（微信/企业微信/QQ/钉钉/飞书/WPS）、浏览器（Chrome/Edge/Firefox）、设计与游戏多媒体（Adobe、剪映、网易云/QQ音乐、Steam/Epic 等）。

2. **多线程极速扫描与低内存架构 (关键优化点)**：
   - 使用流式单线程迭代器（`walkdir`），避免中间全量构造 `Vec<PathBuf>` 占用巨量内存。
   - **严格穿透跳过软链接 / Junction**：所有扫描和清理均通过 `get_link_info` 识别 Windows 重解析点，**绝不跟随**，防止跨盘重复计费以及误删外部实际存储内容。

3. **安全清理与三级风险防护**：
   - 🟢 安全清理 / 🟡 谨慎清理 / 🔴 高危禁删（系统核心与含个人数据的目录后端强制拦截禁止删除）。
   - 支持回收站 (`trash`) 与永久删除双模式。
   - 实时向前端广播 `clean-progress` 事件（当前处理文件、已释放字节、已删文件数、百分比）。

4. **AppData 软件目录无损搬家与无感重定向**：
   - 采用 **物理复制 ➔ 校验完整性 ➔ 原路径安全改名备份 ➔ 创建 Junction（`mklink /J`） ➔ 释放原空间** 事务。
   - 结合 Windows **Restart Manager API** 检测目标文件占用进程，支持一键安全结束进程。
   - 任一环节失败自动原子回滚。
   - 软件无需修改配置，后续新产生的缓存自动写入目标磁盘。
   - AppData 界面自动展示**「建议搬家目录推荐面板」**，检测已搬迁状态并支持一键预填与规划 Vault 目标路径。

5. **软链接生命周期管理与账本 (Ledger)**：
   - 独立工作台面板：记录通过本工具或外部创建的软链接，自动巡检断链（目标缺失）。
   - 支持一键原路迁回 C 盘并恢复。
   - 支持向导式创建：目录联接 (Junction)、目录符号链接 (`mklink /D`)、单文件符号链接 (`mklink`) 与硬链接。

---

## 2. 关键架构与技术选型决策 (Architecture Decisions)

- **框架选型**: Tauri v2 + React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons。
- **系统底层**: Rust 2021 + `windows-sys` (0.59) 原生 API：
  - 提权与管理员检测 (`OpenProcessToken`, `TOKEN_ELEVATION`, `ShellExecuteW("runas")`)；
  - 进程占用与管理 (`RmStartSession`, `RmRegisterResources`, `RmGetList`, `TerminateProcess`)；
  - 目录联接与重解析 (`junction::create`, `fs::symlink_metadata`, `reparse_point`)；
  - 磁盘空间与驱动器枚举 (`GetDiskFreeSpaceExW`, `GetLogicalDrives`, `GetDriveTypeW`)。
- **应用图标规范**:
  - Windows 原生窗口、任务栏、Alt+Tab 视图需在 Tauri 的 `setup` 周期中显式设置 `tauri::image::Image::from_app_icon_resource(256)`。
  - `src-tauri/icons/icon.ico` 必须包含多分辨率图层（16x16 到 256x256）。
- **权限清单策略**:
  - `app.dev.manifest`: `asInvoker`，确保在普通终端开发调试无需每次 UAC 弹窗中断。
  - `app.manifest`: `requireAdministrator`，Release 独立安装包强制管理员启动。

---

## 3. 代码仓库与版本控制状态

- **远程 Git 仓库**: `https://github.com/lz-kwok/C-Space.git`
- **默认分支**: `main`
- **提交历史**:
  - `7e84c0c`: `feat: initial commit for C-Space (C-drive cleanup & migration tool)`
- **本地忽略项 (`.gitignore`)**:
  - 包含 `node_modules`, `dist`, `src-tauri/target`, `src-tauri/gen`, `*.tsbuildinfo`, `.mem0/`, `*.log`。

