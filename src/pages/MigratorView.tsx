import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { CheckCircle2, AlertOctagon, RefreshCw, FolderOutput, ShieldAlert, Cpu, Sparkles, Check, FolderOpen } from "lucide-react";
import { DriveInfo, MigrateCandidate, MigratePrecheck, MigrateProgress, ProcInfo } from "../types";
import { formatBytes } from "../utils";

interface Props {
  initialSourcePath?: string;
}

export const MigratorView: React.FC<Props> = ({ initialSourcePath }) => {
  const [sourcePath, setSourcePath] = useState<string>(initialSourcePath || "");
  const [targetPath, setTargetPath] = useState<string>("");
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [candidates, setCandidates] = useState<MigrateCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(false);
  const [precheck, setPrecheck] = useState<MigratePrecheck | null>(null);
  const [checking, setChecking] = useState<boolean>(false);
  const [migrating, setMigrating] = useState<boolean>(false);
  const [progress, setProgress] = useState<MigrateProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const res = await invoke<MigrateCandidate[]>("get_migrate_candidates");
      setCandidates(res);
    } catch (e) {
      console.error("获取搬家候选项失败:", e);
    } finally {
      setLoadingCandidates(false);
    }
  };

  useEffect(() => {
    fetchCandidates();

    invoke<DriveInfo[]>("get_drives").then((res) => {
      setDrives(res);
      // 默认选择非 C 盘且空间最大的磁盘作为默认目标
      const nonCDrives = res.filter((d) => !d.letter.toLowerCase().startsWith("c"));
      if (nonCDrives.length > 0) {
        const best = nonCDrives.sort((a, b) => b.free - a.free)[0];
        if (sourcePath) {
          const sub = sourcePath.replace(/^[a-zA-Z]:\\/, "");
          setTargetPath(`${best.letter}:\\C-SpaceVault\\${sub}`);
        }
      }
    });

    const unlisten = listen<MigrateProgress>("migrate-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [sourcePath]);

  const handleBrowseSource = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择待搬迁的源目录",
      });
      if (selected && typeof selected === "string") {
        setSourcePath(selected);
        const nonCDrives = drives.filter((d) => !d.letter.toLowerCase().startsWith("c"));
        if (nonCDrives.length > 0) {
          const best = nonCDrives.sort((a, b) => b.free - a.free)[0];
          const sub = selected.replace(/^[a-zA-Z]:\\/, "");
          setTargetPath(`${best.letter}:\\C-SpaceVault\\${sub}`);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseTarget = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择目标磁盘物理存储目录",
      });
      if (selected && typeof selected === "string") {
        setTargetPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectCandidate = (item: MigrateCandidate) => {
    setSourcePath(item.path);
    setPrecheck(null);
    setErrorMsg(null);
    const nonCDrives = drives.filter((d) => !d.letter.toLowerCase().startsWith("c"));
    if (nonCDrives.length > 0) {
      const best = nonCDrives.sort((a, b) => b.free - a.free)[0];
      const sub = item.path.replace(/^[a-zA-Z]:\\/, "");
      setTargetPath(`${best.letter}:\\C-SpaceVault\\${sub}`);
    }
  };

  const handlePrecheck = async () => {
    if (!sourcePath || !targetPath) return;
    setChecking(true);
    setErrorMsg(null);
    setPrecheck(null);
    try {
      const res = await invoke<MigratePrecheck>("precheck_migrate", {
        sourcePath,
        targetPath,
        knownProcesses: [],
      });
      setPrecheck(res);
    } catch (e: any) {
      setErrorMsg(e.toString());
    } finally {
      setChecking(false);
    }
  };

  const handleKillProcess = async (proc: ProcInfo) => {
    try {
      await invoke("terminate_process_by_pid", { pid: proc.pid });
      handlePrecheck();
    } catch (e: any) {
      alert(`无法结束进程: ${e}`);
    }
  };

  const handleStartMigrate = async () => {
    if (!precheck?.canMigrate) return;
    setMigrating(true);
    setErrorMsg(null);
    try {
      await invoke("run_migrate", {
        sourcePath,
        targetPath,
      });
      fetchCandidates();
    } catch (e: any) {
      setErrorMsg(e.toString());
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-4 overflow-y-auto">
      {/* 智能 AppData 建议搬家推荐区 */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              AppData / 大文件应用建议搬家目录
            </h3>
          </div>
          <button
            onClick={fetchCandidates}
            disabled={loadingCandidates}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <RefreshCw size={12} className={loadingCandidates ? "animate-spin" : ""} />
            刷新推荐项
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          基于内置应用特征库，自动探测 C 盘庞大但适合迁移的软件目录（如微信/QQ数据、IDE缓存扩展、包管理器缓存等）。点击下方任一项可直接填充搬家方案：
        </p>

        {loadingCandidates ? (
          <div className="flex items-center justify-center py-6 text-xs text-slate-500 gap-2">
            <RefreshCw size={14} className="animate-spin text-blue-400" />
            正在探测 C 盘建议搬家的软件目录及体积...
          </div>
        ) : candidates.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">
            暂未发现可建议搬家的软件数据目录
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
            {candidates.map((item) => {
              const isSelected = sourcePath.toLowerCase() === item.path.toLowerCase();
              return (
                <div
                  key={item.path}
                  onClick={() => !item.isLinked && selectCandidate(item)}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition select-none flex flex-col justify-between ${
                    item.isLinked
                      ? "bg-purple-950/20 border-purple-800/40 opacity-75 cursor-default"
                      : isSelected
                      ? "bg-blue-600/20 border-blue-500"
                      : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        {item.name}
                        {item.isLinked && (
                          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1 py-0.2 rounded border border-purple-500/30 flex items-center gap-0.5">
                            <Check size={10} /> 已搬家/联接
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.purpose}</p>
                    </div>
                    <span className="font-mono text-[11px] text-amber-300 font-bold shrink-0">
                      {item.isLinked ? "已重定向" : formatBytes(item.bytes)}
                    </span>
                  </div>

                  <div className="mt-2 pt-1 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-mono truncate max-w-[80%]" title={item.path}>
                      {item.path}
                    </span>
                    {!item.isLinked && (
                      <span className="text-blue-400 font-medium">选择此项 ➔</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 路径输入与目标规划 */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <FolderOutput size={18} className="text-blue-400" />
          搬家任务设定与目录联接 (Junction)
        </h2>

        <div className="grid grid-cols-2 gap-4 pt-1">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                C 盘待搬迁源目录 (Source)
              </label>
              <button
                type="button"
                onClick={handleBrowseSource}
                className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition"
              >
                <FolderOpen size={12} />
                <span>浏览选择...</span>
              </button>
            </div>
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder="例如：C:\Users\YourName\AppData\Local\pip\cache"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                目标磁盘物理存储路径 (Vault)
              </label>
              <button
                type="button"
                onClick={handleBrowseTarget}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition"
              >
                <FolderOpen size={12} />
                <span>浏览选择...</span>
              </button>
            </div>
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="例如：D:\C-SpaceVault\Users\YourName\AppData\Local\pip\cache"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">目标磁盘剩余空间：</span>
            {drives
              .filter((d) => !d.letter.toLowerCase().startsWith("c"))
              .map((d) => (
                <span
                  key={d.letter}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800 font-mono text-slate-300"
                >
                  {d.letter}: 盘剩余 {formatBytes(d.free)}
                </span>
              ))}
          </div>

          <button
            onClick={handlePrecheck}
            disabled={!sourcePath || !targetPath || checking || migrating}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg text-xs font-semibold text-white shadow transition flex items-center gap-1.5"
          >
            {checking && <RefreshCw size={14} className="animate-spin" />}
            开始安全预检与进程占用检测
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-4 text-xs text-rose-300 flex items-start gap-2">
          <ShieldAlert size={18} className="text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">操作受阻</div>
            <div>{errorMsg}</div>
          </div>
        </div>
      )}

      {/* 预检拦截与占用进程列表 */}
      {precheck && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">预检安全报告</h3>
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={14} /> 空间校验通过 (需要 {formatBytes(precheck.sourceBytes)}，目标剩余 {formatBytes(precheck.targetDriveFree)})
            </span>
          </div>

          {precheck.blockingProcesses.length > 0 ? (
            <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                <AlertOctagon size={16} /> 检测到文件被运行中的程序锁定：
              </div>
              <p className="text-[11px] text-slate-400">
                如果软件正在读写该目录，迁移过程将无法重命名原文件夹。建议点击下方按钮一键关闭对应软件进程：
              </p>

              <div className="divide-y divide-slate-800/60 pt-1">
                {precheck.blockingProcesses.map((proc) => (
                  <div key={proc.pid} className="flex items-center justify-between py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Cpu size={14} className="text-slate-400" />
                      <span className="text-slate-200 font-medium">{proc.name}</span>
                      <span className="text-slate-500 font-mono text-[10px]">(PID: {proc.pid})</span>
                    </div>
                    <button
                      onClick={() => handleKillProcess(proc)}
                      className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-[11px]"
                    >
                      结束该进程
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">
              未检测到任何正在锁住该目录的进程，具备直接迁移条件。
            </div>
          )}

          {/* 进度或执行按钮 */}
          <div className="pt-2 flex justify-between items-center">
            <div className="text-xs text-slate-400">
              源文件数：<span className="font-mono text-slate-200">{precheck.sourceFiles.toLocaleString()}</span> 个
            </div>

            <button
              onClick={handleStartMigrate}
              disabled={migrating}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 rounded-lg text-xs font-bold text-white shadow-lg flex items-center gap-2 transition"
            >
              {migrating ? "迁移事务执行中..." : "确认无误，执行无损搬家"}
            </button>
          </div>
        </div>
      )}

      {/* 迁移进度指示器 */}
      {progress && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-200">{progress.message}</span>
            <span className="font-mono text-blue-400">{progress.percent.toFixed(1)}%</span>
          </div>

          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-blue-500 h-full transition-all duration-200 rounded-full"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>

          <div className="text-[11px] font-mono text-slate-500 truncate" title={progress.currentFile}>
            {progress.currentFile || "正在处理元数据..."}
          </div>
        </div>
      )}
    </div>
  );
};
