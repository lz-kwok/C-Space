# 基于磁盘的主动社交缓存特征扫描与自定义路径作用解析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现基于任意磁盘（C盘、D盘、E盘等）的主动式社交软件缓存路径深度扫描算法，通过目录特征签名库自动命中非默认路径（移动过数据盘、绿色版、自定义存储路径）的微信、企微、钉钉、QQ缓存，支持用户手动指定任意目录并实时深度解析内部各文件夹的具体业务作用与安全级别。

**Architecture:**
1. 在 `src-tauri/src/social.rs` 中构建社交特征签名探测器 `evaluate_social_signature(dir: &Path)`：
   - 微信：检测 `FileStorage` + `Msg` + `Applet` / `CustomEmotion` 或 `WeChat Files` 模式；
   - 钉钉：检测 `DingTalk` / `钉钉` 或 `FileRecv` + `EBWebView` / `cef_cache` 模式；
   - 企微：检测 `WXWork` / `Global` + `FileStorage` 模式；
   - QQ：检测 `Tencent Files` / `QQNT` / `FileRecv` + `Image` 模式；
2. 编写多线程/轻量化磁盘扫描引擎 `scan_drive_for_social_caches(drive: char)`：
   - 支持系统盘与非系统盘遍历，快速探查各层级文件夹，跳过系统无用目录（`$Recycle.Bin`、`System Volume Information` 等）；
   - 返回命中缓存路径列表 `DiscoveredSocialCache`；
3. 编写任意目录深度分析接口 `analyze_custom_social_path(path: &str)`：
   - 用户手动选择任意自定义目录后，秒级解构该目录下的账号、子文件夹业务用途（`SocialFolderDetail`）；
4. 前端 `SocialSlimmerView.tsx` 增加：
   - 磁盘快捷切换与 `[⚡ 扫描所选磁盘社交缓存]` 触发器；
   - `[📂 手动浏览指定缓存目录]` 原生文件选择按钮；
   - 发现的真实缓存路径清单，支持一键切换并呈现文件夹作用透视表。

**Tech Stack:** Rust 2021, WalkDir, Windows Registry, Tauri v2, React 19, TypeScript, Tailwind CSS.

**Spec:** docs/superpowers/plans/2026-11-05-disk-social-cache-scanner.md

## Global Constraints

- 绝不仅依赖硬编码默认路径，必须能够扫描任意磁盘并发现自定义存储目录；
- 支持用户手动选择任何目录，并无条件进行架构解析与文件夹作用语义分析；
- 扫描过程轻量、快速，具备路径修剪（过滤无关系统目录），避免全盘深搜卡死；
- 聊天记录数据库仍然遵循严格的只读受保护原则。

---

### Task 1: 编写基于特征签名的磁盘扫描引擎与自定义路径解析器

**Files:**
- Modify: `src-tauri/src/social.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 1.1**: 定义 `DiscoveredSocialCache` 结构体：
  - `app_type`, `app_name`, `data_root`, `total_bytes`, `file_count`, `match_reason`, `accounts`, `folders`
- [ ] **Step 1.2**: 编写目录特征签名识别函数 `evaluate_social_signature(dir: &Path) -> Option<(SocialAppType, String, String)>`。
- [ ] **Step 1.3**: 编写驱动器扫描函数 `scan_drive_for_social_caches(drive: char, cancel: &Arc<AtomicBool>) -> Vec<DiscoveredSocialCache>`：
  - 针对系统盘与数据盘分别优化候选路径深度；
  - 过滤排除无关目录；
  - 命中后汇总大小并提取账号。
- [ ] **Step 1.4**: 编写任意路径解析函数 `analyze_custom_social_path(path: &str) -> Result<DiscoveredSocialCache, String>`。
- [ ] **Step 1.5**: 在 `src-tauri/src/lib.rs` 中注册 `scan_disk_for_social_caches` 与 `analyze_custom_social_path`。
- [ ] **Step 1.6**: 运行 `cargo check` 确保编译无误。
- [ ] **Step 1.7**: Git commit: `feat(social): implement disk-wide social cache signature scanner and custom path analyzer`.

---

### Task 2: 前端对接磁盘选择扫描、自定义目录选择与作用透视

**Files:**
- Modify: `src/types.ts`
- Modify: `src/pages/SocialSlimmerView.tsx`
- Test: `npm run build`

- [ ] **Step 2.1**: 在 `src/types.ts` 中添加 `DiscoveredSocialCache` 接口定义。
- [ ] **Step 2.2**: 在 `src/pages/SocialSlimmerView.tsx` 顶部增加：
  - 磁盘选择切换栏（`C:`, `D:`, `E:` 等）；
  - `[⚡ 扫描所选磁盘社交缓存]` 按钮，展示实时扫描状态与结果；
  - `[📂 手动浏览指定缓存目录]` 按钮，调用 `@tauri-apps/plugin-dialog` 的 `open({ directory: true })`；
- [ ] **Step 2.3**: 呈现「扫描命中与已选缓存路径」切换栏：
  - 展示探测到的所有实际存储位置，支持一键切换；
  - 自动联动 5 维资产概况与文件夹业务作用解析表。
- [ ] **Step 2.4**: 运行 `npm run build` 验证前端无报错。
- [ ] **Step 2.5**: Git commit: `feat(frontend): integrate disk social cache scanner and manual folder selector`.

---

### Task 3: 生产构建、发布打包与验证

**Files:**
- Test: `npm run tauri build`
- Modify: `release/SHA256SUMS.txt`

- [ ] **Step 3.1**: 运行 `npm run tauri build` 构建完整 Release 安装包与便携版。
- [ ] **Step 3.2**: 复制生成物至 `release/` 并更新 `release/SHA256SUMS.txt`。
- [ ] **Step 3.3**: Git commit & push 到 `v1.1.0` 分支与更新 Tag。

