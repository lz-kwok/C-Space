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
  Layers,
} from "lucide-react";
import { DriveInfo, FileNode, ScanProgressEvent } from "../types";
import { formatBytes } from "../utils";
import {
  TreemapRect,
  ColorMode,
  HEATMAP_TIERS,
  computeSquarifiedTreemap,
  drawTreemapCell,
  getNodeColor,
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
  const [colorMode, setColorMode] = useState<ColorMode>("heatmap");
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<FileNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const treemapRectsRef = useRef<TreemapRect<FileNode>[]>([]);
  const activeScanIdRef = useRef<string>("");

  useEffect(() => {
    invoke<DriveInfo[]>("get_drives").then((res) => {
      setDrives(res);
      if (res.length > 0 && !res.some((d) => currentPath.toUpperCase().startsWith(d.letter.toUpperCase()))) {
        const first = `${res[0].letter}:\\`;
        setCurrentPath(first);
        setHistory([first]);
      }
    });

    const unlisten = listen<ScanProgressEvent>("scan-node-found", (event) => {
      const payload = event.payload;
      if (payload.scanId !== activeScanIdRef.current) return;

      if (payload.isDone) {
        setLoading(false);
        return;
      }

      setNodes((prev) => {
        const filtered = prev.filter((n) => n.path !== payload.node.path);
        const updated = [...filtered, payload.node];
        updated.sort((a, b) => b.size - a.size);
        return updated;
      });
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const fetchDir = async (path: string) => {
    const scanId = `treemap-${Date.now()}`;
    activeScanIdRef.current = scanId;
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
      const parent = p.substring(0, lastSlash) + (p.indexOf(":") === lastSlash - 1 ? "\\" : "");
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

  // 渲染 Canvas 树图
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 计算矩形排版
    const rects = computeSquarifiedTreemap(nodes, width, height, 4, colorMode);
    treemapRectsRef.current = rects;

    // 绘制每个单元格
    for (const rect of rects) {
      const isHovered = hoveredNode?.path === rect.data.path;
      const isSelected = selectedNode?.path === rect.data.path;
      drawTreemapCell(ctx, rect, isHovered, isSelected, colorMode);
    }
  }, [nodes, colorMode, hoveredNode, selectedNode]);

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

  // 鼠标交互事件处理
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bcr = canvas.getBoundingClientRect();
    const mouseX = e.clientX - bcr.left;
    const mouseY = e.clientY - bcr.top;

    const hit = treemapRectsRef.current.find(
      (r) =>
        mouseX >= r.x &&
        mouseX <= r.x + r.width &&
        mouseY >= r.y &&
        mouseY <= r.y + r.height
    );

    if (hit) {
      setHoveredNode(hit.data);
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

    const hit = treemapRectsRef.current.find(
      (r) =>
        mouseX >= r.x &&
        mouseX <= r.x + r.width &&
        mouseY >= r.y &&
        mouseY <= r.y + r.height
    );

    if (hit) {
      setSelectedNode(hit.data);
    } else {
      setSelectedNode(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bcr = canvas.getBoundingClientRect();
    const mouseX = e.clientX - bcr.left;
    const mouseY = e.clientY - bcr.top;

    const hit = treemapRectsRef.current.find(
      (r) =>
        mouseX >= r.x &&
        mouseX <= r.x + r.width &&
        mouseY >= r.y &&
        mouseY <= r.y + r.height
    );

    if (hit && hit.data.isDir && !hit.data.isLink) {
      handleDrillDown(hit.data);
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Layers className="text-cyan-400" size={20} />
              C 盘空间星系图 · 动态矩形树图 (Squarified Treemap)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              高帧率自适应多维空间星系图，支持按体积等比切割与冷热时间热力渲染，双击深入下钻子目录。
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* 模式切换按钮 */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setColorMode("heatmap")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  colorMode === "heatmap"
                    ? "bg-gradient-to-r from-blue-600 to-amber-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Flame size={13} className="text-amber-300" />
                冷热数据热力
              </button>
              <button
                onClick={() => setColorMode("category")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  colorMode === "category"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Palette size={13} />
                文件类别着色
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
                {hasScanned ? "重新分析" : "开始透视"}
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
                  {i < history.length - 1 && <ChevronRight size={12} className="text-slate-600 shrink-0" />}
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

      {/* 主展示区：Canvas 树图或未扫描就绪面板 */}
      <div
        ref={containerRef}
        className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative flex flex-col min-h-0"
      >
        {!hasScanned && !loading && nodes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center text-cyan-400 mb-4 shadow-lg shadow-cyan-900/20">
              <Layers size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-100">
              就绪：空间星系矩形树图
            </h3>
            <p className="text-xs text-slate-400 max-w-md mt-2 leading-relaxed">
              当前目标路径为「{currentPath}」。采用按需触发机制，避免无谓卡顿。点击下方按钮即可利用 GPU 与 Canvas 多维渲染出全比例数据大陆。
            </p>
            <button
              onClick={handleStartScan}
              className="mt-6 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-600/30 flex items-center gap-2 transition"
            >
              <Play size={15} className="fill-current" />
              开始生成星系图
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

            {/* 悬浮 Tooltip 卡片 */}
            {hoveredNode && tooltipPos && (
              <div
                className="fixed pointer-events-none z-50 bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs space-y-1.5 max-w-sm"
                style={{
                  left: `${Math.min(tooltipPos.x + 15, window.innerWidth - 300)}px`,
                  top: `${Math.min(tooltipPos.y + 15, window.innerHeight - 150)}px`,
                }}
              >
                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                  <span className="truncate">{hoveredNode.name}</span>
                  {hoveredNode.isDir && (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded border border-slate-700">
                      目录
                    </span>
                  )}
                </div>

                <div className="font-mono text-[11px] text-slate-400 truncate max-w-xs">
                  {hoveredNode.path}
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-slate-800 text-slate-300">
                  <span>体积占用:</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {formatBytes(hoveredNode.size)}
                    {totalDirSize > 0 && (
                      <span className="text-[10px] text-slate-500 ml-1">
                        ({((hoveredNode.size / totalDirSize) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </span>
                </div>

                {hoveredNode.daysSinceModified !== undefined && (
                  <div className="flex justify-between items-center text-slate-400 text-[11px]">
                    <span>修改活跃度:</span>
                    <span
                      className="font-medium"
                      style={{
                        color: getNodeColor(hoveredNode, "heatmap").border,
                      }}
                    >
                      {hoveredNode.daysSinceModified > 180
                        ? `🧊 极冷数据 (${hoveredNode.daysSinceModified} 天前)`
                        : hoveredNode.daysSinceModified > 60
                        ? `❄️ 次冷数据 (${hoveredNode.daysSinceModified} 天前)`
                        : hoveredNode.daysSinceModified > 14
                        ? `🌿 温和数据 (${hoveredNode.daysSinceModified} 天前)`
                        : hoveredNode.daysSinceModified > 3
                        ? `♨️ 活跃数据 (${hoveredNode.daysSinceModified} 天前)`
                        : `🔥 高热数据 (近期活跃)`}
                    </span>
                  </div>
                )}

                {hoveredNode.isDir && !hoveredNode.isLink && (
                  <div className="pt-1 text-[10px] text-cyan-300/80">
                    💡 双击深入查看此文件夹内部分布
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部信息与图例栏 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 flex justify-between items-center text-xs flex-wrap gap-3">
        {/* 选中项快捷操作栏 */}
        {selectedNode ? (
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-medium">当前选中:</span>
            <span className="font-mono text-slate-200 truncate max-w-xs" title={selectedNode.path}>
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
                  className="px-2 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1"
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
            单击任意色块查看详情与快捷操作，双击可深入下钻子目录
          </div>
        )}

        {/* 色彩图例 */}
        {colorMode === "heatmap" ? (
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="text-slate-500">图例:</span>
            {HEATMAP_TIERS.map((tier) => (
              <span key={tier.label} className="flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: tier.color, border: `1px solid ${tier.borderColor}` }}
                />
                <span style={{ color: tier.textColor }}>{tier.label.split(" ")[0]}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="text-slate-500">类别:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-700 border border-purple-400" />
              <span>镜像</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-pink-700 border border-pink-400" />
              <span>AI模型</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-700 border border-sky-400" />
              <span>媒体</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-700 border border-amber-400" />
              <span>压缩包</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-700 border border-indigo-400" />
              <span>缓存</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
