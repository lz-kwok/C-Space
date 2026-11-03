import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Copy,
  FolderOpen,
  Trash2,
  Link2,
  RotateCw,
  StopCircle,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";
import { DuplicateGroup, ScanStatusEvent } from "../types";
import { formatBytes } from "../utils";

const MIN_SIZE_OPTIONS = [
  { label: "≥ 5 MB", value: 5 * 1024 * 1024 },
  { label: "≥ 10 MB (推荐)", value: 10 * 1024 * 1024 },
  { label: "≥ 50 MB", value: 50 * 1024 * 1024 },
  { label: "≥ 100 MB", value: 100 * 1024 * 1024 },
  { label: "≥ 500 MB", value: 500 * 1024 * 1024 },
];

export const DuplicatesView: React.FC = () => {
  const [minBytes, setMinBytes] = useState<number>(10 * 1024 * 1024);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatus, setScanStatus] = useState<ScanStatusEvent | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  // 记录每个组中哪个是 primary（保留文件 path）
  const [primaryMap, setPrimaryMap] = useState<Record<string, string>>({});
  // 记录用户勾选待处理的副本文件 paths
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<boolean>(false);
  const [processMessage, setProcessMessage] = useState<string>("");

  useEffect(() => {
    const unlisten = listen<ScanStatusEvent>("dup-file-scan-progress", (event) => {
      setScanStatus(event.payload);
      if (event.payload.isDone) {
        setIsScanning(false);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleStartScan = async () => {
    setIsScanning(true);
    setGroups([]);
    setSelectedPaths(new Set());
    setPrimaryMap({});
    setScanStatus({
      taskType: "dup_scan",
      currentPath: "正在初始化快速采样比对引擎...",
      scannedFiles: 0,
      message: "准备扫描用户工作区及常用目录...",
      isDone: false,
    });

    try {
      const res = await invoke<DuplicateGroup[]>("get_duplicate_files", {
        minBytes,
        targetDirs: [], // 默认扫描用户根目录
      });
      setGroups(res);

      // 默认策略：保留每组中的第一个文件，其余标记为选中副本
      const pMap: Record<string, string> = {};
      const sel = new Set<string>();

      res.forEach((g) => {
        if (g.files.length > 0) {
          const prim = g.files[0].path;
          pMap[g.groupId] = prim;
          g.files.slice(1).forEach((f) => sel.add(f.path));
        }
      });

      setPrimaryMap(pMap);
      setSelectedPaths(sel);
    } catch (e) {
      console.error(e);
      alert(`重复文件扫描失败: ${e}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleCancelScan = async () => {
    try {
      await invoke("cancel_scan");
    } catch (e) {
      console.error(e);
    }
  };

  // 智能选择辅助函数
  const applySmartSelection = (mode: "newest" | "oldest" | "shortest") => {
    const newPrimaryMap: Record<string, string> = {};
    const newSelected = new Set<string>();

    groups.forEach((g) => {
      if (g.files.length === 0) return;

      let chosenPrimary = g.files[0];

      if (mode === "newest") {
        // 保留修改时间最新的
        chosenPrimary = [...g.files].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0];
      } else if (mode === "oldest") {
        // 保留修改时间最旧的
        chosenPrimary = [...g.files].sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime))[0];
      } else if (mode === "shortest") {
        // 保留路径最短的
        chosenPrimary = [...g.files].sort((a, b) => a.path.length - b.path.length)[0];
      }

      newPrimaryMap[g.groupId] = chosenPrimary.path;

      g.files.forEach((f) => {
        if (f.path !== chosenPrimary.path) {
          newSelected.add(f.path);
        }
      });
    });

    setPrimaryMap(newPrimaryMap);
    setSelectedPaths(newSelected);
  };

  const toggleSelect = (path: string, groupId: string) => {
    if (primaryMap[groupId] === path) {
      return; // 保留文件不能直接被勾选为待删除副本
    }
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  };

  const setGroupPrimary = (groupId: string, newPrimaryPath: string) => {
    setPrimaryMap((prev) => ({ ...prev, [groupId]: newPrimaryPath }));
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.delete(newPrimaryPath); // 保留的主文件不可选
      return next;
    });
  };

  const handleOpenExplorer = async (path: string) => {
    try {
      await invoke("open_in_explorer", { path });
    } catch (e) {
      alert(`无法在资源管理器中定位: ${e}`);
    }
  };

  // 替换为硬链接 (推荐)
  const handleReplaceWithHardlink = async () => {
    if (selectedPaths.size === 0) return;

    if (
      !confirm(
        `确定将选中的 ${selectedPaths.size} 个副本文件替换为指向原文件的硬链接 (NTFS Hardlink) 吗？\n\n` +
          `优势：\n` +
          `1. 立即释放对应空间（等同于删除副本的空间回收效果）；\n` +
          `2. 保持所有路径完全正常可读写，不破坏原软件使用！`
      )
    )
      return;

    setProcessing(true);
    setProcessMessage("正在执行硬链接替换...");

    let successCount = 0;
    const errors: string[] = [];

    for (const group of groups) {
      const primaryPath = primaryMap[group.groupId];
      if (!primaryPath) continue;

      for (const file of group.files) {
        if (selectedPaths.has(file.path) && file.path !== primaryPath) {
          try {
            await invoke("replace_dup_with_link", {
              originalPath: primaryPath,
              duplicatePath: file.path,
              linkType: "hardlink",
            });
            successCount++;
          } catch (e: any) {
            errors.push(`${file.path}: ${e}`);
          }
        }
      }
    }

    setProcessing(false);
    setProcessMessage("");

    if (errors.length > 0) {
      alert(`部分硬链接替换失败:\n${errors.join("\n")}`);
    } else {
      alert(`成功将 ${successCount} 个重复副本替换为硬链接！所有软件照常使用，磁盘空间已释放。`);
    }

    // 重新扫描以更新状态
    handleStartScan();
  };

  // 移入回收站
  const handleBatchTrash = async () => {
    if (selectedPaths.size === 0) return;

    if (
      !confirm(
        `确定将选中的 ${selectedPaths.size} 个重复副本移入 Windows 回收站吗？\n` +
          `（保留的原文件将不受影响）`
      )
    )
      return;

    setProcessing(true);
    setProcessMessage("正在移入回收站...");

    let successCount = 0;
    const errors: string[] = [];

    for (const path of Array.from(selectedPaths)) {
      try {
        await invoke("trash_file", { filePath: path });
        successCount++;
      } catch (e: any) {
        errors.push(`${path}: ${e}`);
      }
    }

    setProcessing(false);
    setProcessMessage("");

    if (errors.length > 0) {
      alert(`部分文件删除失败:\n${errors.join("\n")}`);
    } else {
      alert(`成功将 ${successCount} 个重复副本移入回收站！`);
    }

    // 重新扫描
    handleStartScan();
  };

  const totalWastedBytes = groups.reduce((acc, g) => acc + g.wastedBytes, 0);

  // 计算当前选中的副本能释放的容量
  const currentReclaimBytes = groups.reduce((acc, g) => {
    const selectedInGroup = g.files.filter(
      (f) => selectedPaths.has(f.path) && f.path !== primaryMap[g.groupId]
    );
    return acc + selectedInGroup.length * g.sizeEach;
  }, 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-4">
      {/* 头部控制栏 */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Copy className="text-indigo-400" size={20} />
            重复文件两阶段哈希比对
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            采用「尺寸精确筛选 + 头尾 16KB 采样 + 全文 SHA-256 终审」，100% 杜绝误判，支持移入回收站或无损硬链接替换。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <SlidersHorizontal size={13} className="text-slate-400" />
            <span className="text-slate-400">最小阈值:</span>
            <select
              value={minBytes}
              onChange={(e) => setMinBytes(Number(e.target.value))}
              disabled={isScanning || processing}
              className="bg-transparent text-slate-200 outline-none text-xs cursor-pointer"
            >
              {MIN_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {isScanning ? (
            <button
              onClick={handleCancelScan}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-red-600/20 transition"
            >
              <StopCircle size={15} />
              停止扫描
            </button>
          ) : (
            <button
              onClick={handleStartScan}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
            >
              <RotateCw size={15} />
              扫描重复文件
            </button>
          )}
        </div>
      </div>

      {/* 扫描进度 */}
      {isScanning && scanStatus && (
        <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-xl p-3 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <RotateCw size={16} className="text-indigo-400 animate-spin" />
            <div className="text-xs">
              <span className="text-indigo-200 font-semibold">{scanStatus.message}</span>
              <p className="text-[11px] text-slate-400 truncate max-w-xl font-mono mt-0.5">
                {scanStatus.currentPath}
              </p>
            </div>
          </div>
          <span className="text-xs text-indigo-400 font-mono">
            已检索 {scanStatus.scannedFiles} 项
          </span>
        </div>
      )}

      {/* 处理操作中提示 */}
      {processing && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 flex items-center gap-3 animate-pulse">
          <RotateCw size={16} className="text-amber-400 animate-spin" />
          <span className="text-xs text-amber-200 font-semibold">{processMessage}</span>
        </div>
      )}

      {/* 快捷选择与批量操作工具栏 */}
      {groups.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">智能标记:</span>
            <button
              onClick={() => applySmartSelection("newest")}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              保留最新
            </button>
            <button
              onClick={() => applySmartSelection("oldest")}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              保留最旧
            </button>
            <button
              onClick={() => applySmartSelection("shortest")}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              保留最短路径
            </button>
            <button
              onClick={() => setSelectedPaths(new Set())}
              className="px-2.5 py-1 bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-medium border border-slate-800 transition"
            >
              全部取消
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400">
              共发现 <strong className="text-slate-200">{groups.length}</strong> 组重复文件，
              浪费空间 <strong className="text-rose-400">{formatBytes(totalWastedBytes)}</strong>
              {selectedPaths.size > 0 && (
                <span className="ml-2 text-indigo-300">
                  (已选可释放 {formatBytes(currentReclaimBytes)})
                </span>
              )}
            </div>

            {selectedPaths.size > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReplaceWithHardlink}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
                  title="删除副本并在原位置创建硬链接，既释放空间，又保证原程序路径有效"
                >
                  <Link2 size={13} />
                  替换为硬链接 (推荐)
                </button>

                <button
                  onClick={handleBatchTrash}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
                  title="直接将选中的副本放入 Windows 回收站"
                >
                  <Trash2 size={13} />
                  移入回收站
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 重复文件组卡片列表 */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-y-auto p-4 space-y-4">
        {groups.length === 0 && !isScanning ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <Copy size={44} className="text-slate-700 mb-3" />
            <h3 className="text-sm font-semibold text-slate-400">未扫描或未发现重复文件</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              点击右上角「扫描重复文件」，将通过多阶段哈希比对定位用户主目录下的重复数据。
            </p>
          </div>
        ) : (
          groups.map((group, gIdx) => {
            const primaryPath = primaryMap[group.groupId];

            return (
              <div
                key={group.groupId}
                className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden"
              >
                {/* 组头 */}
                <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-300">
                      #{gIdx + 1}
                    </span>
                    <span className="bg-indigo-950/60 text-indigo-300 px-2 py-0.5 rounded text-[11px] font-mono border border-indigo-800/40">
                      SHA256: {group.hash.slice(0, 12)}...
                    </span>
                    <span className="text-slate-400">
                      单份大小: <strong className="text-slate-200">{formatBytes(group.sizeEach)}</strong>
                    </span>
                  </div>

                  <div className="text-xs">
                    <span className="text-slate-400">冗余浪费: </span>
                    <strong className="text-rose-400 font-mono">
                      {formatBytes(group.wastedBytes)}
                    </strong>
                    <span className="text-slate-500 ml-2">({group.files.length} 份相同文件)</span>
                  </div>
                </div>

                {/* 文件项列表 */}
                <div className="divide-y divide-slate-800/50">
                  {group.files.map((file) => {
                    const isPrimary = file.path === primaryPath;
                    const isSelected = selectedPaths.has(file.path);

                    return (
                      <div
                        key={file.path}
                        className={`px-4 py-2.5 flex items-center justify-between text-xs transition ${
                          isPrimary
                            ? "bg-emerald-950/15"
                            : isSelected
                            ? "bg-indigo-950/20"
                            : "hover:bg-slate-800/30"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* 状态操作 */}
                          {isPrimary ? (
                            <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 rounded text-[10px] font-bold">
                              <ShieldCheck size={12} />
                              保留主文件
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(file.path, group.groupId)}
                              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                              title="勾选作为待处理副本"
                            />
                          )}

                          {/* 路径与修改时间 */}
                          <div className="min-w-0 flex-1">
                            <p
                              className={`font-mono truncate text-[11px] ${
                                isPrimary ? "text-emerald-200 font-medium" : "text-slate-300"
                              }`}
                              title={file.path}
                            >
                              {file.path}
                            </p>
                            <span className="text-[10px] text-slate-500">
                              修改时间: {file.modifiedTime}
                            </span>
                          </div>
                        </div>

                        {/* 右侧动作 */}
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          {!isPrimary && (
                            <button
                              onClick={() => setGroupPrimary(group.groupId, file.path)}
                              className="text-[10px] text-slate-400 hover:text-emerald-300 px-2 py-0.5 rounded border border-slate-800 hover:border-emerald-700/50 transition"
                            >
                              设为保留项
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenExplorer(file.path)}
                            title="在资源管理器中定位"
                            className="p-1 hover:bg-slate-700/80 rounded text-slate-400 hover:text-slate-200 transition"
                          >
                            <FolderOpen size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
