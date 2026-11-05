import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ShieldCheck,
  HardDrive,
  FolderOpen,
  RefreshCw,
  Sparkles,
  Film,
  FileText,
  Image as ImageIcon,
  Database,
  Calendar,
  Layers,
  ArrowRight,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Building2,
  UserCheck,
  Send,
  FolderSearch,
  Search,
} from "lucide-react";
import {
  SocialAppInfo,
  SocialAppType,
  SocialAccountInfo,
  SocialAssetSummary,
  MediaArchiveItem,
  ArchiveResult,
  SocialDuplicateGroup,
  DriveInfo,
  SocialFolderDetail,
  DiscoveredSocialCache,
} from "../types";
import { formatBytes } from "../utils";

export const SocialSlimmerView: React.FC = () => {
  const [apps, setApps] = useState<SocialAppInfo[]>([]);
  const [selectedAppType, setSelectedAppType] = useState<SocialAppType>("weChat");
  const [selectedAccount, setSelectedAccount] = useState<SocialAccountInfo | null>(null);
  // 磁盘选择与主动扫描状态
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string>("C");
  const [isScanningDisk, setIsScanningDisk] = useState<boolean>(false);
  const [discoveredCaches, setDiscoveredCaches] = useState<DiscoveredSocialCache[]>([]);
  const [activeDiscovered, setActiveDiscovered] = useState<DiscoveredSocialCache | null>(null);

  // 资产解构数据
  const [loading, setLoading] = useState<boolean>(false);
  const [summary, setSummary] = useState<SocialAssetSummary | null>(null);

  // 音视频归档配置
  const [archiveMonths, setArchiveMonths] = useState<number>(3);
  const [archiveItems, setArchiveItems] = useState<MediaArchiveItem[]>([]);
  const [targetArchiveRoot, setTargetArchiveRoot] = useState<string>("D:\\C-Space_SocialArchive");
  const [isArchiving, setIsArchiving] = useState<boolean>(false);
  const [archiveResult, setArchiveResult] = useState<ArchiveResult | null>(null);

  // 多群重复文件去重
  const [duplicates, setDuplicates] = useState<SocialDuplicateGroup[]>([]);
  const [isScanningDups, setIsScanningDups] = useState<boolean>(false);
  const [isHardlinking, setIsHardlinking] = useState<boolean>(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [hardlinkSuccessMsg, setHardlinkSuccessMsg] = useState<string | null>(null);

  // 缓存清理状态
  const [isCleaningCache, setIsCleaningCache] = useState<boolean>(false);
  const [cacheCleanMsg, setCacheCleanMsg] = useState<string | null>(null);
  // 文件夹作用深度语义分析
  const [folderDetails, setFolderDetails] = useState<SocialFolderDetail[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState<boolean>(false);

  // 初始化加载应用与磁盘
  useEffect(() => {
    loadAppsAndDrives();
  }, []);

  const loadAppsAndDrives = async () => {
    try {
      const [appData, driveData] = await Promise.all([
        invoke<SocialAppInfo[]>("get_social_apps"),
        invoke<DriveInfo[]>("get_drives"),
      ]);
      setApps(appData);
      setDrives(driveData);
      if (driveData.length > 0) setSelectedDrive(driveData[0].letter);

      // 默认推荐非 C 盘中剩余空间最大的盘作为归档盘
      const nonCDrives = driveData.filter((d) => !d.letter.toUpperCase().startsWith("C"));
      if (nonCDrives.length > 0) {
        nonCDrives.sort((a, b) => b.free - a.free);
        setTargetArchiveRoot(`${nonCDrives[0].letter}:\\C-Space_SocialArchive`);
      }

      // 默认选择第一个安装的应用及其账号
      const currentApp = appData.find((a) => a.appType === selectedAppType) || appData[0];
      if (currentApp) {
        setSelectedAppType(currentApp.appType);
        if (currentApp.accounts.length > 0) {
          selectAccountAndScan(currentApp.accounts[0]);
        }
        // 如果当前应用的数据目录在特定驱动器（例如 D:\Cache\WeChat Files），优先将 selectedDrive 设为对应驱动器
        if (currentApp.dataRoot && currentApp.dataRoot.length >= 2 && currentApp.dataRoot[1] === ":") {
          setSelectedDrive(currentApp.dataRoot[0].toUpperCase());
        }
      }
    } catch (e) {
      console.error("加载社交应用信息失败:", e);
    }
  };

  const currentApp = apps.find((a) => a.appType === selectedAppType);

  const handleSelectApp = (type: SocialAppType) => {
    setSelectedAppType(type);
    const target = apps.find((a) => a.appType === type);
    if (target && target.accounts.length > 0) {
      selectAccountAndScan(target.accounts[0]);
      if (target.dataRoot && target.dataRoot.length >= 2 && target.dataRoot[1] === ":") {
        setSelectedDrive(target.dataRoot[0].toUpperCase());
      }
    } else {
      setSelectedAccount(null);
      setSummary(null);
      setArchiveItems([]);
      setDuplicates([]);
      if (target && target.dataRoot && target.dataRoot.length >= 2 && target.dataRoot[1] === ":") {
        setSelectedDrive(target.dataRoot[0].toUpperCase());
      }
    }
  };

  const selectAccountAndScan = async (account: SocialAccountInfo) => {
    setSelectedAccount(account);
    setLoading(true);
    setArchiveResult(null);
    setHardlinkSuccessMsg(null);
    setCacheCleanMsg(null);

    try {
      // 1. 扫描 5 维资产概况
      const res = await invoke<SocialAssetSummary>("scan_social_assets", {
        accountPath: account.path,
      });
      setSummary(res);

      // 2. 预载 3 个月历史音视频候选项
      loadArchiveCandidates(account.path, archiveMonths);

      // 3. 扫描多群重复文件
      loadDuplicates(account.path);
      loadFolderDetails(account.path);
    } catch (e) {
      console.error("扫描社交资产失败:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadArchiveCandidates = async (path: string, months: number) => {
    try {
      const items = await invoke<MediaArchiveItem[]>("filter_social_media", {
        accountPath: path,
        months,
      });
      setArchiveItems(items);
    } catch (e) {
      console.error("筛选归档音视频失败:", e);
    }
  };

  const loadDuplicates = async (path: string) => {
    setIsScanningDups(true);
    try {
      const groups = await invoke<SocialDuplicateGroup[]>("scan_social_duplicates", {
        accountPath: path,
      });
      setDuplicates(groups);
    } catch (e) {
      console.error("扫描多群重复文件失败:", e);
    } finally {
      setIsScanningDups(false);
    }
  };

  const loadFolderDetails = async (path: string) => {
    setIsLoadingFolders(true);
    try {
      const details = await invoke<SocialFolderDetail[]>("analyze_social_folders", {
        accountPath: path,
      });
      setFolderDetails(details);
    } catch (e) {
      console.error("深度解析文件夹作用失败:", e);
    } finally {
      setIsLoadingFolders(false);
    }
  };

  // 扫描指定磁盘上的社交缓存
  const handleScanSelectedDisk = async () => {
    setIsScanningDisk(true);
    try {
      const res = await invoke<DiscoveredSocialCache[]>("scan_disk_for_social_caches", {
        drive: selectedDrive,
      });
      setDiscoveredCaches(res);
      if (res.length > 0) {
        // 关键逻辑：优先查找并激活与当前选中软件类型匹配的缓存！
        const matchCurrent = res.find((r) => r.appType === selectedAppType);
        if (matchCurrent) {
          handleSelectDiscoveredCache(matchCurrent);
        } else {
          // 当前磁盘未发现当前软件（例如 C 盘只有钉钉，而微信在 D 盘）
          const currentAppName =
            selectedAppType === "weChat"
              ? "微信 (WeChat)"
              : selectedAppType === "dingTalk"
              ? "钉钉 (DingTalk)"
              : selectedAppType === "wXWork"
              ? "企业微信 (WXWork)"
              : "腾讯 QQ";
          alert(
            `在 ${selectedDrive} 盘未扫描到【${currentAppName}】的数据目录。\n\n扫描到了其它软件缓存（例如 ${res[0].appName}，可在下方「发现缓存路径」中点击切换）。如果您的${currentAppName}数据存储在其他磁盘（如 D 盘），建议切换顶部磁盘后重新扫描。`
          );
        }
      } else {
        alert(`在 ${selectedDrive} 盘未扫描到明显的社交软件特征目录。建议尝试切换其他磁盘，或点击右侧「手动指定缓存目录」直接定位。`);
      }
    } catch (e) {
      console.error("全盘扫描社交缓存失败:", e);
      alert(`扫描失败: ${e}`);
    } finally {
      setIsScanningDisk(false);
    }
  };

  // 手动浏览选择任意社交缓存目录
  const handleBrowseCustomPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择微信、钉钉、企微或 QQ 的数据存储文件夹",
      });
      if (selected && typeof selected === "string") {
        const res = await invoke<DiscoveredSocialCache>("analyze_custom_social_path_cmd", {
          path: selected,
        });
        setDiscoveredCaches((prev) => [res, ...prev.filter((c) => c.dataRoot !== res.dataRoot)]);
        handleSelectDiscoveredCache(res);
      }
    } catch (e) {
      console.error("手动指定目录解析失败:", e);
      alert(`解析自定义路径失败: ${e}`);
    }
  };

  // 选中某条已发现或指定的缓存目录
  const handleSelectDiscoveredCache = (item: DiscoveredSocialCache) => {
    setActiveDiscovered(item);
    setSelectedAppType(item.appType);
    if (item.accounts.length > 0) {
      selectAccountAndScan(item.accounts[0]);
    } else {
      const fallbackAccount: SocialAccountInfo = {
        accountId: item.dataRoot.split("\\").pop() || "Root",
        displayName: item.appName,
        path: item.dataRoot,
        totalBytes: item.totalBytes,
      };
      setSelectedAccount(fallbackAccount);
      loadFolderDetails(item.dataRoot);
    }
  };

  // 切换归档时间分水岭
  const handleMonthsChange = (months: number) => {
    setArchiveMonths(months);
    if (selectedAccount) {
      loadArchiveCandidates(selectedAccount.path, months);
    }
  };

  // 执行音视频归档
  const handleRunArchive = async () => {
    if (!selectedAccount || archiveItems.length === 0) return;
    setIsArchiving(true);
    setArchiveResult(null);

    try {
      const filePaths = archiveItems.map((i) => i.path);
      const res = await invoke<ArchiveResult>("archive_social_media", {
        files: filePaths,
        targetRoot: targetArchiveRoot,
      });
      setArchiveResult(res);

      // 刷新数据
      if (res.movedCount > 0) {
        selectAccountAndScan(selectedAccount);
      }
    } catch (e: any) {
      alert(`归档失败: ${e}`);
    } finally {
      setIsArchiving(false);
    }
  };

  // 执行多群重复文件一键硬链接化去重
  const handleDeduplicateAll = async () => {
    if (duplicates.length === 0 || !selectedAccount) return;
    setIsHardlinking(true);
    setHardlinkSuccessMsg(null);

    let totalFreed = 0;
    let groupSuccessCount = 0;

    try {
      for (const group of duplicates) {
        if (group.files.length < 2) continue;
        const primary = group.files[0];
        const duplicatesToLink = group.files.slice(1);
        try {
          const freed = await invoke<number>("hardlink_social_duplicate", {
            primaryFile: primary,
            duplicateFiles: duplicatesToLink,
          });
          totalFreed += freed;
          groupSuccessCount++;
        } catch (err) {
          console.error(`去重组 ${group.name} 失败:`, err);
        }
      }

      setHardlinkSuccessMsg(
        `一键硬链接去重完成！成功优化 ${groupSuccessCount} 组群文件，保留各群访问入口的同时，净释放 ${formatBytes(totalFreed)} 物理磁盘空间。`
      );

      // 重新载入数据
      selectAccountAndScan(selectedAccount);
    } catch (e: any) {
      alert(`去重处理中断: ${e}`);
    } finally {
      setIsHardlinking(false);
    }
  };

  // 执行清空安全缓存
  const handleCleanCache = async () => {
    if (!summary || summary.cachePaths.length === 0 || !selectedAccount) return;
    setIsCleaningCache(true);
    setCacheCleanMsg(null);

    try {
      const [freed, count] = await invoke<[number, number]>("clean_social_caches", {
        cachePaths: summary.cachePaths,
      });
      setCacheCleanMsg(`成功清空朋友圈/小程序与临时缓存！清理文件 ${count} 项，释放 ${formatBytes(freed)}。`);
      selectAccountAndScan(selectedAccount);
    } catch (e: any) {
      alert(`清空缓存失败: ${e}`);
    } finally {
      setIsCleaningCache(false);
    }
  };

  const handleOpenFolder = (path: string) => {
    invoke("open_in_explorer", { path }).catch((e) => alert(e));
  };

  // 计算总浪费空间
  const totalWastedDuplicateBytes = duplicates.reduce((acc, curr) => acc + curr.wastedBytes, 0);
  const totalArchiveBytes = archiveItems.reduce((acc, curr) => acc + curr.size, 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-4 select-none min-h-0">
      {/* 顶部标题与多应用切换 */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 space-y-3 backdrop-blur-xl shadow-xl shrink-0">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="text-emerald-400" size={20} />
              国民社交资产专治 · 微信 / 企微 / 钉钉 / QQ 多维透视与无损瘦身
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              深度解构社交资产架构，保留聊天记录绝对安全前提下，历史音视频沉淀归档至 D 盘，多群重复文件硬链接去重。
            </p>
          </div>

          {/* 社交应用切换器 */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => handleSelectApp("weChat")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
                selectedAppType === "weChat"
                  ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md shadow-emerald-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageSquare size={14} className={selectedAppType === "weChat" ? "text-emerald-200" : ""} />
              微信 (WeChat)
            </button>
            <button
              onClick={() => handleSelectApp("wXWork")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
                selectedAppType === "wXWork"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Building2 size={14} className={selectedAppType === "wXWork" ? "text-cyan-200" : ""} />
              企业微信 (WXWork)
            </button>
            <button
              onClick={() => handleSelectApp("dingTalk")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
                selectedAppType === "dingTalk"
                  ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-orange-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Send size={14} className={selectedAppType === "dingTalk" ? "text-orange-200" : ""} />
              钉钉 (DingTalk)
            </button>
            <button
              onClick={() => handleSelectApp("qQ")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
                selectedAppType === "qQ"
                  ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-600/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <UserCheck size={14} className={selectedAppType === "qQ" ? "text-sky-200" : ""} />
              腾讯 QQ (QQ NT)
            </button>
          </div>
        </div>

        {/* 磁盘选择与主动扫描控制带 */}
        <div className="pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <HardDrive size={13} />
              选择目标磁盘:
            </span>
            <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
              {drives.map((d) => (
                <button
                  key={d.letter}
                  onClick={() => setSelectedDrive(d.letter)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition ${
                    selectedDrive.toUpperCase() === d.letter.toUpperCase()
                      ? "bg-cyan-600 text-white shadow-sm font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {d.letter}: ({formatBytes(d.free)} 剩余)
                </button>
              ))}
            </div>

            <button
              onClick={handleScanSelectedDisk}
              disabled={isScanningDisk}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                !isScanningDisk
                  ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md shadow-cyan-600/25"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              {isScanningDisk ? (
                <>
                  <RefreshCw className="animate-spin" size={13} />
                  正在深度检索 {selectedDrive} 盘社交特征...
                </>
              ) : (
                <>
                  <Search size={13} />
                  扫描 {selectedDrive} 盘社交缓存
                </>
              )}
            </button>
          </div>

          <button
            onClick={handleBrowseCustomPath}
            className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700/60 transition"
            title="选择您自行安装或移动过的微信/钉钉/企微/QQ数据目录"
          >
            <FolderOpen size={13} className="text-cyan-400" />
            手动指定缓存目录...
          </button>
        </div>

        {/* 扫描命中或手动指定的路径候选标签条 */}
        {discoveredCaches.length > 0 && (
          <div className="pt-2 border-t border-slate-800/40 flex items-center gap-2 flex-wrap text-xs max-h-24 overflow-y-auto pr-1">
            <span className="text-slate-400 font-medium shrink-0">发现缓存路径 ({discoveredCaches.length}):</span>
            {discoveredCaches.map((item, idx) => {
              const isSelected = selectedAccount?.path.startsWith(item.dataRoot) || activeDiscovered?.dataRoot === item.dataRoot;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectDiscoveredCache(item)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                    isSelected
                      ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 shadow-sm"
                      : "bg-slate-950/70 text-slate-300 hover:text-white border border-slate-800"
                  }`}
                >
                  <span className="font-semibold">{item.appName}:</span>
                  <span className="font-mono text-[11px] truncate max-w-[200px]">{item.dataRoot}</span>
                  <span className="text-[10px] text-cyan-400 font-mono">({formatBytes(item.totalBytes)})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 账号选择与数据路径提示 */}
        <div className="pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-4 flex-wrap text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 flex items-center gap-1.5">
              <HardDrive size={13} />
              存储根路径:
            </span>
            <span className="font-mono text-slate-200 bg-slate-950/70 px-2 py-0.5 rounded border border-slate-800 max-w-md truncate">
              {currentApp?.dataRoot || "未检测到数据目录"}
            </span>
            {currentApp?.dataRoot && (
              <button
                onClick={() => handleOpenFolder(currentApp.dataRoot)}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                title="打开数据存储文件夹"
              >
                <FolderOpen size={13} />
                浏览
              </button>
            )}
          </div>

          {/* 账号切换 */}
          {currentApp && currentApp.accounts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400">选择账号:</span>
              <div className="flex items-center gap-1.5">
                {currentApp.accounts.map((acc) => (
                  <button
                    key={acc.accountId}
                    onClick={() => selectAccountAndScan(acc)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      selectedAccount?.accountId === acc.accountId
                        ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 shadow-sm"
                        : "bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/40"
                    }`}
                  >
                    {acc.accountId} ({formatBytes(acc.totalBytes)})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 核心聊天记录绝对安全物理隔离保护横幅 */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-cyan-950/40 border border-emerald-500/40 rounded-2xl p-3 px-4 flex items-center justify-between gap-4 shadow-lg shadow-emerald-950/20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-2">
              核心文字聊天记录物理隔离防护机制已生效
            </h4>
            <p className="text-[11px] text-slate-300 mt-0.5">
              底层 <code className="text-emerald-400 font-mono">Msg/*.db</code> 数据库文件强制设为只读保护区，后端无任何删除或修改接口。所有瘦身与去重操作严格限制在缓存与音视频，绝对不会遗失任何一条聊天记录。
            </p>
          </div>
        </div>

        {summary && (
          <div className="text-right shrink-0">
            <span className="text-[10px] text-slate-400 block">保护数据库大小</span>
            <span className="text-xs font-mono font-semibold text-emerald-400">
              {formatBytes(summary.protectedDbBytes)} ({summary.protectedDbFiles} 项文件)
            </span>
          </div>
        )}
      </div>

      {/* 主体滚动区 */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
        {/* 全景 5 维资产概况卡片 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4.5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Layers size={16} className="text-cyan-400" />
              社交资产全景解构 ({selectedAccount?.accountId || "未选择"})
            </h3>
            {summary && (
              <span className="text-xs font-mono text-slate-300">
                总占用空间: <strong className="text-cyan-300 font-bold">{formatBytes(summary.totalBytes)}</strong>
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="animate-spin text-cyan-400" size={24} />
              <span className="text-xs">正在深入解构百万级社交存储架构...</span>
            </div>
          ) : summary ? (
            <>
              {/* 多色条形分布图 */}
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex shadow-inner">
                {summary.totalBytes > 0 && (
                  <>
                    <div
                      title={`朋友圈/临时缓存: ${formatBytes(summary.cacheBytes)}`}
                      className="bg-amber-500 h-full transition-all"
                      style={{ width: `${(summary.cacheBytes / summary.totalBytes) * 100}%` }}
                    />
                    <div
                      title={`聊天音视频: ${formatBytes(summary.videoBytes)}`}
                      className="bg-purple-500 h-full transition-all"
                      style={{ width: `${(summary.videoBytes / summary.totalBytes) * 100}%` }}
                    />
                    <div
                      title={`聊天图片: ${formatBytes(summary.imageBytes)}`}
                      className="bg-cyan-500 h-full transition-all"
                      style={{ width: `${(summary.imageBytes / summary.totalBytes) * 100}%` }}
                    />
                    <div
                      title={`接收群文件: ${formatBytes(summary.fileBytes)}`}
                      className="bg-emerald-500 h-full transition-all"
                      style={{ width: `${(summary.fileBytes / summary.totalBytes) * 100}%` }}
                    />
                    <div
                      title={`核心数据库: ${formatBytes(summary.protectedDbBytes)}`}
                      className="bg-blue-600 h-full transition-all"
                      style={{ width: `${(summary.protectedDbBytes / summary.totalBytes) * 100}%` }}
                    />
                  </>
                )}
              </div>

              {/* 5 维数据小卡片 */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-1">
                {/* 1. 朋友圈/临时缓存 */}
                <div className="bg-slate-950/60 border border-amber-500/20 rounded-xl p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs text-amber-400">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Sparkles size={13} />
                        安全临时缓存
                      </span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded">
                        0风险
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-2">
                      {formatBytes(summary.cacheBytes)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {summary.cacheFiles} 项 (Sns/小程序/预览)
                    </div>
                  </div>
                  {summary.cacheBytes > 0 && (
                    <button
                      onClick={handleCleanCache}
                      disabled={isCleaningCache}
                      className="mt-3 w-full py-1 bg-amber-600/30 hover:bg-amber-600 text-amber-300 hover:text-white rounded-lg text-xs font-semibold transition"
                    >
                      {isCleaningCache ? "清理中..." : "一键清空"}
                    </button>
                  )}
                </div>

                {/* 2. 聊天音视频 */}
                <div className="bg-slate-950/60 border border-purple-500/20 rounded-xl p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs text-purple-400 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Film size={13} />
                        群聊与个人音视频
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-2">
                      {formatBytes(summary.videoBytes)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {summary.videoFiles} 项视频文件
                    </div>
                  </div>
                  <span className="text-[10px] text-purple-300/80 bg-purple-500/10 p-1.5 rounded mt-3 text-center">
                    支持下方分期归档
                  </span>
                </div>

                {/* 3. 聊天图片 */}
                <div className="bg-slate-950/60 border border-cyan-500/20 rounded-xl p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs text-cyan-400 font-medium">
                      <span className="flex items-center gap-1.5">
                        <ImageIcon size={13} />
                        聊天图片与缩略图
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-2">
                      {formatBytes(summary.imageBytes)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {summary.imageFiles} 项图片资产
                    </div>
                  </div>
                  <span className="text-[10px] text-cyan-300/80 bg-cyan-500/10 p-1.5 rounded mt-3 text-center">
                    历史图片完整保留
                  </span>
                </div>

                {/* 4. 接收群文件 */}
                <div className="bg-slate-950/60 border border-emerald-500/20 rounded-xl p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
                      <span className="flex items-center gap-1.5">
                        <FileText size={13} />
                        接收文档与群文件
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-2">
                      {formatBytes(summary.fileBytes)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {summary.fileFiles} 项文档/压缩包
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-300/80 bg-emerald-500/10 p-1.5 rounded mt-3 text-center">
                    支持多群硬链接去重
                  </span>
                </div>

                {/* 5. 核心数据库 (保护区) */}
                <div className="bg-slate-950/60 border border-blue-500/30 rounded-xl p-3 flex flex-col justify-between shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                  <div>
                    <div className="flex items-center justify-between text-xs text-blue-400 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Database size={13} />
                        核心聊天记录库
                      </span>
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1 py-0.2 rounded font-semibold">
                        已防护
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-2">
                      {formatBytes(summary.protectedDbBytes)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {summary.protectedDbFiles} 个数据库只读锁定
                    </div>
                  </div>
                  <span className="text-[10px] text-blue-300/90 bg-blue-500/15 p-1.5 rounded mt-3 text-center font-medium">
                    🛡️ 绝对安全禁止删除
                  </span>
                </div>
              </div>

              {cacheCleanMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  {cacheCleanMsg}
                </div>
              )}
            </>
          ) : (
            <div className="py-6 text-center text-xs text-slate-500">
              请选择上方账号开启深度解构透视
            </div>
          )}
        </div>

        {/* 核心功能区 A：历史音视频时间分期归档 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Film size={16} className="text-purple-400" />
                历史音视频无损沉淀归档（大幅释放 C 盘）
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                支持仅在 C 盘保留最近活跃音视频，更早的历史音视频原子迁移归档到大容量 D 盘，保留完整月份目录结构。
              </p>
            </div>

            {/* 期限选择按钮 */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400 px-2 flex items-center gap-1">
                <Calendar size={13} />
                仅保留:
              </span>
              {[
                { months: 1, label: "最近 1 个月" },
                { months: 3, label: "最近 3 个月 (推荐)" },
                { months: 6, label: "最近 6 个月" },
                { months: 12, label: "最近 1 年" },
              ].map((item) => (
                <button
                  key={item.months}
                  onClick={() => handleMonthsChange(item.months)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    archiveMonths === item.months
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 归档配置与操作卡片 */}
          <div className="bg-slate-950/60 border border-purple-500/20 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-xs text-slate-300">
                筛选出超过 <span className="text-purple-400 font-bold">{archiveMonths} 个月</span> 的超期音视频共{" "}
                <strong className="text-purple-300 font-mono text-sm">{archiveItems.length}</strong> 项，可释放 C 盘空间{" "}
                <strong className="text-purple-300 font-mono text-sm">{formatBytes(totalArchiveBytes)}</strong>。
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>目标归档目录:</span>
                <input
                  type="text"
                  value={targetArchiveRoot}
                  onChange={(e) => setTargetArchiveRoot(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 font-mono text-xs w-72 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={() => handleOpenFolder(targetArchiveRoot)}
                  className="text-purple-400 hover:text-purple-300 transition"
                  title="打开归档目录"
                >
                  <ExternalLink size={13} />
                </button>
              </div>
            </div>

            <button
              onClick={handleRunArchive}
              disabled={isArchiving || archiveItems.length === 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition shrink-0 ${
                archiveItems.length > 0 && !isArchiving
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/30"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              {isArchiving ? (
                <>
                  <RefreshCw className="animate-spin" size={14} />
                  正在原子迁移与校验中...
                </>
              ) : (
                <>
                  <ArrowRight size={14} />
                  一键沉淀归档至目标盘 ({formatBytes(totalArchiveBytes)})
                </>
              )}
            </button>
          </div>

          {archiveResult && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={16} />
              成功归档迁移 {archiveResult.movedCount} 项音视频，已为 C 盘腾出 {formatBytes(archiveResult.freedBytes)} 空间！
            </div>
          )}
        </div>

        {/* 核心功能区 B：多群重复下载文件一键 NTFS 硬链接去重 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Copy size={16} className="text-emerald-400" />
                同一文件多群重复下载 · 一键 NTFS 硬链接去重
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                解决相同文档被转发到多个群、反复下载占用多份空间的痛点。硬链接去重后，所有群原有文件名与路径 100% 保持，微信中点击任意群均可正常打开，但物理磁盘仅存 1 份！
              </p>
            </div>

            {duplicates.length > 0 && (
              <button
                onClick={handleDeduplicateAll}
                disabled={isHardlinking}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  !isHardlinking
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                {isHardlinking ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    正在硬链接去重...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    一键无损硬链接去重 (净释放 {formatBytes(totalWastedDuplicateBytes)})
                  </>
                )}
              </button>
            )}
          </div>

          {hardlinkSuccessMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={16} />
              {hardlinkSuccessMsg}
            </div>
          )}

          {/* 重复文件列表 */}
          {isScanningDups ? (
            <div className="py-6 flex items-center justify-center gap-2 text-slate-400 text-xs">
              <RefreshCw className="animate-spin text-emerald-400" size={16} />
              正在精准比对群文件哈希指纹...
            </div>
          ) : duplicates.length > 0 ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-400 px-1">
                <span>发现 {duplicates.length} 组在多个群重复下载的文件:</span>
                <span>
                  冗余浪费总空间: <strong className="text-emerald-300 font-mono">{formatBytes(totalWastedDuplicateBytes)}</strong>
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {duplicates.map((group) => {
                  const isExpanded = expandedGroup === group.groupId;
                  return (
                    <div
                      key={group.groupId}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs space-y-2 transition hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-2 cursor-pointer text-slate-200 font-medium hover:text-emerald-300 transition"
                          onClick={() => setExpandedGroup(isExpanded ? null : group.groupId)}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span className="truncate max-w-md">{group.name}</span>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono">
                            跨 {group.files.length} 个群副本
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-slate-400">
                          <span>单份: {formatBytes(group.sizeEach)}</span>
                          <span className="text-emerald-400 font-semibold">
                            浪费: {formatBytes(group.wastedBytes)}
                          </span>
                        </div>
                      </div>

                      {/* 展开查看所有群路径 */}
                      {isExpanded && (
                        <div className="pl-5 pt-1 space-y-1 border-t border-slate-800/80 mt-2 text-[11px] text-slate-400 font-mono">
                          {group.files.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 py-0.5">
                              <span className="truncate">{file}</span>
                              <span className="text-slate-500 shrink-0">
                                {idx === 0 ? "保留主副本" : "待硬链接化"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-500">
              未检测到多群重复下载的冗余文件，或接收文件已全部保持单份状态。
            </div>
          )}
        </div>
        {/* 基础扫描：缓存文件夹作用深度语义分析表 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <FolderSearch size={16} className="text-cyan-400" />
                系统盘缓存深度扫描 · 文件夹真实作用与风险解析
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                基于系统盘对当前社交软件的底层目录树进行深度语义分析，解读每个子文件夹的业务作用与安全风险，杜绝盲目清理。
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-mono">共解析出 {folderDetails.length} 个业务子目录</span>
            </div>
          </div>

          {isLoadingFolders ? (
            <div className="py-6 flex items-center justify-center gap-2 text-slate-400 text-xs">
              <RefreshCw className="animate-spin text-cyan-400" size={16} />
              正在逐级分析缓存目录业务语义与风险模型...
            </div>
          ) : folderDetails.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {folderDetails.map((f, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/70 border border-slate-800/90 hover:border-slate-700/90 rounded-xl p-3.5 space-y-2.5 transition flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-100 flex items-center gap-1.5 truncate max-w-[260px]">
                        <FolderOpen size={13} className="text-cyan-400 shrink-0" />
                        {f.folderName}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 ${
                          f.riskLevel === "protected"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                            : f.riskLevel === "safe"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        }`}
                      >
                        {f.riskLevel === "protected" ? "🛡️ 核心受保护" : f.riskLevel === "safe" ? "0 风险可清" : "媒体/文档资产"}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-cyan-300 flex items-center gap-1">
                      {f.purposeTitle}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                      {f.purposeDesc}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                    <div className="font-mono text-slate-300">
                      占用: <strong className="text-cyan-300">{formatBytes(f.size)}</strong> ({f.fileCount} 项)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 italic">
                        {f.actionRecommendation}
                      </span>
                      <button
                        onClick={() => handleOpenFolder(f.path)}
                        className="p-1 text-slate-400 hover:text-cyan-300 transition"
                        title="在资源管理器中打开"
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-500">
              请选择上方账号查看缓存目录深度解析
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
