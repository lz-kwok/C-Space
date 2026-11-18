import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Trash2,
  RefreshCw,
  CheckCircle,
  Play,
  Sparkles,
  HardDrive,
  Link2,
  FolderOpen,
  ArrowRight,
  TrendingDown,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  CleanItemSummary,
  CleanProgress,
  CleanResult,
  CDriveAuditReport,
} from "../types";
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

  // C 盘物理扇区系统级全景体检状态
  const [auditReport, setAuditReport] = useState<CDriveAuditReport | null>(null);
  const [auditing, setAuditing] = useState<boolean>(false);
  const [showReparseList, setShowReparseList] = useState<boolean>(true);
  const [showTopDirs, setShowTopDirs] = useState<boolean>(true);

  // 1. 常规快速规则扫描
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
      console.error("扫描可清理缓存失败:", e);
    } finally {
      setLoading(false);
    }
  };

  // 2. C 盘系统级物理透视深度体检 (严格排除软链穿透)
  const runPhysicalAudit = async () => {
    setAuditing(true);
    setHasScanned(true);
    try {
      const report = await invoke<CDriveAuditReport>("audit_c_drive_physical");
      setAuditReport(report);
      // 同时把安全清理项注入到待清理列表中，并自动全选安全项
      setItems(report.safeCleanItems);
      const safePaths = new Set(report.safeCleanItems.filter((i) => i.risk === "safe").map((i) => i.path));
      setSelectedPaths(safePaths);
    } catch (e) {
      console.error("C 盘全景体检失败:", e);
    } finally {
      setAuditing(false);
    }
  };

  useEffect(() => {
    const unlisten = listen<CleanProgress>("clean-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const toggleSelect = (path: string, risk: string) => {
    if (risk === "danger") return;
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
      // 清理后重新刷新体检状态
      if (auditReport) {
        await runPhysicalAudit();
      } else {
        await fetchCandidates();
      }
    } catch (e) {
      console.error("执行清理失败:", e);
    } finally {
      setCleaning(false);
      setProgress(null);
    }
  };

  const handleOpenPath = async (p: string) => {
    try {
      await invoke("open_in_explorer", { path: p });
    } catch (e) {
      console.error("无法打开路径:", e);
    }
  };

  const totalSelectedBytes = items
    .filter((i) => selectedPaths.has(i.path))
    .reduce((acc, curr) => acc + curr.bytes, 0);

  return (
    <div className="flex h-full flex-col p-4 gap-4 overflow-y-auto">
      {/* 顶部控制与全景体检面板 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                <HardDrive size={18} />
              </span>
              <h2 className="text-base font-bold text-slate-100">
                C 盘真实物理扇区深度透视 & 专项智能清理
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              原生切断 Junction / Symlink 跨卷递归穿透误算，真实衡量 C 盘物理占用，一键清洗系统与开发垃圾。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runPhysicalAudit}
              disabled={auditing || loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-700/20 transition disabled:opacity-50"
            >
              {auditing ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              <span>{auditReport ? "重新物理深度体检" : "一键全盘物理透视体检"}</span>
            </button>

            <button
              onClick={fetchCandidates}
              disabled={loading || auditing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition disabled:opacity-50"
              title="仅运行内置规则快速扫描"
            >
              {loading ? (
                <RefreshCw size={14} className="animate-spin text-emerald-400" />
              ) : (
                <Play size={13} className="fill-current text-slate-400" />
              )}
              <span>常规规则扫描</span>
            </button>
          </div>
        </div>

        {/* C 盘容量物理仪表盘 (体检后呈现) */}
        {auditReport && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 relative z-10">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] text-slate-400">C 盘物理可用空间</span>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {formatBytes(auditReport.freeBytes)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1">
                总容量 {formatBytes(auditReport.totalBytes)} · 已用 {formatBytes(auditReport.usedBytes)}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] text-slate-400">已生效软链接 (穿透豁免)</span>
              <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                {auditReport.reparsePoints.length} <span className="text-xs font-normal text-slate-400">处</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-semibold mt-1">
                已安全切断统计 · C 盘 0 物理占用
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] text-slate-400">可安全释放垃圾</span>
              <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
                {formatBytes(auditReport.totalCleanableBytes)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1">
                含 Playwright、临时文件、更新包等
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] text-slate-400">清理安全策略</span>
              <div className="flex flex-col gap-1.5 mt-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={toRecycleBin}
                    onChange={() => setToRecycleBin(true)}
                    className="accent-emerald-500"
                  />
                  放入回收站 (推荐)
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
        )}
      </div>

      {/* 已生效软链接 / Junction 穿透豁免专区 */}
      {auditReport && auditReport.reparsePoints.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div
            onClick={() => setShowReparseList(!showReparseList)}
            className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800/80 cursor-pointer flex justify-between items-center transition select-none"
          >
            <div className="flex items-center gap-2">
              <Link2 size={15} className="text-cyan-400" />
              <span className="text-xs font-bold text-slate-200">
                已生效软链接 / Junction 穿透豁免专区 ({auditReport.reparsePoints.length})
              </span>
              <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">
                物理占用: 0 B (已安全外迁其他磁盘)
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-[11px] hidden sm:inline">
                {showReparseList ? "收起" : "展开详情"}
              </span>
              {showReparseList ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {showReparseList && (
            <div className="divide-y divide-slate-800/50 p-2 space-y-1 max-h-56 overflow-y-auto">
              {auditReport.reparsePoints.map((rep, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 hover:bg-slate-800/40 transition text-xs"
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1 mr-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                      {rep.linkType}
                    </span>
                    <span className="font-semibold text-slate-200 truncate max-w-[200px]" title={rep.path}>
                      {rep.name}
                    </span>
                    <ArrowRight size={12} className="text-slate-500 flex-shrink-0" />
                    <span className="text-slate-400 font-mono truncate text-[11px]" title={rep.target}>
                      {rep.target}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        rep.isValid
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                          : "bg-rose-950 text-rose-400 border border-rose-800/60"
                      }`}
                    >
                      {rep.isValid ? "有效链接" : "目标丢失"}
                    </span>
                    <button
                      onClick={() => handleOpenPath(rep.path)}
                      className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded"
                      title="在资源管理器中定位"
                    >
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* C 盘真实物理大头 TOP 排行 */}
      {auditReport && auditReport.realTopDirs.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div
            onClick={() => setShowTopDirs(!showTopDirs)}
            className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800/80 cursor-pointer flex justify-between items-center transition select-none"
          >
            <div className="flex items-center gap-2">
              <TrendingDown size={15} className="text-amber-400" />
              <span className="text-xs font-bold text-slate-200">
                C 盘核心物理占用大头排行 (真实物理扇区统计)
              </span>
              <span className="text-[10px] text-slate-400">已排查所有重解析点，杜绝虚假大文件</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-[11px] hidden sm:inline">
                {showTopDirs ? "收起" : "展开排行"}
              </span>
              {showTopDirs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {showTopDirs && (
            <div className="divide-y divide-slate-800/40 p-2 space-y-1 max-h-64 overflow-y-auto">
              {auditReport.realTopDirs.map((dir, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 hover:bg-slate-800/40 transition text-xs"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {dir.category}
                    </span>
                    <span className="font-semibold text-slate-200 truncate max-w-[200px]" title={dir.path}>
                      {dir.name}
                    </span>
                    <span className="text-slate-500 font-mono text-[11px] truncate" title={dir.path}>
                      {dir.path}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        dir.isReparse
                          ? "bg-cyan-950/80 text-cyan-400 border border-cyan-800/60"
                          : dir.suggestion.includes("清理")
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                          : dir.suggestion.includes("迁移")
                          ? "bg-indigo-950 text-indigo-400 border border-indigo-800/60"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {dir.suggestion}
                    </span>

                    <div className="text-right w-24">
                      <div className="font-mono font-bold text-slate-200">
                        {dir.isReparse ? "0 B" : formatBytes(dir.sizeBytes)}
                      </div>
                      {!dir.isReparse && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          {dir.fileCount} 个文件
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleOpenPath(dir.path)}
                      className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded"
                      title="打开目录"
                    >
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 清理实时进度指示器 */}
      {cleaning && progress && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5 shadow-lg">
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
        <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-300 shadow">
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

      {/* 可安全清理项目列表 */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[300px] shadow">
        <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-800 flex justify-between items-center text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Layers size={14} className="text-emerald-400" />
              可安全清理候选项 ({items.length})
            </span>
            {hasScanned && items.length > 0 && (
              <button
                onClick={selectAllSafe}
                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[11px] transition"
              >
                仅勾选推荐项 (🟢 安全)
              </button>
            )}
          </div>
          <span className="text-slate-500 text-[11px]">
            覆盖 Playwright、Temp、npm-cache、微信/钉钉历史临时无害缓存等
          </span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {!hasScanned && !loading && !auditing ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 mb-3 shadow">
                <Sparkles size={28} />
              </div>
              <h3 className="text-sm font-bold text-slate-200">
                C 盘真实物理透视体检就绪
              </h3>
              <p className="text-xs text-slate-400 max-w-md mt-1">
                点击上方「一键全盘物理透视体检」，系统将精准排查所有软链接、测量真实占用大头并汇总可安全释放空间。
              </p>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={runPhysicalAudit}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-700/20 flex items-center gap-2 transition"
                >
                  <Sparkles size={14} />
                  开始全盘物理深度体检
                </button>
                <button
                  onClick={fetchCandidates}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition"
                >
                  常规规则扫描
                </button>
              </div>
            </div>
          ) : (loading || auditing) ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2.5">
              <RefreshCw size={24} className="animate-spin text-emerald-400" />
              <span className="text-xs font-medium">
                {auditing
                  ? "正在深度排查 C 盘 ReparsePoint (Junction) 并多核测量物理扇区真实占用..."
                  : "正在根据内置规则库扫描 C 盘缓存..."}
              </span>
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

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-mono text-emerald-400 font-bold text-xs">
                        {formatBytes(item.bytes)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        约 {item.fileCount} 个文件
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPath(item.path);
                      }}
                      className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded"
                      title="打开文件夹"
                    >
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部操作工具栏 */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center">
          <span className="text-xs text-slate-400">
            {selectedPaths.size > 0
              ? `已勾选 ${selectedPaths.size} 项，预计释放 ${formatBytes(totalSelectedBytes)}`
              : "请勾选需要清理的目录项"}
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
