# 国民级社交巨兽专治（微信 / 企业微信 / QQ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建“社交资产多维透视与无损瘦身”专治引擎，深度解构微信/企业微信/QQ 存储架构，提供历史音视频时间分期归档至 D 盘、多群重复下载文件一键 NTFS 硬链接去重、以及朋友圈/小程序零风险缓存清理，确保聊天记录 100% 绝对安全的前提下释放 50GB~100GB 空间。

**Architecture:** 
1. 后端新增 `src-tauri/src/social.rs` 模块，通过注册表读取与标准目录枚举自动探测 WeChat、WXWork、QQ 数据根目录；
2. 架构多维解构器：精准分类 `cache` (朋友圈/小程序/临时)、`video` (群聊与发送视频)、`image` (图片)、`file` (接收文档)、`protected_db` (核心聊天记录数据库)；
3. 历史音视频时间分水岭归档引擎：计算音视频 modified time 与月份层级，将超过指定期限（1/3/6/12 个月）的文件安全搬迁至指定归档磁盘并保持目录树；
4. 多群重复下载文件硬链接化去重引擎：两阶段比对群文件，使用 Windows NTFS `fs::hard_link` 替换重复副本，保留每个群原汁原味的访问路径，磁盘物理占用降为 1 份；
5. 前端新增 `src/pages/SocialSlimmerView.tsx`，在 `src/App.tsx` 侧边栏常驻，提供安全隔离防护盾、资产透视进度条、时间滑动沉淀归档器与一键硬链接去重列表。

**Tech Stack:** Rust 2021, `windows-sys` (Registry / FileSystem), Tauri v2, React 19, TypeScript, Tailwind CSS, Lucide Icons.

**Spec:** docs/superpowers/plans/2026-11-04-social-asset-slimmer.md

## Global Constraints

- **聊天记录绝对安全铁律**：核心数据库文件（`Msg\*.db`、`*.data`）强制设为只读受保护区，后端绝不提供针对数据库文件的删除或修改接口，前端醒目展示 🛡️ 安全隔离保护盾；
- **群文件无损去重**：重复群文件去重必须使用 NTFS 硬链接（`fs::hard_link`），严禁破坏任何一个群的原始访问路径，确保在微信中点击任意群的该文件均能正常打开；
- **跨盘归档原子性**：音视频归档至 D 盘时，严格执行“复制 -> 目标大小/校验一致 -> 删除源文件”，杜绝中断导致的数据丢失；
- **全自动探测**：自动识别注册表自定义路径与默认文档路径，未安装或未登录的应用友好提示，支持用户手动指定路径；
- **内存受控**：海量文件（数十万张图片/视频）扫描采用流式迭代与轻量聚合，严禁内存溢出。

## Review Focus

1. **注册表与自定义数据路径解析**：微信移动过数据目录至 D 盘或自定义盘符时，是否能精准探测；
2. **多群重复下载去重效果**：硬链接替换后，原路径是否依然可打开，磁盘可用空间是否即刻增加；
3. **音视频按月份/天数归档准确性**：3 个月内文件是否严格保留，超期文件是否完整迁移并保留子目录结构；
4. **数据库保护**：尝试对 `Msg` 目录操作时是否会被物理隔离与拦截；
5. **UI 沉浸感与视觉一致性**：深空科技风格、微信绿色/企微蓝色/QQ 浅蓝主题切换流畅，数据统计卡片与进度条实时响应。

---

### Task 1: 编写社交巨兽后端底层探测与解构引擎 `src-tauri/src/social.rs`

