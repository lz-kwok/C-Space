import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
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
  Plus,
  X,
  Folder,
} from "lucide-react";
import { BigFileInfo, DriveInfo, ScanStatusEvent } from "../types";
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

type ScopeType = "preset_c" | "drive" | "custom";

export const BigFilesView: React.FC = () => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [scopeType, setScopeType] = useState<ScopeType>("preset_c");
  const [selectedDrive, setSelectedDrive] = useState<string>("C");
  const [customDirs, setCustomDirs] = useState<string[]>([]);
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
    invoke<DriveInfo[]>("get_drives").then((res) => {
      setDrives(res);
      if (res.length > 0) {
        setSelectedDrive(res[0].letter);
      }
    });

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

  const handleAddCustomDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要扫描大文件的目录",
      });
      if (selected && typeof selected === "string") {
        if (!customDirs.includes(selected)) {
          setCustomDirs([...customDirs, selected]);
        }
      }
    } catch (e) {
      console.error("选择目录失败:", e);
    }
  };

  const handleRemoveCustomDir = (pathToRemove: string) => {
    setCustomDirs(customDirs.filter((p) => p !== pathToRemove));
  };

  const handleStartScan = async () => {
    let targetDirs: string[] | null = null;
    if (scopeType === "drive") {
      targetDirs = [`${selectedDrive}:\\`];
    } else if (scopeType === "custom") {
      if (customDirs.length === 0) {
        alert("请先点击「添加目录」选择至少一个待扫描的目录！");
        return;
      }
      targetDirs = customDirs;
    }

    setIsScanning(true);
    setFiles([]);
    setSelectedPaths(new Set());
    setScanStatus({
      taskType: "big_file",
      currentPath: "正在初始化扫描引擎...",
      scannedFiles: 0,
      message: "准备扫描指定目标...",
      isDone: false,
    });

    try {
      const results = await invoke<BigFileInfo[]>("get_big_files", {
        minBytes,
        scanWindows,
        targetDirs,
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

    setFiles((prev) =>
      prev.filter(
        (f) => !selectedPaths.has(f.path) || errors.some((err) => err.startsWith(f.path))
      )
    );
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Layers className="text-amber-500" size={20} />
              大文件深度扫描与定位
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              支持按磁盘或自定义目录精确挖掘 GB 级大文件，直观归类虚拟机、AI权重、高清影音与压缩包。
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* 阈值选择 */}
            <div className="flex items-center gap-1.5 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <SlidersHorizontal size={13} className="text-slate-400" />
              <span className="text-slate-400">大小过滤:</span>
              <select
                value={minBytes}
                onChange={(e) => setMinBytes(Number(e.target.value))}
                disabled={isScanning}
                className="bg-transparent text-slate-200 outline-none text-xs cursor-pointer font-medium"
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
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-amber-600/30 transition"
              >
                <RotateCw size={15} />
                开始扫描大文件
              </button>
            )}
          </div>
        </div>

        {/* 扫描范围模式选择区 */}
        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">扫描范围:</span>
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setScopeType("preset_c")}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  scopeType === "preset_c"
                    ? "bg-amber-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                C 盘核心常用目录
              </button>
              <button
                onClick={() => setScopeType("drive")}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  scopeType === "drive"
                    ? "bg-amber-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                选定指定磁盘
              </button>
              <button
                onClick={() => setScopeType("custom")}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  scopeType === "custom"
                    ? "bg-amber-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                自定义目录 ({customDirs.length})
              </button>
            </div>
          </div>

          {/* 模式对应的附加控制 */}
          {scopeType === "preset_c" && (
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={scanWindows}
                onChange={(e) => setScanWindows(e.target.checked)}
                disabled={isScanning}
                className="rounded bg-slate-900 border-slate-700 text-amber-600 focus:ring-0"
              />
              <span>包含 C:\Windows 系统目录</span>
            </label>
          )}

          {scopeType === "drive" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">选择盘符:</span>
              {drives.map((d) => (
                <button
                  key={d.letter}
                  onClick={() => setSelectedDrive(d.letter)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition ${
                    selectedDrive.toUpperCase() === d.letter.toUpperCase()
                      ? "bg-amber-600 text-white border-amber-500 shadow"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {d.letter}: ({formatBytes(d.free)} 可用)
                </button>
              ))}
            </div>
          )}

          {scopeType === "custom" && (
            <button
              onClick={handleAddCustomDir}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-medium transition"
            >
              <Plus size={13} />
              浏览添加目录...
            </button>
          )}
        </div>

        {/* 自定义目录标签列表 */}
        {scopeType === "custom" && customDirs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[11px] text-slate-400">已选目录:</span>
            {customDirs.map((dir) => (
              <span
                key={dir}
                className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-300"
              >
                <Folder size={12} className="text-amber-400" />
                <span className="truncate max-w-xs">{dir}</span>
                <button
                  onClick={() => handleRemoveCustomDir(dir)}
                  className="hover:text-red-400 ml-1 text-slate-500"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 实时进度提示条 */}
      {isScanning && scanStatus && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <RotateCw size={16} className="text-amber-400 animate-spin" />
            <div className="text-xs">
              <span className="text-amber-200 font-semibold">{scanStatus.message}</span>
              <p className="text-[11px] text-slate-400 truncate max-w-xl font-mono mt-0.5">
                {scanStatus.currentPath}
              </p>
            </div>
          </div>
          <span className="text-xs text-amber-400 font-mono">
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
                    ? "bg-amber-600 text-white border-amber-500 shadow"
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
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>
          </div>

          {/* 汇总统计与批量清理按钮 */}
          <div className="flex justify-between items-center text-xs text-slate-400 px-1">
            <div>
              <span>显示 </span>
              <strong className="text-slate-200">{filteredFiles.length}</strong>
              <span> 个文件，合计占用 </span>
              <strong className="text-amber-400">{formatBytes(totalFilteredBytes)}</strong>
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
              可选择 C 盘常用目录、特定磁盘（如 D: 或 E:）或添加自定义目录，点击「开始扫描大文件」进行检索。
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
                      className="rounded bg-slate-900 border-slate-700 text-amber-600"
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
                        isSelected ? "bg-amber-950/20" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(file.path)}
                          className="rounded bg-slate-900 border-slate-700 text-amber-600"
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

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">
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
