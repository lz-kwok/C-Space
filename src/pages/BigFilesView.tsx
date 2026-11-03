import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Search,
  FolderOpen,
  Trash2,
  HardDrive,
  Copy,
  Check,
  RotateCw,
  SlidersHorizontal,
  FileBox,
  Film,
  Cpu,
  Archive,
  Database,
  Binary,
  Layers,
  StopCircle,
} from "lucide-react";
import { BigFileInfo, ScanStatusEvent } from "../types";
import { formatBytes } from "../utils";

const THRESHOLD_OPTIONS = [
  { label: "≥ 50 MB", value: 50 * 1024 * 1024 },
  { label: "≥ 100 MB (推荐)", value: 100 * 1024 * 1024 },
  { label: "≥ 500 MB", value: 500 * 1024 * 1024 },
  { label: "≥ 1 GB", value: 1024 * 1024 * 1024 },
  { label: "≥ 5 GB", value: 5 * 1024 * 1024 * 1024 },
];

const CATEGORY_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  disk_image: {
    label: "磁盘镜像/虚拟机",
    icon: <HardDrive size={13} />,
    color: "bg-purple-900/40 text-purple-300 border-purple-700/50",
  },
  model: {
    label: "AI 模型权重",
    icon: <Cpu size={13} />,
    color: "bg-pink-900/40 text-pink-300 border-pink-700/50",
  },
  media: {
    label: "音视频媒体",
    icon: <Film size={13} />,
    color: "bg-sky-900/40 text-sky-300 border-sky-700/50",
  },
  archive: {
    label: "压缩包归档",
    icon: <Archive size={13} />,
    color: "bg-amber-900/40 text-amber-300 border-amber-700/50",
  },
  executable: {
    label: "程序与运行库",
    icon: <Binary size={13} />,
    color: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  },
  database: {
    label: "数据库与备份",
    icon: <Database size={13} />,
    color: "bg-cyan-900/40 text-cyan-300 border-cyan-700/50",
  },
  other: {
    label: "其他格式",
    icon: <FileBox size={13} />,
    color: "bg-slate-800 text-slate-300 border-slate-700",
  },
};

