import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Link2, Trash2, RotateCcw, Plus, AlertTriangle, CheckCircle, RefreshCw, FolderOpen } from "lucide-react";
import { LinkDetail } from "../types";

export const LinksView: React.FC = () => {
  const [links, setLinks] = useState<LinkDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // 手动新增表单
  const [srcPath, setSrcPath] = useState<string>("");
  const [tgtPath, setTgtPath] = useState<string>("");
  const [linkType, setLinkType] = useState<string>("junction");
  const [note, setNote] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res = await invoke<LinkDetail[]>("get_links");
      setLinks(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleDeleteLink = async (sourcePath: string) => {
    if (!confirm(`确定要移除软链接吗？\n注意：这只会删除链接本身，不会删除目标实际文件。`)) {
      return;
    }
    try {
      await invoke("delete_link", { sourcePath });
      await fetchLinks();
    } catch (e: any) {
      alert(`解除失败: ${e}`);
    }
  };

  const handleRollback = async (link: LinkDetail) => {
    if (!confirm(`确定要将数据从 ${link.targetPath} 完整迁回原路径 ${link.sourcePath} 吗？`)) {
      return;
    }
    try {
      await invoke("run_rollback", {
        sourcePath: link.sourcePath,
        targetPath: link.targetPath,
      });
      alert("迁回成功！");
      await fetchLinks();
    } catch (e: any) {
      alert(`迁回失败: ${e}`);
    }
  };

  const handleCreate = async () => {
    setErrorMsg(null);
    try {
      await invoke("create_custom_link", {
        sourcePath: srcPath,
        targetPath: tgtPath,
        linkType,
        note: note ? note : null,
      });
      setShowAddModal(false);
      setSrcPath("");
      setTgtPath("");
      setNote("");
      await fetchLinks();
    } catch (e: any) {
      setErrorMsg(e.toString());
    }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-4">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Link2 size={18} className="text-purple-400" />
            软链接 / 联接生命周期管理 (账本)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            监控所有通过本工具或外部创建的软链接状态，自动检测断链，支持一键安全还原/迁回 C 盘。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-semibold text-white shadow flex items-center gap-1.5 transition"
          >
            <Plus size={16} /> 手动创建链接映射
          </button>
          <button
            onClick={fetchLinks}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
            title="刷新"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 链接账本列表 */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-0">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-800/40 text-xs font-semibold text-slate-400 border-b border-slate-800">
          <div className="col-span-5">源链接路径 (虚拟入口)</div>
          <div className="col-span-4">实际指向路径 (存储位置)</div>
          <div className="col-span-1">类型</div>
          <div className="col-span-2 text-right">管理操作</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-500 text-xs gap-2">
              <RefreshCw size={16} className="animate-spin text-purple-400" /> 正在巡检软链接有效性...
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
              <Link2 size={32} className="opacity-40" />
              <span className="text-xs">暂无受管软链接记录，前往「AppData搬家」迁移目录即可在此生成账本</span>
            </div>
          ) : (
            links.map((link) => (
              <div
                key={link.id}
                className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-xs hover:bg-slate-800/30 transition"
              >
                {/* 源路径 */}
                <div className="col-span-5 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-slate-200 truncate font-medium" title={link.sourcePath}>
                      {link.sourcePath}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {link.isBroken ? (
                      <span className="text-[10px] text-rose-400 flex items-center gap-1 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                        <AlertTriangle size={10} /> 异常断链 (目标缺失)
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                        <CheckCircle size={10} /> 正常透传
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500">{new Date(link.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* 实际目标 */}
                <div className="col-span-4 min-w-0 pr-2">
                  <div className="font-mono text-purple-300 truncate" title={link.targetPath}>
                    {link.targetPath}
                  </div>
                </div>

                {/* 类型 */}
                <div className="col-span-1">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 font-mono text-slate-300">
                    {link.linkType}
                  </span>
                </div>

                {/* 操作 */}
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleRollback(link)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 rounded"
                    title="一键迁回 C 盘"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteLink(link.sourcePath)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 rounded"
                    title="仅解除链接映射 (不删目标原文件)"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 手动新增链接弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Plus size={16} className="text-purple-400" />
              创建自定义跨盘软链接
            </h3>

            {errorMsg && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-800 rounded text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-slate-400">源链接虚拟路径 (即将在 C 盘或原位置创建的软链接)</label>
                  <button
                    type="button"
                    onClick={async () => {
                      const sel = await open({ directory: true, multiple: false, title: "选择源虚拟路径所在目录" });
                      if (sel && typeof sel === "string") setSrcPath(sel);
                    }}
                    className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300"
                  >
                    <FolderOpen size={12} />
                    <span>浏览...</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={srcPath}
                  onChange={(e) => setSrcPath(e.target.value)}
                  placeholder="例如：C:\MyVirtualFolder"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-slate-400">目标实际路径 (在其他磁盘已存在的实际文件夹或文件)</label>
                  <button
                    type="button"
                    onClick={async () => {
                      const sel = await open({ directory: true, multiple: false, title: "选择目标物理目录" });
                      if (sel && typeof sel === "string") setTgtPath(sel);
                    }}
                    className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300"
                  >
                    <FolderOpen size={12} />
                    <span>浏览...</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={tgtPath}
                  onChange={(e) => setTgtPath(e.target.value)}
                  placeholder="例如：D:\Data\MyRealFolder"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">链接技术类型</label>
                <select
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="junction">目录联接 Junction (mklink /J，兼容性最佳，推荐目录使用)</option>
                  <option value="symlink_dir">目录符号链接 (mklink /D)</option>
                  <option value="symlink_file">单文件符号链接 (mklink)</option>
                  <option value="hardlink">文件硬链接 (仅支持同驱动器)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">备注说明 (可选)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：自定义开发测试目录映射"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!srcPath || !tgtPath}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-xs font-bold text-white shadow"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
