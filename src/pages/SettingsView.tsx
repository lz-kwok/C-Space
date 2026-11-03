import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BookOpen, Settings as SettingsIcon, Save, Check } from "lucide-react";
import { AppSettings, Rule } from "../types";

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [saved, setSaved] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    invoke<AppSettings>("get_settings").then(setSettings);
    invoke<Rule[]>("get_rules").then(setRules);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await invoke("update_settings", { settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert(`保存失败: ${e}`);
    }
  };

  const filteredRules = rules.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col p-4 gap-4 overflow-y-auto">
      {/* 全局偏好设置 */}
      {settings && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <SettingsIcon size={18} className="text-blue-400" />
              迁移与清理全局偏好
            </h2>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white shadow flex items-center gap-1.5 transition"
            >
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? "已保存" : "保存设置"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <label className="text-xs text-slate-400 block mb-1">默认无损搬家仓库根目录 (Vault)</label>
              <input
                type="text"
                value={settings.defaultVaultDir}
                onChange={(e) => setSettings({ ...settings, defaultVaultDir: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.cleanToRecycleBin}
                  onChange={(e) => setSettings({ ...settings, cleanToRecycleBin: e.target.checked })}
                  className="accent-blue-500 rounded"
                />
                清理默认使用「回收站」安全兜底（关闭则直接永久擦除）
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 内置与外部规则库浏览 */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col min-h-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100">
              内置应用与系统指纹规则库 ({rules.length} 条)
            </h3>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索规则（软件名 / 用途 / 类别）..."
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 w-64"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 pr-1">
          {filteredRules.map((rule) => (
            <div key={rule.id} className="py-2.5 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200">{rule.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                    {rule.category}
                  </span>
                  {rule.risk === "safe" && (
                    <span className="text-[10px] text-emerald-400">🟢 安全清理</span>
                  )}
                  {rule.risk === "caution" && (
                    <span className="text-[10px] text-amber-400">🟡 谨慎清理</span>
                  )}
                  {rule.risk === "danger" && (
                    <span className="text-[10px] text-rose-400">🔴 高危禁删</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  {rule.cleanable && <span>支持清理</span>}
                  {rule.migratable && <span>支持无损搬迁</span>}
                </div>
              </div>

              <p className="text-[11px] text-slate-400">{rule.purpose}</p>

              <div className="text-[10px] font-mono text-slate-500 truncate" title={rule.paths.join(" | ")}>
                {rule.paths.join(" | ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
