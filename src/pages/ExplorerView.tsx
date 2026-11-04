import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Folder,
  HardDrive,
  RefreshCw,
  ArrowRight,
  CornerDownRight,
  FolderOpen,
  ArrowUp,
  StopCircle,
  Play,
} from "lucide-react";
import { DriveInfo, FileNode, ScanProgressEvent } from "../types";
import { formatBytes } from "../utils";

interface Props {
  onNavigateToMigrate?: (path: string) => void;
}

export const ExplorerView: React.FC<Props> = ({ onNavigateToMigrate }) => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("C:\\");
  const [inputPath, setInputPath] = useState<string>("C:\\");
  const [history, setHistory] = useState<string[]>(["C:\\"]);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const activeScanIdRef = useRef<string>("");
  const pendingNodesRef = useRef<Map<string, FileNode>>(new Map());
  const flushTimerRef = useRef<number | null>(null);

  const flushPendingNodes = () => {
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
  };

  const scheduleFlush = () => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushPendingNodes();
    }, 120);
  };

  useEffect(() => {
    invoke<DriveInfo[]>("get_drives").then((res) => {
      setDrives(res);
      if (res.length > 0 && !res.some((d) => currentPath.toUpperCase().startsWith(d.letter.toUpperCase()))) {
        const first = `${res[0].letter}:\\`;
        setCurrentPath(first);
        setInputPath(first);
        setHistory([first]);
      }
    });

    // 监听渐进式扫描推送事件 (使用节流缓冲，避免高频 IPC 造成前端界面卡顿与 GC 压力)
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
  }, []);

  const fetchDir = async (path: string) => {
    const scanId = `scan-${Date.now()}`;
    activeScanIdRef.current = scanId;
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    pendingNodesRef.current.clear();

    setLoading(true);
    setHasScanned(true);
    setNodes([]); // 清空上一层，准备渐进式填充
    setSelectedNode(null);
    setInputPath(path);

    try {
      const res = await invoke<FileNode[]>("scan_directory", { path, scanId });
      // 兜底全量同步
      if (activeScanIdRef.current === scanId) {
        setNodes(res);
      }
    } catch (e) {
      console.error("扫描目录异常:", e);
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

  const handleOpenDir = (node: FileNode) => {
    if (!node.isDir || node.isLink) return;
    setHistory([...history, node.path]);
    setCurrentPath(node.path);
    fetchDir(node.path);
  };

  const handleBack = () => {
    if (history.length <= 1) return;
    const newHist = [...history];
    newHist.pop();
    const prev = newHist[newHist.length - 1];
    setHistory(newHist);
    setCurrentPath(prev);
    fetchDir(prev);
  };

  const handleUpDir = () => {
    // 向上跳转一级父目录
    const p = currentPath.replace(/\\$/, "");
    const lastSlash = p.lastIndexOf("\\");
    if (lastSlash > 0) {
      const parent = p.substring(0, lastSlash) + (p.indexOf(":") === lastSlash - 1 ? "\\" : "");
      setHistory([...history, parent]);
      setCurrentPath(parent);
      fetchDir(parent);
    }
  };

  const handleSelectDrive = (letter: string) => {
    const driveRoot = `${letter}:\\`;
    setHistory([...history, driveRoot]);
    setCurrentPath(driveRoot);
    setInputPath(driveRoot);
    setNodes([]);
    setHasScanned(false);
  };

  const handleBrowseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要透视分析的磁盘或目录",
      });
      if (selected && typeof selected === "string") {
        setHistory([...history, selected]);
        setCurrentPath(selected);
        setInputPath(selected);
        setNodes([]);
        setHasScanned(false);
      }
    } catch (e) {
      console.error("打开文件夹选择框失败:", e);
    }
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      setHistory([...history, inputPath.trim()]);
      setCurrentPath(inputPath.trim());
      fetchDir(inputPath.trim());
    }
  };

  const totalDirSize = nodes.reduce((acc, curr) => acc + curr.size, 0);

  const activeDriveInfo = drives.find((d) =>
    currentPath.toUpperCase().startsWith(`${d.letter.toUpperCase()}:`)
  );

  return (
    <div className="flex h-full flex-col p-4 gap-4">
      {/* 顶部：磁盘快捷切换与目录选择器 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* 可用磁盘列表 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 mr-1">
              <HardDrive size={13} />
              选择磁盘:
            </span>
            {drives.map((d) => {
              const isActive = currentPath.toUpperCase().startsWith(`${d.letter.toUpperCase()}:`);
              return (
                <button
                  key={d.letter}
                  onClick={() => handleSelectDrive(d.letter)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                    isActive
                      ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30"
                      : "bg-slate-950/70 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white"
                  }`}
                  title={`${d.label || "本地磁盘"} (总容量 ${formatBytes(d.total)})`}
                >
                  <span className="font-mono">{d.letter}:</span>
                  <span className="text-[10px] opacity-80">
                    余 {formatBytes(d.free)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 浏览文件夹与主扫描控制按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleBrowseFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
              title="浏览并选择本机任意文件夹"
            >
              <FolderOpen size={13} className="text-amber-400" />
              浏览文件夹...
            </button>

            {loading ? (
              <button
                onClick={handleCancelScan}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-red-600/20 transition"
              >
                <StopCircle size={14} />
                停止扫描
              </button>
            ) : (
              <button
                onClick={handleStartScan}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/30 transition"
              >
                <Play size={14} className="fill-current" />
                {hasScanned ? "重新透视分析" : "开始透视分析"}
              </button>
            )}

            {hasScanned && (
              <button
                onClick={() => fetchDir(currentPath)}
                disabled={loading}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition"
                title="刷新当前目录"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            )}
          </div>
        </div>

        {/* 路径输入与导航栏 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            disabled={history.length <= 1}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-xs font-medium text-slate-300 transition shrink-0"
          >
            返回
          </button>
          <button
            onClick={handleUpDir}
            disabled={currentPath.length <= 3}
            className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-slate-300 transition shrink-0"
            title="向上一级目录"
          >
            <ArrowUp size={14} />
          </button>

          <form onSubmit={handleInputSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="输入或粘贴目标磁盘或文件夹绝对路径..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition shrink-0"
            >
              前往
            </button>
          </form>
        </div>
      </div>

      {/* 核心内容区：左侧目录树形表格 + 右侧属性与安全解析 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 未触发扫描时的就绪等待区 */}
        {!hasScanned && !loading && nodes.length === 0 ? (
          <div className="flex-1 bg-slate-900/60 border border-slate-800/80 rounded-xl flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-950/60 border border-blue-800/40 flex items-center justify-center text-blue-400 mb-4 shadow-lg shadow-blue-900/20">
              <HardDrive size={32} />
            </div>

            <h3 className="text-base font-bold text-slate-100">
              就绪：目标路径「{currentPath}」
            </h3>

            <p className="text-xs text-slate-400 max-w-md mt-2 leading-relaxed">
              为杜绝软件启动时因全盘遍历造成的卡顿与高负荷，C-Space 采用<strong>按需手动触发机制</strong>。
              你可以随时切换磁盘或选择文件夹，确认无误后点击下方按钮开启透视。
            </p>

            {activeDriveInfo && (
              <div className="mt-4 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-6 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">磁盘盘符</span>
                  <strong className="text-slate-200 font-mono text-sm">{activeDriveInfo.letter}:</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">可用空间</span>
                  <strong className="text-emerald-400 font-mono">{formatBytes(activeDriveInfo.free)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">总容量</span>
                  <strong className="text-slate-300 font-mono">{formatBytes(activeDriveInfo.total)}</strong>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleStartScan}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition"
              >
                <Play size={15} className="fill-current" />
                开始透视分析当前目录
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 目录表格 */}
            <div className="flex-[3] bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col">
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-800/40 text-xs font-semibold text-slate-400 border-b border-slate-800">
                <span className="col-span-5">名称 / 路径</span>
                <span className="col-span-2 text-right">大小</span>
                <span className="col-span-2 text-right">文件数</span>
                <span className="col-span-3 text-center">用途与特征</span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
                {nodes.length === 0 && !loading && (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    当前目录为空或没有读取权限
                  </div>
                )}

                {nodes.map((node) => {
                  const isSelected = selectedNode?.path === node.path;
                  return (
                    <div
                      key={node.path}
                      onClick={() => setSelectedNode(node)}
                      onDoubleClick={() => handleOpenDir(node)}
                      className={`grid grid-cols-12 gap-2 px-4 py-2 text-xs items-center cursor-pointer transition select-none ${
                        isSelected ? "bg-blue-600/20" : "hover:bg-slate-800/40"
                      }`}
                    >
                      {/* 名称与图标 */}
                      <div className="col-span-5 flex items-center gap-2 overflow-hidden">
                        {node.isDir ? (
                          <Folder
                            size={15}
                            className={
                              node.isLink
                                ? "text-purple-400 fill-purple-400/20 shrink-0"
                                : "text-blue-400 fill-blue-400/20 shrink-0"
                            }
                          />
                        ) : (
                          <div className="w-3.5 h-3.5 border border-slate-600 rounded shrink-0" />
                        )}
                        <span
                          className={`truncate font-medium ${
                            node.isLink ? "text-purple-300 font-mono" : "text-slate-200"
                          }`}
                          title={node.name}
                        >
                          {node.name}
                        </span>
                        {node.isLink && (
                          <span className="text-[10px] bg-purple-950/80 text-purple-300 border border-purple-800/60 px-1 rounded shrink-0">
                            联接
                          </span>
                        )}
                      </div>

                      {/* 大小 */}
                      <div className="col-span-2 text-right font-mono text-slate-300">
                        {node.isLink ? (
                          <span className="text-[10px] text-purple-400">已搬迁</span>
                        ) : (
                          formatBytes(node.size)
                        )}
                      </div>

                      {/* 文件数 */}
                      <div className="col-span-2 text-right font-mono text-slate-400">
                        {node.fileCount > 0 ? `${node.fileCount} 项` : "-"}
                      </div>

                      {/* 用途与标识 */}
                      <div className="col-span-3 flex items-center justify-center gap-1.5 overflow-hidden">
                        {node.purpose ? (
                          <span className="truncate text-[11px] bg-slate-800/80 px-2 py-0.5 rounded text-slate-300 border border-slate-700/60">
                            {node.purpose}
                          </span>
                        ) : node.isHeuristic ? (
                          <span className="truncate text-[10px] text-slate-500 italic">
                            推断缓存
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600">-</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 底部汇总 */}
              <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span>
                    已扫描 <strong className="text-slate-200">{nodes.length}</strong> 项
                  </span>
                  {loading && (
                    <span className="flex items-center gap-1.5 text-blue-400">
                      <RefreshCw size={12} className="animate-spin" />
                      正在流式分析子目录大小...
                    </span>
                  )}
                </div>
                <span>
                  当前层级合计:{" "}
                  <strong className="text-blue-400 font-mono">
                    {formatBytes(totalDirSize)}
                  </strong>
                </span>
              </div>
            </div>

            {/* 右侧属性看板 */}
            <div className="flex-1 bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between overflow-y-auto">
              {selectedNode ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 break-all">
                      {selectedNode.name}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400 break-all mt-1 bg-slate-950 p-2 rounded-lg border border-slate-800/60">
                      {selectedNode.path}
                    </p>
                  </div>

                  {/* 空间占用看板 */}
                  <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">体积占用:</span>
                      <span className="font-mono text-blue-400 font-bold">
                        {selectedNode.isLink ? "0 (已迁移)" : formatBytes(selectedNode.size)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">子文件数:</span>
                      <span className="font-mono text-slate-200">
                        {selectedNode.fileCount} 项
                      </span>
                    </div>
                    {selectedNode.isLink && selectedNode.linkTarget && (
                  <div className="pt-2 border-t border-slate-800 text-xs">
                    <span className="text-purple-400 font-medium block mb-1">
                      重定向目标路径:
                    </span>
                    <span className="font-mono text-[10px] text-slate-300 break-all">
                      {selectedNode.linkTarget}
                    </span>
                  </div>
                )}
              </div>

              {/* 风险级别与用途 */}
              <div className="space-y-2">
                <span className="text-xs text-slate-400 font-medium">用途与安全建议:</span>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1.5 text-xs">
                  <div className="font-medium text-slate-200">
                    {selectedNode.purpose || "未归类常规目录"}
                  </div>
                  {selectedNode.risk && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {selectedNode.risk === "safe" && (
                        <span className="px-1.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded text-[10px] font-semibold">
                          安全可清
                        </span>
                      )}
                      {selectedNode.risk === "caution" && (
                        <span className="px-1.5 py-0.5 bg-amber-950/60 text-amber-400 border border-amber-800/60 rounded text-[10px] font-semibold">
                          谨慎操作
                        </span>
                      )}
                      {selectedNode.risk === "danger" && (
                        <span className="px-1.5 py-0.5 bg-rose-950/60 text-rose-400 border border-rose-800/60 rounded text-[10px] font-semibold">
                          高危核心
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">
                        {selectedNode.riskNote}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 动作建议 */}
              <div className="space-y-2 pt-2">
                {selectedNode.migratable && onNavigateToMigrate && (
                  <button
                    onClick={() => onNavigateToMigrate(selectedNode.path)}
                    className="w-full py-2 px-3 bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow transition"
                  >
                    <span>无损搬家到其他磁盘</span>
                    <ArrowRight size={13} />
                  </button>
                )}
                {selectedNode.isDir && !selectedNode.isLink && (
                  <button
                    onClick={() => handleOpenDir(selectedNode)}
                    className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
                  >
                    <span>深入查看子文件夹</span>
                    <CornerDownRight size={13} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center p-4">
              <Folder size={36} className="text-slate-700 mb-2" />
              <span>单击任意文件或目录查看属性分析与搬家/清理建议</span>
            </div>
          )}
        </div>
        </>
      )}
      </div>
    </div>
  );
};