export const BigFilesView: React.FC = () => {
  const [minBytes, setMinBytes] = useState<number>(100 * 1024 * 1024);
  const [scanWindows, setScanWindows] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatus, setScanStatus] = useState<ScanStatusEvent | null>(null);
  const [files, setFiles] = useState<BigFileInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen<ScanStatusEvent>("big-file-scan-progress", (event) => {
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
    setFiles([]);
    setSelectedPaths(new Set());
    setScanStatus({
      taskType: "big_file",
      currentPath: "正在初始化扫描引擎...",
      scannedFiles: 0,
      message: "准备扫描用户及系统驱动器...",
      isDone: false,
    });

    try {
      const results = await invoke<BigFileInfo[]>("get_big_files", {
        minBytes,
        scanWindows,
      });
      setFiles(results);
    } catch (e) {
      console.error(e);
      alert(`扫描失败: ${e}`);
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

  const handleOpenExplorer = async (path: string) => {
    try {
      await invoke("open_in_explorer", { path });
    } catch (e) {
      alert(`无法定位: ${e}`);
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const handleTrashSingle = async (path: string) => {
    if (!confirm(`确定将以下文件移入回收站吗？\n\n${path}`)) return;
    setDeletingPath(path);
    try {
      await invoke("trash_file", { filePath: path });
      setFiles((prev) => prev.filter((f) => f.path !== path));
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } catch (e) {
      alert(`删除失败: ${e}`);
    } finally {
      setDeletingPath(null);
    }
  };

  const handleBatchTrash = async () => {
    if (selectedPaths.size === 0) return;
    if (
      !confirm(
        `确定将选中的 ${selectedPaths.size} 个大文件（共 ${formatBytes(
          totalSelectedBytes
        )}）移入回收站吗？`
      )
    )
      return;

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

    setFiles((prev) => prev.filter((f) => !selectedPaths.has(f.path) || errors.some(err => err.startsWith(f.path))));
    setSelectedPaths(new Set());

    if (errors.length > 0) {
      alert(`部分文件删除失败:\n${errors.join("\n")}`);
    }
  };

  const toggleSelect = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  };

  const toggleSelectAllFiltered = () => {
    if (selectedPaths.size === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredFiles.map((f) => f.path)));
    }
  };

  // 过滤处理
  const filteredFiles = files.filter((f) => {
    const matchCategory =
      selectedCategory === "all" ? true : f.category === selectedCategory;
    const matchQuery =
      searchQuery.trim() === ""
        ? true
        : f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.path.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchQuery;
  });

  const totalFilteredBytes = filteredFiles.reduce((acc, f) => acc + f.size, 0);
  const totalSelectedBytes = files
    .filter((f) => selectedPaths.has(f.path))
    .reduce((acc, f) => acc + f.size, 0);

  // 统计每个分类的数目
  const categoryCounts = files.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-4">
      {/* 头部标题与控制栏 */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Layers className="text-blue-500" size={20} />
            大文件深度扫描与定位
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            快速挖掘占用 GB 级别的虚拟机镜像、AI权重、高清音视频、大型压缩包等，支持直接安全移入回收站。
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Windows 目录开关 */}
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800 hover:border-slate-700 transition">
            <input
              type="checkbox"
              checked={scanWindows}
              onChange={(e) => setScanWindows(e.target.checked)}
              disabled={isScanning}
              className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
            />
            <span>包含 Windows 目录</span>
          </label>

          {/* 阈值选择 */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <SlidersHorizontal size={13} className="text-slate-400" />
            <select
              value={minBytes}
              onChange={(e) => setMinBytes(Number(e.target.value))}
              disabled={isScanning}
              className="bg-transparent text-slate-200 outline-none text-xs cursor-pointer"
            >
              {THRESHOLD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 扫描 / 取消按钮 */}
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
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/30 transition"
            >
              <RotateCw size={15} />
              开始扫描大文件
            </button>
          )}
        </div>
      </div>

      {/* 实时进度提示条 */}
      {isScanning && scanStatus && (
        <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <RotateCw size={16} className="text-blue-400 animate-spin" />
            <div className="text-xs">
              <span className="text-blue-200 font-semibold">{scanStatus.message}</span>
              <p className="text-[11px] text-slate-400 truncate max-w-xl font-mono mt-0.5">
                {scanStatus.currentPath}
              </p>
            </div>
          </div>
          <span className="text-xs text-blue-400 font-mono">
            已检索 {scanStatus.scannedFiles} 项
          </span>
        </div>
      )}

      {/* 筛选分类与搜索栏 */}
      {files.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center gap-4">
            {/* 分类 Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  selectedCategory === "all"
                    ? "bg-blue-600 text-white border-blue-500 shadow"
                    : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                全部 ({files.length})
              </button>

              {Object.entries(CATEGORY_MAP).map(([key, meta]) => {
                const count = categoryCounts[key] || 0;
                if (count === 0) return null;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedCategory(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      selectedCategory === key
                        ? "bg-slate-800 text-white border-slate-600 shadow"
                        : "bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-slate-200"
                    }`}
                  >
                    {meta.icon}
                    <span>{meta.label}</span>
                    <span className="text-[10px] opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* 搜索框 */}
            <div className="relative w-72 shrink-0">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="搜索文件名或路径..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* 汇总统计与批量清理按钮 */}
          <div className="flex justify-between items-center text-xs text-slate-400 px-1">
            <div>
              <span>显示 </span>
              <strong className="text-slate-200">{filteredFiles.length}</strong>
              <span> 个文件，合计占用 </span>
              <strong className="text-blue-400">{formatBytes(totalFilteredBytes)}</strong>
              {selectedPaths.size > 0 && (
                <span className="ml-3 text-amber-400">
                  已勾选 {selectedPaths.size} 项（共 {formatBytes(totalSelectedBytes)}）
                </span>
              )}
            </div>

            {selectedPaths.size > 0 && (
              <button
                onClick={handleBatchTrash}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                <Trash2 size={13} />
                批量移入回收站 ({formatBytes(totalSelectedBytes)})
              </button>
            )}
          </div>
        </div>
      )}

      {/* 大文件列表 */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col min-h-0">
        {files.length === 0 && !isScanning ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <Layers size={44} className="text-slate-700 mb-3" />
            <h3 className="text-sm font-semibold text-slate-400">未扫描或未发现大文件</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              点击右上角「开始扫描大文件」，将自动流式检索系统中的高体量文件。
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredFiles.length > 0 &&
                        selectedPaths.size === filteredFiles.length
                      }
                      onChange={toggleSelectAllFiltered}
                      className="rounded bg-slate-900 border-slate-700 text-blue-600"
                    />
                  </th>
                  <th className="py-2.5 px-3">文件名称 / 类别</th>
                  <th className="py-2.5 px-3">路径</th>
                  <th className="py-2.5 px-3 w-28 text-right">大小</th>
                  <th className="py-2.5 px-3 w-36">修改时间</th>
                  <th className="py-2.5 px-3 w-32 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredFiles.map((file) => {
                  const cat = CATEGORY_MAP[file.category] || CATEGORY_MAP.other;
                  const isSelected = selectedPaths.has(file.path);
                  const isDeleting = deletingPath === file.path;

                  return (
                    <tr
                      key={file.path}
                      className={`hover:bg-slate-800/40 transition ${
                        isSelected ? "bg-blue-950/20" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(file.path)}
                          className="rounded bg-slate-900 border-slate-700 text-blue-600"
                        />
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${cat.color}`}
                          >
                            {cat.icon}
                            {cat.label}
                          </span>
                          <span
                            className="font-medium text-slate-200 truncate max-w-xs"
                            title={file.name}
                          >
                            {file.name}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        <span className="truncate block max-w-md" title={file.path}>
                          {file.path}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-400">
                        {formatBytes(file.size)}
                      </td>

                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {file.modifiedTime}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenExplorer(file.path)}
                            title="在资源管理器中定位"
                            className="p-1 hover:bg-slate-700/80 rounded text-slate-300 transition"
                          >
                            <FolderOpen size={14} />
                          </button>

                          <button
                            onClick={() => handleCopyPath(file.path)}
                            title="复制文件路径"
                            className="p-1 hover:bg-slate-700/80 rounded text-slate-300 transition"
                          >
                            {copiedPath === file.path ? (
                              <Check size={14} className="text-emerald-400" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>

                          <button
                            onClick={() => handleTrashSingle(file.path)}
                            disabled={isDeleting}
                            title="移入回收站"
                            className="p-1 hover:bg-red-500/20 text-red-400 rounded transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
