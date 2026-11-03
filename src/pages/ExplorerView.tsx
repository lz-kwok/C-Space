import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Folder, HardDrive, RefreshCw, AlertTriangle, ArrowRight, CornerDownRight, ExternalLink } from "lucide-react";
import { FileNode, ScanProgressEvent } from "../types";
import { formatBytes } from "../utils";

interface Props {
  onNavigateToMigrate?: (path: string) => void;
}

export const ExplorerView: React.FC<Props> = ({ onNavigateToMigrate }) => {
  const [currentPath, setCurrentPath] = useState<string>("C:\\");
  const [history, setHistory] = useState<string[]>(["C:\\"]);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const activeScanIdRef = useRef<string>("");

  useEffect(() => {
    // 监听渐进式扫描推送事件
    const unlisten = listen<ScanProgressEvent>("scan-node-found", (event) => {
      const payload = event.payload;
      if (payload.scanId !== activeScanIdRef.current) return;

      if (payload.isDone) {
        setLoading(false);
        return;
      }

      setNodes((prev) => {
        // 去重并按大小实时排队插入
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
    const scanId = `scan-${Date.now()}`;
    activeScanIdRef.current = scanId;
    setLoading(true);
    setNodes([]); // 清空上一层，准备渐进式填充
    setSelectedNode(null);

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

  useEffect(() => {
    fetchDir(currentPath);
  }, [currentPath]);

  const handleOpenDir = (node: FileNode) => {
    if (!node.isDir || node.isLink) return;
    setHistory([...history, node.path]);
    setCurrentPath(node.path);
  };

  const handleBack = () => {
    if (history.length <= 1) return;
    const newHist = [...history];
    newHist.pop();
    const prev = newHist[newHist.length - 1];
    setHistory(newHist);
    setCurrentPath(prev);
  };

  const totalDirSize = nodes.reduce((acc, curr) => acc + curr.size, 0);

  return (
    <div className="flex h-full flex-col p-4 gap-4">
      {/* 顶部路径与快捷跳转 */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center gap-2 flex-1 overflow-hidden">
          <button
            onClick={handleBack}
            disabled={history.length <= 1}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-sm transition"
          >
            返回
          </button>
          <div className="font-mono text-sm px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg flex-1 truncate text-slate-300">
            {currentPath}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 常用目录快速入口 */}
          <button
            onClick={() => {
              setHistory([...history, "C:\\Users"]);
              setCurrentPath("C:\\Users");
            }}
            className="text-xs px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
          >
            Users
          </button>
          <button
            onClick={() => {
              setHistory([...history, "C:\\Program Files"]);
              setCurrentPath("C:\\Program Files");
            }}
            className="text-xs px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
          >
            Program Files
          </button>
          <button
            onClick={() => fetchDir(currentPath)}
            disabled={loading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
            title="刷新"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 核心内容区：左侧目录树形表格 + 右侧属性与安全解析 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 目录表格 */}
        <div className="flex-[3] bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col">
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-800/40 text-xs font-semibold text-slate-400 border-b border-slate-800">
            <div className="col-span-5">名称</div>
            <div className="col-span-2">大小 / 占比</div>
            <div className="col-span-3">用途识别</div>
            <div className="col-span-2 text-right">风险属性</div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
            {loading && nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
                <RefreshCw size={24} className="animate-spin text-blue-500" />
                <span className="text-xs">正在流式探测目录大小与识别用途...</span>
              </div>
            ) : nodes.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                当前目录下为空或无访问权限
              </div>
            ) : (
              <>
                {loading && (
                  <div className="flex items-center justify-between px-4 py-2 bg-blue-950/20 border-b border-blue-900/30 text-xs text-blue-300">
                    <span className="flex items-center gap-2">
                      <RefreshCw size={12} className="animate-spin text-blue-400" />
                      正在渐进式读取更多目录项 (已发现 {nodes.length} 项)...
                    </span>
                    <span className="text-[10px] text-blue-400/80">已扫描项已按体积排序显示</span>
                  </div>
                )}
                {nodes.map((node) => {
                  const percent = totalDirSize > 0 ? (node.size / totalDirSize) * 100 : 0;
                  const isSelected = selectedNode?.path === node.path;

                return (
                  <div
                    key={node.path}
                    onClick={() => setSelectedNode(node)}
                    onDoubleClick={() => handleOpenDir(node)}
                    className={`grid grid-cols-12 gap-2 px-4 py-2.5 items-center cursor-pointer transition text-xs select-none ${
                      isSelected ? "bg-blue-600/15 border-l-2 border-blue-500" : "hover:bg-slate-800/30"
                    }`}
                  >
                    {/* 名称 */}
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      {node.isLink ? (
                        <ExternalLink size={16} className="text-purple-400 shrink-0" />
                      ) : node.isDir ? (
                        <Folder size={16} className="text-amber-400 shrink-0" />
                      ) : (
                        <HardDrive size={16} className="text-slate-400 shrink-0" />
                      )}
                      <span className="truncate text-slate-200 font-medium" title={node.name}>
                        {node.name}
                      </span>
                      {node.isLink && (
                        <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                          Junction / 链接
                        </span>
                      )}
                    </div>

                    {/* 大小与占比条 */}
                    <div className="col-span-2 flex flex-col justify-center">
                      <div className="font-mono text-slate-300">
                        {node.isLink ? "软链接" : formatBytes(node.size)}
                      </div>
                      {!node.isLink && percent > 0 && (
                        <div className="w-full bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full"
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* 用途识别 */}
                    <div className="col-span-3 text-slate-400 truncate" title={node.purpose || "未识别用途"}>
                      {node.purpose ? (
                        <span className="text-slate-300">{node.purpose}</span>
                      ) : (
                        <span className="text-slate-600 italic">常规文件夹</span>
                      )}
                    </div>

                    {/* 风险标签 */}
                    <div className="col-span-2 flex justify-end">
                      {node.risk === "safe" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          🟢 安全可清理
                        </span>
                      )}
                      {node.risk === "caution" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                          🟡 谨慎清理
                        </span>
                      )}
                      {node.risk === "danger" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                          🔴 核心高危
                        </span>
                      )}
                      {!node.risk && (
                        <span className="text-slate-600 text-[11px]">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
              </>
            )}
          </div>
        </div>

        {/* 详情与操作侧栏 */}
        <div className="flex-[2] bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
          {selectedNode ? (
            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">选中项详情</span>
                <h3 className="text-base font-bold text-slate-100 mt-1 break-all">{selectedNode.name}</h3>
                <p className="text-xs font-mono text-slate-400 break-all mt-1">{selectedNode.path}</p>
              </div>

              {/* 空间分析 */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">总占用容量</span>
                  <span className="font-mono text-slate-200 font-semibold">{formatBytes(selectedNode.size)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">包含文件总数</span>
                  <span className="font-mono text-slate-200">{selectedNode.fileCount.toLocaleString()} 个</span>
                </div>
                {selectedNode.isLink && (
                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-xs text-purple-400 font-medium flex items-center gap-1">
                      <CornerDownRight size={14} /> 实际映射目标：
                    </span>
                    <p className="text-xs font-mono text-slate-300 break-all mt-0.5">
                      {selectedNode.linkTarget || "未知目标"}
                    </p>
                  </div>
                )}
              </div>

              {/* 规则与用途分析 */}
              <div className="space-y-2">
                <span className="text-xs text-slate-500 uppercase font-semibold">用途与风险分析</span>
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
                  <div>
                    <span className="text-xs text-slate-400">用途定位:</span>
                    <p className="text-xs text-slate-200 mt-0.5">{selectedNode.purpose || "常规用户/程序目录"}</p>
                  </div>
                  {selectedNode.riskNote && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-xs text-amber-400 flex items-center gap-1 font-medium">
                        <AlertTriangle size={12} /> 清理与操作说明:
                      </span>
                      <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{selectedNode.riskNote}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 操作按钮区 */}
              <div className="pt-2 space-y-2">
                {selectedNode.migratable && !selectedNode.isLink && (
                  <button
                    onClick={() => onNavigateToMigrate && onNavigateToMigrate(selectedNode.path)}
                    className="w-full py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg text-xs font-medium text-white shadow-lg flex items-center justify-center gap-1.5 transition"
                  >
                    无损搬家到其他盘 <ArrowRight size={14} />
                  </button>
                )}

                {selectedNode.isDir && !selectedNode.isLink && (
                  <button
                    onClick={() => handleOpenDir(selectedNode)}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs text-slate-300 font-medium transition"
                  >
                    进入下级子目录
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
              <Folder size={32} className="opacity-40" />
              <span className="text-xs">点击左侧目录项查看深度用途与风险分析</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

