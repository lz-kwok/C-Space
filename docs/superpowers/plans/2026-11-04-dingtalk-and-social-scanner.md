# 增加钉钉与系统盘社交缓存自动发现及文件夹作用深度解析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 
1. 新增钉钉 (DingTalk) 社交/办公巨兽的深度识别、资产解构、音视频归档与多群去重；
2. 构建基于系统盘的通用社交软件缓存路径自动扫描与发现算法；
3. 构建社交缓存文件夹作用深度语义分析器（自动解析 Sns/Applet/Video/Image/EBWebView/db 等文件夹的真实业务作用、风险等级与处置建议）。

**Architecture:**
1. 在 `src-tauri/src/social.rs` 中扩展 `SocialAppType::DingTalk`，增加注册表及标准路径探测 `detect_dingtalk()`；
2. 实现系统盘通用社交缓存扫描算法 `scan_system_social_apps()`，遍历 `Documents`, `AppData/Roaming`, `AppData/Local` 等核心目录，自动汇聚微信、企微、钉钉、QQ 及更多潜在社交软件的缓存路径；
3. 实现文件夹作用语义解析器 `analyze_social_folder_purpose(path)`，建立 30+ 常见社交缓存模式字典（覆盖朋友圈、小程序、临时预览、Webview 缓存、多媒体、核心数据库等），返回文件夹用途描述、安全等级与建议操作；
4. 前端 `SocialSlimmerView.tsx` 增加钉钉专属橙色标签切换，并增加「系统盘社交缓存深度扫描与文件夹作用解析」专属交互卡片，支持查看每个子目录的详细用途解读。

**Tech Stack:** Rust 2021, Windows Registry, WalkDir, Tauri v2, React 19, TypeScript, Tailwind CSS.

**Spec:** docs/superpowers/plans/2026-11-04-dingtalk-and-social-scanner.md

## Global Constraints

- **安全铁律**：核心聊天记录数据库文件严格设为受保护区，绝不可删除；
- **全自动发现**：即使未在注册表登记（绿色版或移动过目录），基于系统盘基础扫描算法仍能自动命中；
- **深度作用解析**：每个子目录必须提供通俗易懂的中文用途解析（如“小程序离线资源”、“群聊天高清原图”、“Chromium 内核缓存”等），消除用户的未知恐惧。

---

### Task 1: 后端增加钉钉探测与系统盘社交扫描及文件夹作用分析器

**Files:**
- Modify: `src-tauri/src/social.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 1.1**: 在 `src-tauri/src/social.rs` 的 `SocialAppType` 中增加 `DingTalk` 枚举项。
- [ ] **Step 1.2**: 编写 `detect_dingtalk() -> SocialAppInfo`：
  - 检查注册表 `HKCU\Software\DingTalk` 与 `HKCU\Software\Alibaba\DingTalk`；
  - 探测 `%USERPROFILE%\Documents\DingTalk`、`%APPDATA%\DingTalk`、`%LOCALAPPDATA%\DingTalk`；
  - 提取账号子目录与存储大小。
- [ ] **Step 1.3**: 编写文件夹作用语义分析器 `analyze_social_subfolder(folder_name, relative_path)`：
  - 识别 `Sns`, `Applet`, `Temp`, `AttachmentTemp`, `EBWebView`, `cef_cache`, `Cache`, `FileStorage/Video`, `FileStorage/Image`, `FileStorage/File`, `Msg`, `db`, `avatar`, `CustomEmotion` 等等；
  - 返回 `SocialFolderDetail`: `path`, `folder_name`, `size`, `file_count`, `purpose_title`, `purpose_desc`, `risk_level`, `action_recommendation`。
- [ ] **Step 1.4**: 编写基于系统盘的通用扫描算法 `scan_system_social_roots()`：
  - 流式扫描系统盘（`C:\`）用户目录（`Documents`, `AppData\Roaming`, `AppData\Local`）下的所有社交软件缓存根目录；
  - 对每个命中的社交软件根目录，分析其一级与二级子目录的具体作用。
- [ ] **Step 1.5**: 在 `src-tauri/src/lib.rs` 中暴露 `analyze_account_folders(account_path: String)` 与更新 `get_social_apps()`。
- [ ] **Step 1.6**: 运行 `cargo check` 确保编译通过。
- [ ] **Step 1.7**: Git commit: `feat(social): add DingTalk detection and folder purpose semantic analyzer`.

---

### Task 2: 前端对接钉钉切换与文件夹作用解析面板

**Files:**
- Modify: `src/types.ts`
- Modify: `src/pages/SocialSlimmerView.tsx`
- Test: `npm run build`

- [ ] **Step 2.1**: 更新 `src/types.ts` 中的 `SocialAppType`（增加 `"dingTalk"`）和 `SocialFolderDetail` 接口。
- [ ] **Step 2.2**: 在 `src/pages/SocialSlimmerView.tsx` 顶部应用栏添加「钉钉 (DingTalk)」切换项（DingTalk 活力橙品牌主题与图标）。
- [ ] **Step 2.3**: 增加「缓存目录作用深度透视表」折叠卡片：
  - 罗列当前社交软件数据目录下的所有子文件夹；
  - 展示文件夹真实业务作用说明（如“微信朋友圈本地离线缓存”、“钉钉内核网页缓存”、“核心聊天数据库”）；
  - 标注安全等级（安全可清 / 资产建议归档 / 核心受保护）；
  - 提供单项一键定位或清理按钮。
- [ ] **Step 2.4**: 运行 `npm run build` 验证 TypeScript 与 Vite 构建。
- [ ] **Step 2.5**: Git commit: `feat(frontend): integrate DingTalk and folder purpose breakdown table`.

---

### Task 3: 生产构建与发布校验

**Files:**
- Test: `npm run tauri build`
- Modify: `release/SHA256SUMS.txt`

- [ ] **Step 3.1**: 运行 `npm run tauri build` 构建完整 Release 安装包与便携版。
- [ ] **Step 3.2**: 复制生成物至 `release/` 并更新 `release/SHA256SUMS.txt`。
- [ ] **Step 3.3**: Git commit & push 到 `v1.1.0` 分支与更新 Tag。

