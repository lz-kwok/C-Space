<div align="center">

<img src="./src-tauri/icons/128x128.png" alt="C-Space Logo" width="100" height="100" />

# C-Space · C 盘清理与迁移工具

**基于 Tauri v2 + Rust + React 19 构建的高性能 Windows C 盘深度透视、安全清理与无损无感迁移工具**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue.svg)](#)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB.svg?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.97%2B-DEA584.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](./README_EN.md) · [简体中文](./README.md) · [架构设计文档](./ARCHITECTURE.md)

</div>

---

## 📖 项目简介

在 Windows 系统长期使用中，C 盘经常因各类软件无节制的缓存、包管理器依赖、聊天记录以及系统日志堆积而标红告警。

**C-Space** 是一款专为 Windows 用户与开发者设计的磁盘管理神器：
1. **准确识别**：内置 50+ 规则与启发式引擎，能快速告知你每个文件夹是哪个软件创建的、具体作何用途。
2. **安全清理**：严格的三级风险评估体系（🟢安全 / 🟡谨慎 / 🔴高危），杜绝误删系统关键文件；提供回收站与永久清理双模式，并支持实时清理进度流展示。
3. **无损搬家**：对于 AppData、开发缓存等写死路径的大目录，通过**「物理搬迁 + 原位置自动创建 Windows 目录联接 (Junction / `mklink /J`)」**实现无感重定向，软件无需改配置，后续生成缓存自动写入新盘。
4. **软链接账本**：支持统一管理所有跨盘软链接，支持自定义创建目录联接、符号链接、硬链接，并支持一键将数据迁回 C 盘。

---

## ✨ 核心功能特性

### 1. 🔍 C 盘透视与用途智能识别
- **丰富规则库**：内置开发环境（VS Code/Cursor/JetBrains、npm/pnpm/pip/cargo/gradle/maven/conda/Docker/WSL 等）、常用办公与社交软件（微信、企业微信、QQ、钉钉、飞书、WPS）、浏览器（Chrome/Edge/Firefox）以及系统驱动残留规则。
- **启发式兜底识别**：即使未收录在规则库中的软件，也能根据目录深度、命名特征（`*cache*`, `*logs*`, `*temp*` 等）智能推断并打上安全标签。
- **极速低内存扫描**：采用 Rust + 流式迭代器（`walkdir`），避免递归中间内存暴增；多线程并行展开，**严格穿透软链接保护**，避免跨盘重复计费或死循环。

### 2. 📦 大文件深度扫描与定位
- **自定义阈值检索**：支持快速定位 ≥50MB、≥100MB、≥500MB、≥1GB、≥5GB 的大型孤立文件。
- **智能类别分类**：自动识别虚拟机镜像（VHDX/VMDK/ISO）、AI 模型权重（GGUF/Safetensors/Bin/Pt）、高清音视频、压缩包归档、大型程序运行库与数据库备份。
- **快捷处置**：支持在资源管理器中直接定位文件位置、复制路径、以及安全移入回收站。

### 3. 👯 重复文件两阶段哈希比对与无损硬链接替换
- **三阶段递进式算法**：
  1. *第一阶段*：精确字节长度筛选聚合，快速剔除唯一文件；
  2. *第二阶段*：文件头部 8KB + 尾部 8KB 快速采样哈希比对；
  3. *第三阶段*：候选文件进行流式 SHA-256 全文哈希校验，100% 杜绝误删。
- **智能保留标记**：支持一键「保留最新文件」、「保留最旧文件」或「保留最短路径」。
- **创新硬链接替换 (NTFS Hardlink)**：不仅支持移入回收站，更推荐**将冗余副本就地替换为原文件的 NTFS 硬链接**——立刻释放相同磁盘容量，且所有软件的原始访问路径完全保留无损！

### 4. 🧹 专项智能安全清理
- **实时进度反馈**：清理时向前端实时推送当前清理文件、已释放容量、已删文件数与进度条。
- **三级安全防护机制**：
  - 🟢 **安全可清理**：临时缓存、崩溃转储、已失效安装包等，清理不影响日常使用。
  - 🟡 **谨慎清理**：构建缓存、旧日志、着色器编译缓存等，清理后可能需要软件重新下载或生成。
  - 🔴 **高危禁删**：系统核心文件与个人用户数据目录，后端进行强制拦截，禁止误删。
- **文件占用自动跳过**：自动跳过被运行中软件排他锁定的文件，保障系统稳定与软件数据安全；生成本地审计日志。

### 5. 🚚 AppData 大文件应用无损搬家
- **智能推荐面板**：自动扫描并推荐 C 盘最占用空间的软件数据与缓存，一键导入搬迁方案。
- **底层目录联接 (Junction)**：采用 Windows 原生重解析技术，将数据搬到其他盘后原路径留下软链接，软件读写无感透明，后续生成的新缓存自动存储在目标磁盘。
- **进程占用拦截 (Restart Manager API)**：迁移前自动调用 Windows Restart Manager，若文件被后台程序锁住，列出具体占用进程并支持一键结束。
- **事务安全回滚**：全流程遵循「预检 ➔ 物理复制 ➔ 校验完整性 ➔ 原路径改名备份 ➔ 创建联接 ➔ 释放空间」，任一阶段出错自动撤销恢复，零数据丢失风险。

### 6. 🔗 软链接生命周期管理与账本
- **全局账本监控**：记录所有通过本工具或外部创建的软链接状态，自动检测断链（目标路径不存在）。
- **一键原路迁回**：支持随时将数据从目标盘安全恢复回 C 盘，并自动解绑链接。
- **自定义映射向导**：支持高级用户手动创建 **目录联接 (Junction)**、**目录符号链接 (mklink /D)**、**单文件符号链接 (mklink)** 与 **硬链接**。

---

## 🛠️ 技术栈

| 分层 | 技术选型 | 说明 |
|------|---------|------|
| **桌面框架** | [Tauri v2](https://v2.tauri.app/) | 超轻量级桌面容器，低资源占用，高安全性 |
| **系统后端** | [Rust](https://www.rust-lang.org/) | 原生性能，多线程并行运算，内存安全 |
| **Windows API** | `windows-sys` | 调用 Restart Manager、Shell、TokenElevation 等系统级接口 |
| **重解析处理** | `junction`, `walkdir`, `trash` | Windows 目录联接底层实现、流式极速遍历、跨平台回收站 |
| **前端框架** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | 现代组件化 UI 与严谨类型检查 |
| **样　　式** | [Tailwind CSS v4](https://tailwindcss.com/) | 现代高密度暗色系桌面控制台风格 |
| **图　　标** | [Lucide React](https://lucide.dev/) | 统一清晰的矢量图标库 |

---

## 📂 项目结构

```text
C-Space/
├── public/                 # 前端静态静态资源 (应用图标、favicon)
├── src/                    # React 前端工程源码
│   ├── pages/              # 核心功能视图
│   │   ├── ExplorerView.tsx   # C 盘深度透视与用途识别工作台
│   │   ├── CleanerView.tsx    # 专项安全清理面板 (含实时进度流)
│   │   ├── MigratorView.tsx   # AppData 无损搬家与智能推荐
│   │   ├── LinksView.tsx      # 软链接账本管理与自定义向导
│   │   └── SettingsView.tsx   # 偏好设置与规则库检索
│   ├── types.ts            # 前后端 IPC 数据结构定义
│   ├── utils.ts            # 容量换算等通用工具
│   ├── App.tsx             # 布局容器、侧边栏导航与状态微看板
│   ├── main.tsx            # React 入口
│   └── index.css           # 基础样式与自定义滚动条
│
├── src-tauri/              # Rust 系统底层后端
│   ├── icons/              # 全平台应用图标 (ICO, ICNS, PNG)
│   ├── rules/              # 预设指纹规则库 (JSON)
│   │   ├── system.json         # 系统关键路径、驱动与日志规则
│   │   ├── dev_browser.json    # 开发者工具链、IDE 与浏览器规则
│   │   └── apps.json           # 社交聊天、音视频编辑与游戏平台规则
│   ├── src/
│   │   ├── cleaner.rs          # 清理引擎与进度事件推送
│   │   ├── ledger.rs           # 软链接账本与应用偏好持久化
│   │   ├── links.rs            # Junction 与符号链接底层管理
│   │   ├── migrator.rs         # 事务式迁移器与 Restart Manager 占用检测
│   │   ├── rules.rs            # 规则加载、路径宏展开与启发式推断
│   │   ├── scanner.rs          # 流式低内存快速目录扫描器
│   │   ├── winapi.rs           # Windows 原生 Win32 API 封装
│   │   ├── lib.rs              # Tauri Command 注册与应用初始化
│   │   └── main.rs             # 可执行程序入口
│   ├── Cargo.toml          # Rust 依赖声明
│   ├── tauri.conf.json     # Tauri 2.0 窗口与构建配置
│   ├── app.manifest        # Release 管理员权限 (requireAdministrator) 清单
│   └── app.dev.manifest    # Dev 调试普通用户 (asInvoker) 清单
│
├── app-icon.svg            # 官方矢量设计源图标
├── package.json            # Node.js 项目配置与脚本
└── vite.config.ts          # Vite 打包配置
```

---

## 🚀 快速开始

### 环境依赖

在开始开发或构建前，请确保您的 Windows 环境已安装：
- **Node.js** >= 18.0.0
- **Rust** >= 1.77 (推荐使用 `x86_64-pc-windows-msvc` 工具链)
- **C++ 生成工具**（Visual Studio 2022 Community，勾选「使用 C++ 的桌面开发」）
- **WebView2 Runtime**（Windows 10/11 通常已内置）

### 1. 安装依赖

```bash
# 安装前端依赖
npm install
```

### 2. 本地开发与调试

```bash
# 启动 Vite 前端服务并启动 Tauri 桌面调试窗口
npm run tauri dev
```
> **提示**：在 Dev 模式下程序默认使用 `app.dev.manifest` 启动，无需强制管理员提权即可调试 UI；当执行特定系统操作时可点击界面左下角进行提权。

### 3. 构建发布安装包

```bash
# 编译全量前端资源并生成 Release 独立安装包
npm run tauri build
```
编译产物位于 `src-tauri/target/release/bundle/nsis/`，生成的可执行程序已自动嵌入管理员清白证书。

---

## ⚙️ 配置文件与持久化说明

C-Space 会在用户的 Local AppData 目录下保存配置与账本，完全独立不侵入系统：
- **配置路径**：`%APPDATA%\com.cspace.app\`
  - `settings.json`：全局偏好（默认搬家存储盘、回收站模式等）
  - `ledger.json`：受管软链接数据库与迁移历史账本
  - `clean_history.jsonl`：清理审计日志
  - `custom_rules.json`：（可选）用户自定义识别与清理规则

---

## 🛡️ 安全合规与防误删原则

1. **绝对禁删白名单**：系统根目录、`C:\Windows` 核心、系统卷信息 `System Volume Information`、`$Recycle.Bin`、`pagefile.sys`、`hiberfil.sys` 等被硬编码为禁止清理与迁移。
2. **非破坏性重解析操作**：所有扫描与体积计算逻辑均**显式检测并跳过 Reparse Point (Junction / Symlink)**，不仅保证自身内存与运行开销降至最低，更彻底杜绝因清理软链接而导致目标实际物理盘文件被误删的悲剧。

---

## 🤝 贡献与参与

欢迎提交 Issue 和 Pull Request 来完善 C-Space 的应用规则库或功能：
1. Fork 本项目仓库
2. 创建您的特性分支 (`git checkout -b feature/awesome-feature`)
3. 提交您的修改 (`git commit -m 'feat: 增加对某某开发工具缓存的识别规则'`)
4. 推送到远程分支 (`git push origin feature/awesome-feature`)
5. 提交 Pull Request

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
