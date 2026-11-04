# C 盘空间星系图 (Treemap) 与冷热数据热力渲染 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建交互式、高性能的 Canvas 空间星系矩形树图 (Squarified Treemap)，支持深层下钻交互，并在其上叠加「分类色彩」与「冷热时间热力（极冷冰蓝至高热赤橙）」双模渲染。

**Architecture:**
- **后端 (Rust / `scanner.rs`)**：在 `FileNode` 中补充修改时间与距今天数（`days_since_modified`、`modified_time`），零额外 I/O 开销复用已有流式遍历；
- **前端算法 (`src/utils/treemap.ts`)**：实现高性能 Squarified Treemap 切割算法与冷热色彩映射函数；
- **前端页面与画布 (`src/pages/TreemapView.tsx`)**：基于原生 HTML5 Canvas 构建自适应高清高帧率交互视窗，支持悬浮 Tooltip、面包屑导航、多级下钻 (Zoom In / Out)、右键/操作栏动作（资源管理器定位、搬家、删除）；
- **导航整合 (`src/App.tsx`)**：将「C 盘空间星系图」作为顶部导航独立核心模块。

**Tech Stack:** Tauri v2, Rust, React 19, HTML5 Canvas 2D, TypeScript, Tailwind CSS v4, Lucide Icons.

**Spec:** v1.1.0 Feature Specification for C-Space.

## Global Constraints
- Canvas 必须处理 DevicePixelRatio (DPI 缩放)，保障 2K/4K 高分屏下文字与边缘不模糊；
- 遵循按需手动触发机制，默认不自动启动全盘卡死扫描；
- 保持 $O(1)$ 内存占用与流式节点推送。

---

### Task 1: 扩展后端 `FileNode` 元数据与冷热时间计算
**Files:**
- Modify: `src-tauri/src/scanner.rs:20-40, 150-180`
- Modify: `src/types.ts:10-35`

**Steps:**
- [ ] 在 `src-tauri/src/scanner.rs` 的 `FileNode` 结构体中添加 `modified_time: Option<String>` 和 `days_since_modified: Option<u32>`。
- [ ] 在 `scan_dir_level_progressive` 获取 `meta` 时读取 `meta.modified()`，计算本地格式化时间与距今天数。
- [ ] 在前端 `src/types.ts` 中的 `FileNode` 接口同步补充 `modifiedTime?: string` 和 `daysSinceModified?: number`。
- [ ] 运行 `cargo check` 验证 Rust 编译通过。

---

### Task 2: 实现 Squarified Treemap 切割算法与热力色值插值库
**Files:**
- Create: `src/utils/treemap.ts`

**Steps:**
- [ ] 实现标准 Squarified Treemap 矩形分割算法（计算长宽比最佳的嵌套矩形网格，输入节点列表与容器宽、高，输出带 `x, y, w, h` 的矩形）。
- [ ] 实现分类色彩方案（虚拟机、AI权重、媒体、压缩包、代码、系统等高对比暗色主题）。
- [ ] 实现冷热热力色彩方案（极冷 >180 天 冰蓝、冷 60~180 天 湖蓝、温 14~60 天 翠绿、热 3~14 天 暖黄、极热 <3 天 赤橙）。
- [ ] 实现针对 Canvas 的文字智能截断与自适应居中排版辅助函数。

---

### Task 3: 构建交互式星系图画布与控制面板 (`TreemapView.tsx`)
**Files:**
- Create: `src/pages/TreemapView.tsx`

**Steps:**
- [ ] 构建顶部控制栏：磁盘选择器 (C:, D:, E:)、目录路径浏览按钮、分类/冷热双模式切换开关、开始/停止扫描按钮。
- [ ] 构建主 Canvas 视口：
  - 监听 resize 与 DPI 适配；
  - 绘制矩形树图单元格（平滑圆角、外边框与标签文字）；
  - 鼠标移动监听高亮与悬浮 Tooltip（显示名称、完整路径、体积、修改时间、冷热标签）；
  - 单击/双击深入下钻至子目录，提供顶部路径面包屑随时退回上层。
- [ ] 构建底部选中项动作栏：提供在资源管理器中定位、复制路径、无损搬家引导、移入回收站快捷操作。

---

### Task 4: 整合主导航与编译全流程验证
**Files:**
- Modify: `src/App.tsx`
- Modify: `README.md` 与 `README_EN.md`

**Steps:**
- [ ] 在 `src/App.tsx` 中注册 `treemap` 标签页，并添加侧边栏入口「空间星系透视图」。
- [ ] 运行 `npm run build` 验证 TypeScript 与 Vite 构建 0 错误。
- [ ] 运行 `cargo check` 确保后端编译无告警。
- [ ] 提交代码并在本地完整验证星系图交互与冷热渐变效果。