**Files:**
- Create: `src-tauri/src/social.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 1.1**: 定义核心数据结构：
  - `SocialAppInfo`: `id`, `name`, `data_path`, `account_ids`, `is_running`, `installed`
  - `SocialAssetCategory`: `cache`, `video`, `image`, `file`, `protected_db`
  - `SocialAssetSummary`: `total_bytes`, `cache_bytes`, `video_bytes`, `image_bytes`, `file_bytes`, `db_bytes`, `items_count`
  - `SocialArchiveCandidate`: `path`, `size`, `modified_days`, `month_dir`, `category`
  - `SocialDuplicateGroup`: `hash`, `size_each`, `wasted_bytes`, `files: Vec<String>`
- [ ] **Step 1.2**: 实现注册表与路径自动探测函数 `detect_wechat_path()`, `detect_wxwork_path()`, `detect_qq_path()`。
- [ ] **Step 1.3**: 实现多维资产解构扫描函数 `scan_social_account_assets(path, cancel_flag)`，区分 5 大资产类别。
- [ ] **Step 1.4**: 实现历史音视频过滤与归档搬迁函数 `archive_media_files(files, target_archive_root)`（拷贝 -> 校验 -> 删除源）。
- [ ] **Step 1.5**: 实现多群重复下载文件扫描与一键硬链接替换 `scan_social_duplicates(file_dir)` 与 `hardlink_social_duplicate_group(group)`。
- [ ] **Step 1.6**: 实现安全缓存一键清空 `clean_social_cache_files(paths)`。
- [ ] **Step 1.7**: 在 `src-tauri/src/lib.rs` 中引入 `mod social;` 并注册 Tauri 指令。
- [ ] **Step 1.8**: 运行 `cargo check` 验证编译。
- [ ] **Step 1.9**: Git commit: `feat(social): implement WeChat/WXWork/QQ asset deconstruction and slimming engine`.

---

### Task 2: 编写前端社交资产专治视图 `src/pages/SocialSlimmerView.tsx`

**Files:**
- Create: `src/pages/SocialSlimmerView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/types.ts`
- Test: `npm run build`

- [ ] **Step 2.1**: 在 `src/types.ts` 中补充社交资产相关 TypeScript 接口定义。
- [ ] **Step 2.2**: 创建 `src/pages/SocialSlimmerView.tsx`：
  - 顶部应用切换：微信 (WeChat, 绿色品牌感)、企业微信 (WXWork, 商务蓝)、QQ (企鹅蓝)；
  - 核心安全栏：🛡️ 呈现“核心聊天记录已安全隔离保护”绿色盾牌，消除用户不敢清理的顾虑；
  - 全景资产容量卡片：5 维分布条形图与容量明细（朋友圈缓存、视频、图片、群文件、数据库）；
  - **核心功能区 A：音视频时间沉淀归档**：
    - 期限选择组件：保留最近 1 个月 / 3 个月 / 6 个月 / 1 年；
    - 目标归档磁盘选择（默认推荐容量最大的非系统盘，如 `D:\C-Space_SocialArchive\WeChat\Video`）；
    - 预览待归档文件数与体积，一键「沉淀归档至目标盘」；
  - **核心功能区 B：多群重复下载文件一键硬链接去重**：
    - 展示重复文件列表（文件名、群副本路径、单份大小、多群冗余浪费大小）；
    - 一键「无损硬链接去重」（保留各群访问路径，物理磁盘只存 1 份）；
  - **核心功能区 C：朋友圈/小程序/临时垃圾安全清空**：
    - 一键释放无风险缓存，秒级回血。
- [ ] **Step 2.3**: 在 `src/App.tsx` 侧边栏中加入「国民社交资产专治」菜单项（使用 `MessageSquareText` 图标与醒目新功能徽标）。
- [ ] **Step 2.4**: 运行 `npm run build` 确保 TypeScript 与前端构建 0 错误。
- [ ] **Step 2.5**: Git commit: `feat(frontend): add SocialSlimmerView for WeChat/WXWork/QQ non-destructive slimming`.

---

### Task 3: 生产构建、发布打包与端到端验证

**Files:**
- Test: `npm run tauri build`
- Modify: `release/SHA256SUMS.txt`

- [ ] **Step 3.1**: 运行 `npm run tauri build` 编译完整 Release 安装包与便携版。
- [ ] **Step 3.2**: 复制生成物至 `release/C-Space_1.1.0_x64-setup.exe` 与 `portable.exe`。
- [ ] **Step 3.3**: 更新 `release/SHA256SUMS.txt`。
- [ ] **Step 3.4**: Git commit & push 到 `v1.1.0` 分支与更新 Tag。

