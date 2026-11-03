import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Trash2, ShieldCheck, RefreshCw, CheckCircle, Play, Sparkles } from "lucide-react";
import { CleanItemSummary, CleanProgress, CleanResult } from "../types";
import { formatBytes } from "../utils";

export const CleanerView: React.FC = () => {
  const [items, setItems] = useState<CleanItemSummary[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [toRecycleBin, setToRecycleBin] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasScanned, setHasScanned] = useState<boolean>(false);
  const [cleaning, setCleaning] = useState<boolean>(false);
  const [progress, setProgress] = useState<CleanProgress | null>(null);
  const [lastResult, setLastResult] = useState<CleanResult | null>(null);

  const fetchCandidates = async () => {
    setLoading(true);
    setHasScanned(true);
    try {
      const res = await invoke<CleanItemSummary[]>("get_clean_candidates");
      setItems(res);
      // 默认选中所有安全 🟢 级别的项
      const safePaths = new Set(res.filter((i) => i.risk === "safe").map((i) => i.path));
      setSelectedPaths(safePaths);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 监听进度，但不自动执行全盘遍历，由用户主动点击触发
    const unlisten = listen<CleanProgress>("clean-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const toggleSelect = (path: string, risk: string) => {
    if (risk === "danger") return; // 危险项强制禁止选中清理
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  };

  const selectAllSafe = () => {
    const safePaths = new Set(items.filter((i) => i.risk === "safe").map((i) => i.path));
    setSelectedPaths(safePaths);
  };

  const handleClean = async () => {
    if (selectedPaths.size === 0) return;
    setCleaning(true);
    setProgress(null);
    setLastResult(null);
    try {
      const res = await invoke<CleanResult>("run_clean", {
        paths: Array.from(selectedPaths),
        toRecycleBin,
      });
      setLastResult(res);
      await fetchCandidates();
    } catch (e) {
      console.error(e);
    } finally {
      setCleaning(false);
      setProgress(null);
    }
  };

  const totalSelectedBytes = items
    .filter((i) => selectedPaths.has(i.path))
    .reduce((acc, curr) => acc + curr.bytes, 0);

  return (
    <div className="flex h-full flex-col p-4 gap-4">
      {/* 顶部统计面板 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">已选可清理体积</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {formatBytes(totalSelectedBytes)}
            </div>
          </div>
          <ShieldCheck size={32} className="text-emerald-500/40" />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">已选中项目</span>
            <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
              {selectedPaths.size} <span className="text-xs font-normal text-slate-400">/ {items.length} 项</span>
            </div>
          </div>
          <button
            onClick={fetchCandidates}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
            title="扫描可清理缓存"
          >
            {loading ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={13} className="fill-current" />
            )}
            <span>{hasScanned ? "重新扫描" : "开始扫描"}</span>
          </button>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs text-slate-400">安全删除策略</span>
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="deleteMode"
                checked={toRecycleBin}
                onChange={() => setToRecycleBin(true)}
                className="accent-emerald-500"
              />
              移入系统回收站 (推荐)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-amber-300 cursor-pointer">
              <input
                type="radio"
                name="deleteMode"
                checked={!toRecycleBin}
                onChange={() => setToRecycleBin(false)}
                className="accent-amber-500"
              />
              直接永久删除 (极速)
            </label>
          </div>
        </div>
      </div>

      {/* 清理实时进度指示器 */}
      {cleaning && progress && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-emerald-400" />
              {progress.message}
            </span>
            <span className="font-mono text-emerald-400 font-semibold">{progress.percent.toFixed(0)}%</span>
          </div>

          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-emerald-500 h-full transition-all duration-150 rounded-full"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-500">
            <span className="font-mono truncate max-w-[70%]" title={progress.currentPath}>
              {progress.currentPath || "正在处理..."}
            </span>
            <span>
              已释放: <strong className="text-emerald-400 font-mono">{formatBytes(progress.freedBytes)}</strong> | 已删文件: <strong className="text-slate-300 font-mono">{progress.deletedFiles}</strong>
            </span>
          </div>
        </div>
      )}

      {/* 清理结果提示 */}
      {lastResult && (
        <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <span>
              清理完成！本次共释放 <strong>{formatBytes(lastResult.freedBytes)}</strong>，删除了 {lastResult.deletedFiles} 个文件
              {lastResult.skippedFiles > 0 && `，跳过被占用文件 ${lastResult.skippedFiles} 个`}
            </span>
          </div>
          <button onClick={() => setLastResult(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* 清理列表 */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-0">
        <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-800 flex justify-between items-center text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-300">智能清理候选项</span>
            {hasScanned && items.length > 0 && (
              <button
                onClick={selectAllSafe}
                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[11px]"
              >
                仅勾选推荐项 (🟢 安全)
              </button>
            )}
          </div>
          <span className="text-slate-500">根据 50+ 规则库与启发式引擎智能过滤</span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {!hasScanned && !loading ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 mb-3 shadow">
                <Sparkles size={28} />
              </div>
              <h3 className="text-sm font-bold text-slate-200">
                就绪：专项智能清理
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                已关闭自动开机扫描，避免后台卡顿。点击下方按钮开始检索系统日志、浏览器与软件临时缓存。
              </p>
              <button
                onClick={fetchCandidates}
                className="mt-4 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition"
              >
                <Play size={14} className="fill-current" />
                开始扫描可清理项
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
              <RefreshCw size={24} className="animate-spin text-emerald-500" />
              <span className="text-xs">正在根据内置规则库扫描 C 盘常见应用与系统缓存...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
              <CheckCircle size={32} className="text-emerald-500/40" />
              <span className="text-xs">太棒了！当前没有检测到积压的无用缓存</span>
            </div>
          ) : (
            items.map((item) => {
              const checked = selectedPaths.has(item.path);
              const isDanger = item.risk === "danger";

              return (
                <div
                  key={item.path}
                  onClick={() => toggleSelect(item.path, item.risk)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition select-none ${
                    checked ? "bg-emerald-950/20" : "hover:bg-slate-800/40"
                  } ${isDanger ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isDanger}
                      onChange={() => toggleSelect(item.path, item.risk)}
                      className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-xs">{item.name}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                          {item.category}
                        </span>
                        {item.risk === "safe" && (
                          <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                            🟢 安全
                          </span>
                        )}
                        {item.risk === "caution" && (
                          <span className="text-[10px] bg-amber-950/80 text-amber-400 border border-amber-800/60 px-1.5 py-0.5 rounded">
                            🟡 谨慎
                          </span>
                        )}
                        {item.risk === "danger" && (
                          <span className="text-[10px] bg-rose-950/80 text-rose-400 border border-rose-800/60 px-1.5 py-0.5 rounded">
                            🔴 高危保护
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-xl" title={item.path}>
                        {item.path}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {item.riskNote}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-emerald-400 font-bold text-xs">
                      {formatBytes(item.bytes)}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      约 {item.fileCount} 个文件
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部操作工具栏 */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center">
          <span className="text-xs text-slate-500">
            {selectedPaths.size > 0
              ? `已选中 ${selectedPaths.size} 项，共 ${formatBytes(totalSelectedBytes)}`
              : "请勾选需要清理的目录"}
          </span>

          <button
            onClick={handleClean}
            disabled={selectedPaths.size === 0 || cleaning}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-lg shadow-emerald-900/30 transition"
          >
            <Trash2 size={15} />
            {cleaning ? "正在清理中..." : `立即安全清理 (${formatBytes(totalSelectedBytes)})`}
          </button>
        </div>
      </div>
    </div>
  );
};
