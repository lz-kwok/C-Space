import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  RefreshCw,
  HardDrive,
  ArrowUp,
  Play,
  StopCircle,
  Copy,
  Trash2,
  ExternalLink,
  Flame,
  Palette,
  Check,
  ChevronRight,
  Disc3,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import { DriveInfo, FileNode, ScanProgressEvent } from "../types";
import { formatBytes } from "../utils";
import {
  TreemapRect,
  SunburstSector,
  ColorMode,
  GalaxyViewMode,
  HEATMAP_TIERS,
  CATEGORY_PALETTE,
  computeSquarifiedTreemap,
  drawTreemapCell,
  computeSunburstSectors,
  drawSunburstWheel,
  drawStarfield,
  getNodeColorTheme,
} from "../utils/treemap";

interface Props {
  onNavigateToMigrate?: (path: string) => void;
}

export const TreemapView: React.FC<Props> = ({ onNavigateToMigrate }) => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("C:\\");
  const [history, setHistory] = useState<string[]>(["C:\\"]);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  // 视角与着色模式
  const [viewMode, setViewMode] = useState<GalaxyViewMode>("sunburst");
  const [colorMode, setColorMode] = useState<ColorMode>("heatmap");

  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<FileNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 数据布局缓存 Ref
  const treemapRectsRef = useRef<TreemapRect<FileNode>[]>([]);
  const sunburstSectorsRef = useRef<SunburstSector<FileNode>[]>([]);
  const activeScanIdRef = useRef<string>("");

  // 节流批处理缓冲区，杜绝海量 IPC 事件导致的 React 频繁重渲与 GPU 内存爆炸
  const pendingNodesRef = useRef<Map<string, FileNode>>(new Map());
  const flushTimerRef = useRef<number | null>(null);
  const canvasDimensionsRef = useRef<{ width: number; height: number; dpr: number }>({
    width: 0,
    height: 0,
    dpr: 1,
  });

  const flushPendingNodes = useCallback(() => {
    if (pendingNodesRef.current.size === 0) return;
    const incoming = Array.from(pendingNodesRef.current.values());
    pendingNodesRef.current.clear();

    setNodes((prev) => {
      const map = new Map<string, FileNode>();
      for (const n of prev) map.set(n.path, n);
      for (const n of incoming) map.set(n.path, n);
      const list = Array.from(map.values()).sort((a, b) => b.size - a.size);
      return list;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushPendingNodes();
    }, 120); // 120ms 丝滑节流合并
  }, [flushPendingNodes]);

  useEffect(() => {
    invoke<DriveInfo[]>("get_drives").then((res) => {
      setDrives(res);
      if (
        res.length > 0 &&
        !res.some((d) => currentPath.toUpperCase().startsWith(d.letter.toUpperCase()))
      ) {
        const first = `${res[0].letter}:\\`;
        setCurrentPath(first);
        setHistory([first]);
      }
    });

    const unlisten = listen<ScanProgressEvent>("scan-node-found", (event) => {
      const payload = event.payload;
      if (payload.scanId !== activeScanIdRef.current) return;

      if (payload.isDone) {
        if (flushTimerRef.current !== null) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        flushPendingNodes();
        setLoading(false);
        return;
      }

      pendingNodesRef.current.set(payload.node.path, payload.node);
      scheduleFlush();
    });

    return () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
      }
      unlisten.then((f) => f());
    };
  }, [currentPath, scheduleFlush, flushPendingNodes]);

  const fetchDir = async (path: string) => {
    const scanId = `galaxy-${Date.now()}`;
    activeScanIdRef.current = scanId;
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    pendingNodesRef.current.clear();

    setLoading(true);
    setHasScanned(true);
    setNodes([]);
    setSelectedNode(null);
    setHoveredNode(null);

    try {
      const res = await invoke<FileNode[]>("scan_directory", { path, scanId });
      if (activeScanIdRef.current === scanId) {
        setNodes(res);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (activeScanIdRef.current === scanId) {
        setLoading(false);
      }
    }
  };

  const handleStartScan = () => {
    fetchDir(currentPath);
  };

  const handleCancelScan = async () => {
    try {
      await invoke("cancel_scan");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDrive = (letter: string) => {
    const driveRoot = `${letter}:\\`;
    setHistory([driveRoot]);
    setCurrentPath(driveRoot);
    setNodes([]);
    setHasScanned(false);
    setSelectedNode(null);
  };

  const handleBrowseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要在星系图中透视的磁盘或目录",
      });
      if (selected && typeof selected === "string") {
        setHistory([...history, selected]);
        setCurrentPath(selected);
        setNodes([]);
        setHasScanned(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpDir = () => {
    const p = currentPath.replace(/\\$/, "");
    const lastSlash = p.lastIndexOf("\\");
    if (lastSlash > 0) {
      const parent =
        p.substring(0, lastSlash) + (p.indexOf(":") === lastSlash - 1 ? "\\" : "");
      setHistory([...history, parent]);
      setCurrentPath(parent);
      fetchDir(parent);
    }
  };

  const handleDrillDown = (node: FileNode) => {
    if (!node.isDir || node.isLink) return;
    setHistory([...history, node.path]);
    setCurrentPath(node.path);
    fetchDir(node.path);
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = history[index];
    const newHist = history.slice(0, index + 1);
    setHistory(newHist);
    setCurrentPath(target);
    fetchDir(target);
  };

  // 渲染星空与图表
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const prevDim = canvasDimensionsRef.current;

    // 仅在真实尺寸发生改变时调整物理 Canvas 分辨率，绝不每帧重置显存缓冲！
    if (prevDim.width !== width || prevDim.height !== height || prevDim.dpr !== dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvasDimensionsRef.current = { width, height, dpr };
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. 绘制深邃宇宙星空背景与微尘
    drawStarfield(ctx, width, height);

    const totalSize = nodes.reduce((acc, curr) => acc + curr.size, 0);

    // 2. 根据模式进行核心图表渲染
    if (viewMode === "treemap") {
      const rects = computeSquarifiedTreemap(nodes, width, height, 6, colorMode);
      treemapRectsRef.current = rects;
      sunburstSectorsRef.current = [];

      for (const rect of rects) {
        const isHovered = hoveredNode?.path === rect.data.path;
        const isSelected = selectedNode?.path === rect.data.path;
        drawTreemapCell(ctx, rect, isHovered, isSelected, totalSize);
      }
    } else {
      // 🌌 罗盘模式 (Sunburst Wheel)
      const cx = width / 2;
      const cy = height / 2;
      const minDim = Math.min(width, height);
      const coreRadius = Math.max(50, minDim * 0.16);
      const innerRadius = coreRadius + 14;
      const outerRadius = Math.max(innerRadius + 40, minDim * 0.44);

      const sectors = computeSunburstSectors(
        nodes,
        innerRadius,
        outerRadius,
        colorMode
      );
      sunburstSectorsRef.current = sectors;
      treemapRectsRef.current = [];

      const hoveredSector = sectors.find((s) => s.data.path === hoveredNode?.path) || null;
      const selectedSector =
        sectors.find((s) => s.data.path === selectedNode?.path) || null;

      drawSunburstWheel(
        ctx,
        sectors,
        cx,
        cy,
        coreRadius,
        currentPath,
        totalSize,
        hoveredSector,
        selectedSector
      );
    }

    ctx.restore();
  }, [nodes, viewMode, colorMode, hoveredNode, selectedNode, currentPath]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // 监听容器大小改变
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      renderCanvas();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [renderCanvas]);

  // 鼠标坐标命中探测 (同时兼容矩形树图与极坐标罗盘扇区)
  const hitTest = (mouseX: number, mouseY: number): FileNode | null => {
    if (viewMode === "treemap") {
      const hit = treemapRectsRef.current.find(
        (r) =>
          mouseX >= r.x &&
          mouseX <= r.x + r.width &&
          mouseY >= r.y &&
          mouseY <= r.y + r.height
      );
      return hit ? hit.data : null;
    } else {
      const container = containerRef.current;
      if (!container) return null;
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;

      const dx = mouseX - cx;
      const dy = mouseY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 计算极坐标角度并规范至 [-PI/2, 3PI/2]
      let angle = Math.atan2(dy, dx);

      for (const s of sunburstSectorsRef.current) {
        if (dist >= s.innerRadius - 4 && dist <= s.outerRadius + 12) {
          // 处理角度跨越周期
          let testAngle = angle;
          while (testAngle < s.startAngle) testAngle += Math.PI * 2;
          while (testAngle > s.startAngle + Math.PI * 2) testAngle -= Math.PI * 2;

          if (testAngle >= s.startAngle && testAngle <= s.endAngle) {
            return s.data;
          }
        }
      }
      return null;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bcr = canvas.getBoundingClientRect();
    const mouseX = e.clientX - bcr.left;
    const mouseY = e.clientY - bcr.top;

    const hit = hitTest(mouseX, mouseY);
    if (hit) {
      setHoveredNode(hit);
      setTooltipPos({ x: e.clientX, y: e.clientY });
    } else {
      setHoveredNode(null);
      setTooltipPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
    setTooltipPos(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bcr = canvas.getBoundingClientRect();
    const mouseX = e.clientX - bcr.left;
    const mouseY = e.clientY - bcr.top;

    const hit = hitTest(mouseX, mouseY);
    setSelectedNode(hit);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bcr = canvas.getBoundingClientRect();
    const mouseX = e.clientX - bcr.left;
    const mouseY = e.clientY - bcr.top;

    const hit = hitTest(mouseX, mouseY);
    if (hit && hit.isDir && !hit.isLink) {
      handleDrillDown(hit);
    }
  };

  const handleOpenExplorer = async (path: string) => {
    try {
      await invoke("open_in_explorer", { path });
    } catch (e) {
      alert(`无法在资源管理器中定位: ${e}`);
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleTrashSingle = async (path: string) => {
    if (!confirm(`确定将以下项目移入回收站吗？\n\n${path}`)) return;
    try {
      await invoke("trash_file", { filePath: path });
      setNodes((prev) => prev.filter((n) => n.path !== path));
      setSelectedNode(null);
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  const totalDirSize = nodes.reduce((acc, curr) => acc + curr.size, 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-4 select-none">
      {/* 顶部控制栏 */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 space-y-3 backdrop-blur-xl shadow-xl">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="text-cyan-400" size={20} />
              C 盘空间星系图 · 深空视觉透视
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              DaisyDisk 级同心星盘罗盘与极速多核树图，动态解析沉淀冷数据与突发热膨胀，双击下钻探索。
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* 视角切换按钮：星盘罗盘 VS 矩阵星系 */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setViewMode("sunburst")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  viewMode === "sunburst"
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="DaisyDisk 风格同心圆环星系罗盘"
              >
                <Disc3 size={13} className={viewMode === "sunburst" ? "animate-spin-slow" : ""} />
                星盘罗盘
              </button>
              <button
                onClick={() => setViewMode("treemap")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  viewMode === "treemap"
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="高利用率毛玻璃矩形星系树图"
              >
                <LayoutGrid size={13} />
                矩阵树图
              </button>
            </div>

            {/* 着色模式切换按钮 */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setColorMode("heatmap")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  colorMode === "heatmap"
                    ? "bg-gradient-to-r from-blue-600 to-rose-600 text-white shadow font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Flame size={13} className="text-amber-300" />
                冷热热力
              </button>
              <button
                onClick={() => setColorMode("category")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  colorMode === "category"
                    ? "bg-indigo-600 text-white shadow font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Palette size={13} />
                类型着色
              </button>
            </div>

            {/* 扫描/停止按钮 */}
            {loading ? (
              <button
                onClick={handleCancelScan}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-red-600/20 transition"
              >
                <StopCircle size={14} />
                停止扫描
              </button>
            ) : (
              <button
                onClick={handleStartScan}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/30 transition"
              >
                <Play size={14} className="fill-current" />
                {hasScanned ? "重新透视" : "开始透视"}
              </button>
            )}

            {hasScanned && (
              <button
                onClick={() => fetchDir(currentPath)}
                disabled={loading}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition"
                title="刷新当前目录"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            )}
          </div>
        </div>

        {/* 磁盘快捷切换与路径面包屑 */}
        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-4 flex-wrap">
          {/* 可用磁盘列表 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 mr-1">
              <HardDrive size={13} />
              磁盘:
            </span>
            {drives.map((d) => {
              const isActive = currentPath.toUpperCase().startsWith(`${d.letter.toUpperCase()}:`);
              return (
                <button
                  key={d.letter}
                  onClick={() => handleSelectDrive(d.letter)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                    isActive
                      ? "bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-600/30"
                      : "bg-slate-950/70 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <span className="font-mono">{d.letter}:</span>
                  <span className="text-[10px] opacity-80">余 {formatBytes(d.free)}</span>
                </button>
              );
            })}
          </div>

          {/* 路径与面包屑 */}
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <button
              onClick={handleUpDir}
              disabled={currentPath.length <= 3}
              className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-slate-300 transition shrink-0"
              title="向上一级目录"
            >
              <ArrowUp size={14} />
            </button>

            <div className="flex items-center gap-1 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 overflow-x-auto text-xs font-mono text-slate-300 flex-1 max-w-xl">
              {history.map((h, i) => (
                <React.Fragment key={h}>
                  <button
                    onClick={() => handleBreadcrumbClick(i)}
                    className="hover:text-cyan-400 transition truncate max-w-[120px]"
                    title={h}
                  >
                    {h.split("\\").filter(Boolean).pop() || h}
                  </button>
                  {i < history.length - 1 && (
                    <ChevronRight size={12} className="text-slate-600 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>

            <button
              onClick={handleBrowseFolder}
              className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition shrink-0"
            >
              <FolderOpen size={13} className="text-amber-400" />
              浏览...
            </button>
          </div>
        </div>
      </div>

      {/* 主展示区：Canvas 树图或就绪面板 */}
      <div
        ref={containerRef}
        className="flex-1 bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden relative flex flex-col min-h-0 shadow-2xl"
      >
        {!hasScanned && !loading && nodes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-radial from-slate-900 to-slate-950">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center text-cyan-400 mb-4 shadow-xl shadow-cyan-900/30">
              <Disc3 size={32} className="animate-spin-slow" />
            </div>
            <h3 className="text-base font-bold text-slate-100">
              就绪：C 盘空间星系探索
            </h3>
            <p className="text-xs text-slate-400 max-w-md mt-2 leading-relaxed">
              当前目标路径为「{currentPath}」。采用非侵入多核并行扫描，秒级解析目录体积与冰冻时间。
            </p>
            <button
              onClick={handleStartScan}
              className="mt-6 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-600/30 flex items-center gap-2 transition"
            >
              <Play size={15} className="fill-current" />
              开始星系透视
            </button>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              className="w-full h-full cursor-pointer"
            />

            {/* 扫描中的顶部极简进度浮标 */}
            {loading && (
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2.5 px-3 py-1.5 bg-slate-900/90 border border-cyan-500/40 rounded-full text-cyan-300 text-xs backdrop-blur-md shadow-lg">
                <RefreshCw size={12} className="animate-spin text-cyan-400" />
                <span>多核并行透视中... ({nodes.length} 个子项)</span>
              </div>
            )}

            {/* 悬浮 Tooltip 玻璃卡片 */}
            {hoveredNode && tooltipPos && (
              <div
                className="fixed pointer-events-none z-50 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-xs space-y-2 max-w-sm"
                style={{
                  left: `${Math.min(tooltipPos.x + 18, window.innerWidth - 320)}px`,
                  top: `${Math.min(tooltipPos.y + 18, window.innerHeight - 200)}px`,
                }}
              >
                <div className="font-bold text-slate-100 flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{hoveredNode.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {hoveredNode.isDir ? "📁 目录" : "📄 文件"}
                  </span>
                </div>

                <div className="font-mono text-[10px] text-slate-400 truncate max-w-xs">
                  {hoveredNode.path}
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>体积占用:</span>
                    <span className="font-mono text-cyan-400 font-bold text-sm">
                      {formatBytes(hoveredNode.size)}
                      {totalDirSize > 0 && (
                        <span className="text-[11px] text-slate-500 ml-1.5 font-normal">
                          ({((hoveredNode.size / totalDirSize) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>

                  {hoveredNode.isDir && (
                    <div className="flex justify-between items-center text-slate-400 text-[11px]">
                      <span>内部文件数:</span>
                      <span className="font-mono text-slate-300">
                        {hoveredNode.fileCount.toLocaleString()} 个
                      </span>
                    </div>
                  )}

                  {hoveredNode.daysSinceModified !== undefined && (
                    <div className="flex justify-between items-center text-slate-400 text-[11px]">
                      <span>修改活跃度:</span>
                      <span
                        className="font-medium"
                        style={{
                          color: getNodeColorTheme(hoveredNode, "heatmap").accent,
                        }}
                      >
                        {hoveredNode.daysSinceModified > 180
                          ? `🧊 极寒深冻 (${hoveredNode.daysSinceModified} 天前)`
                          : hoveredNode.daysSinceModified > 60
                          ? `❄️ 次冷沉淀 (${hoveredNode.daysSinceModified} 天前)`
                          : hoveredNode.daysSinceModified > 14
                          ? `🌿 温和星云 (${hoveredNode.daysSinceModified} 天前)`
                          : hoveredNode.daysSinceModified > 3
                          ? `☀️ 活跃恒星 (${hoveredNode.daysSinceModified} 天前)`
                          : `🔥 超热耀斑 (近期活跃)`}
                      </span>
                    </div>
                  )}
                </div>

                {hoveredNode.isDir && !hoveredNode.isLink && (
                  <div className="pt-2 border-t border-slate-800/80 text-[10px] text-cyan-300/90 flex items-center gap-1">
                    <span>💡</span> 双击深入查看此文件夹内部星系分布
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部信息与图例栏 */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl px-4 py-2.5 flex justify-between items-center text-xs flex-wrap gap-3 backdrop-blur-xl">
        {/* 选中项快捷操作栏 */}
        {selectedNode ? (
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-medium">当前选中:</span>
            <span
              className="font-mono text-slate-200 truncate max-w-xs font-semibold"
              title={selectedNode.path}
            >
              {selectedNode.name} ({formatBytes(selectedNode.size)})
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <button
                onClick={() => handleOpenExplorer(selectedNode.path)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                title="在资源管理器中定位"
              >
                <FolderOpen size={13} />
              </button>

              <button
                onClick={() => handleCopyPath(selectedNode.path)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                title="复制路径"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>

              {selectedNode.migratable && onNavigateToMigrate && (
                <button
                  onClick={() => onNavigateToMigrate(selectedNode.path)}
                  className="px-2.5 py-1 bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow-md shadow-indigo-600/30"
                >
                  <ExternalLink size={12} />
                  无损搬家
                </button>
              )}

              <button
                onClick={() => handleTrashSingle(selectedNode.path)}
                className="p-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition"
                title="移入回收站"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-xs">
            单击任意星系区域查看详情与快捷操作，双击可深入下钻子目录
          </div>
        )}

        {/* 色彩图例 */}
        {colorMode === "heatmap" ? (
          <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
            <span className="text-slate-500">冷热图例:</span>
            {HEATMAP_TIERS.map((tier) => (
              <span key={tier.label} className="flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{
                    backgroundColor: tier.bgFrom,
                    border: `1px solid ${tier.border}`,
                  }}
                />
                <span style={{ color: tier.textColor }}>{tier.badge}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
            <span className="text-slate-500">类型图例:</span>
            <span className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{
                  backgroundColor: CATEGORY_PALETTE.disk_image.bgFrom,
                  border: `1px solid ${CATEGORY_PALETTE.disk_image.border}`,
                }}
              />
              <span style={{ color: CATEGORY_PALETTE.disk_image.textColor }}>虚拟镜像</span>
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{
                  backgroundColor: CATEGORY_PALETTE.model.bgFrom,
                  border: `1px solid ${CATEGORY_PALETTE.model.border}`,
                }}
              />
              <span style={{ color: CATEGORY_PALETTE.model.textColor }}>AI模型</span>
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{
                  backgroundColor: CATEGORY_PALETTE.media.bgFrom,
                  border: `1px solid ${CATEGORY_PALETTE.media.border}`,
                }}
              />
              <span style={{ color: CATEGORY_PALETTE.media.textColor }}>音视频</span>
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{
                  backgroundColor: CATEGORY_PALETTE.archive.bgFrom,
                  border: `1px solid ${CATEGORY_PALETTE.archive.border}`,
                }}
              />
              <span style={{ color: CATEGORY_PALETTE.archive.textColor }}>压缩包</span>
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{
                  backgroundColor: CATEGORY_PALETTE.executable.bgFrom,
                  border: `1px solid ${CATEGORY_PALETTE.executable.border}`,
                }}
              />
              <span style={{ color: CATEGORY_PALETTE.executable.textColor }}>程序组件</span>
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{
                  backgroundColor: CATEGORY_PALETTE.cache.bgFrom,
                  border: `1px solid ${CATEGORY_PALETTE.cache.border}`,
                }}
              />
              <span style={{ color: CATEGORY_PALETTE.cache.textColor }}>系统缓存</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
