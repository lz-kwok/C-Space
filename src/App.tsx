import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Sparkles, MessageSquareText, FolderSync, Link as LinkIcon, Sliders, ShieldAlert, Layers, Copy, Disc3 } from "lucide-react";
import { ExplorerView } from "./pages/ExplorerView";
import { TreemapView } from "./pages/TreemapView";
import { CleanerView } from "./pages/CleanerView";
import { MigratorView } from "./pages/MigratorView";
import { LinksView } from "./pages/LinksView";
import { SettingsView } from "./pages/SettingsView";
import { BigFilesView } from "./pages/BigFilesView";
import { DuplicatesView } from "./pages/DuplicatesView";
import { SocialSlimmerView } from "./pages/SocialSlimmerView";
import { DriveInfo } from "./types";
import { formatBytes } from "./utils";

type Tab = "explorer" | "treemap" | "social" | "big_files" | "duplicates" | "cleaner" | "migrator" | "links" | "settings";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("explorer");
  const [isElevated, setIsElevated] = useState<boolean>(true);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [migrateTargetPath, setMigrateTargetPath] = useState<string>("");

  useEffect(() => {
    invoke<boolean>("check_elevation").then(setIsElevated);
    invoke<DriveInfo[]>("get_drives").then(setDrives);
  }, []);

  const handleRelaunchAdmin = async () => {
    try {
      await invoke("trigger_admin_relaunch");
    } catch (e: any) {
      alert(`提升权限失败: ${e}`);
    }
  };

  const handleNavigateToMigrate = (path: string) => {
    setMigrateTargetPath(path);
    setActiveTab("migrator");
  };

  const cDrive = drives.find((d) => d.letter.toLowerCase().startsWith("c"));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* 侧边导航栏 */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-6">
          {/* Logo 区域 */}
          <div className="flex items-center gap-2.5 px-2">
            <img
              src="/app-icon.png"
              alt="C-Space Logo"
              className="w-8 h-8 rounded-lg shadow-lg shadow-blue-500/20 object-cover"
            />
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-wide">C-Space</h1>
              <p className="text-[10px] text-slate-400">C 盘深度透视 · 清理与迁移</p>
            </div>
          </div>

          {/* C 盘容量微看板 */}
          {cDrive && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">系统盘 (C:)</span>
                <span className="font-mono text-slate-200">
                  剩余 {formatBytes(cDrive.free)}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      ((cDrive.total - cDrive.free) / cDrive.total) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>总容量 {formatBytes(cDrive.total)}</span>
                <span>
                  已用 {(((cDrive.total - cDrive.free) / cDrive.total) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {/* 导航菜单 */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("explorer")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "explorer"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <HardDrive size={16} />
              磁盘与目录透视分析
            </button>

            <button
              onClick={() => setActiveTab("treemap")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "treemap"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <Disc3 size={16} />
              磁盘空间星系图 (Galaxy)
            </button>

            <button
              onClick={() => setActiveTab("social")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "social"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <div className="flex items-center gap-3">
                <MessageSquareText size={16} className={activeTab === "social" ? "text-emerald-200" : "text-emerald-400"} />
                <span>国民社交资产专治</span>
              </div>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-normal border border-emerald-500/30">
                微信/QQ
              </span>
            </button>

            <button
              onClick={() => setActiveTab("big_files")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "big_files"
                  ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <Layers size={16} />
              大文件扫描与定位
            </button>

            <button
              onClick={() => setActiveTab("duplicates")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "duplicates"
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <Copy size={16} />
              重复文件两阶段比对
            </button>

            <button
              onClick={() => setActiveTab("cleaner")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "cleaner"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <Sparkles size={16} />
              专项智能清理
            </button>

            <button
              onClick={() => setActiveTab("migrator")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "migrator"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <FolderSync size={16} />
              AppData 无损搬家
            </button>

            <button
              onClick={() => setActiveTab("links")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "links"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <LinkIcon size={16} />
              软链接管理账本
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeTab === "settings"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <Sliders size={16} />
              规则库与设置
            </button>
          </nav>
        </div>

        {/* 权限提示栏 */}
        {!isElevated && (
          <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
              <ShieldAlert size={14} /> 当前为普通权限
            </div>
            <p className="text-[10px] text-slate-400">
              清理部分系统日志或创建特殊符号链接时需要管理员身份。
            </p>
            <button
              onClick={handleRelaunchAdmin}
              className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-semibold transition"
            >
              提权以管理员身份运行
            </button>
          </div>
        )}
      </aside>

      {/* 主工作区 */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-slate-950">
        {activeTab === "explorer" && (
          <ExplorerView onNavigateToMigrate={handleNavigateToMigrate} />
        )}
        {activeTab === "treemap" && (
          <TreemapView onNavigateToMigrate={handleNavigateToMigrate} />
        )}
        {activeTab === "social" && <SocialSlimmerView />}
        {activeTab === "big_files" && <BigFilesView />}
        {activeTab === "duplicates" && <DuplicatesView />}
        {activeTab === "cleaner" && <CleanerView />}
        {activeTab === "migrator" && (
          <MigratorView initialSourcePath={migrateTargetPath} />
        )}
        {activeTab === "links" && <LinksView />}
        {activeTab === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
