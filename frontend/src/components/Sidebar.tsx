import React from 'react';
import { useStore } from '../store/useStore';
import type { ConnState } from '../services/wsService';

type Section = 'devices' | 'hvnc' | 'control' | 'keylogger' | 'files' | 'camera' | 'sms' | 'contacts' | 'location' | 'apk' | 'settings';

const CONN_DOT: Record<ConnState, string> = {
  idle:         'bg-slate-600',
  connecting:   'bg-amber-400 animate-pulse',
  connected:    'bg-green-400',
  reconnecting: 'bg-orange-400 animate-pulse',
};

interface NavItem { id: Section; label: string; path: string }

const NAV: NavItem[] = [
  { id: 'devices',   label: 'Devices',   path: 'M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18h3' },
  { id: 'hvnc',      label: 'HVNC',      path: 'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3' },
  { id: 'control',   label: 'Control',   path: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
  { id: 'keylogger', label: 'Keylog',    path: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z' },
  { id: 'location',  label: 'Location',  path: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z' },
  { id: 'camera',    label: 'Camera',    path: 'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z' },
  { id: 'files',     label: 'Files',     path: 'M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776' },
  { id: 'sms',       label: 'SMS',       path: 'M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z' },
  { id: 'apk',       label: 'APK Build', path: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
  { id: 'settings',  label: 'Settings',  path: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export const Sidebar: React.FC = () => {
  const activeSection  = useStore((s) => s.activeSection);
  const setSection     = useStore((s) => s.setSection);
  const viewMode       = useStore((s) => s.viewMode);
  const setViewMode    = useStore((s) => s.setViewMode);
  const connState      = useStore((s) => s.connState);
  const devices        = useStore((s) => s.devices);
  const keylogs        = useStore((s) => s.keylogs);
  const onlineCount    = devices.filter((d) => d.status === 'online').length;

  // Unread keylog badge
  const recentKeylogs  = keylogs.filter(k => Date.now() - k.timestamp < 60_000).length;

  return (
    <aside className="w-14 flex flex-col items-center py-3 bg-[#060810] border-r border-slate-800/50 shrink-0">
      {/* Logo + connection status */}
      <div className="mb-2.5 flex flex-col items-center gap-1">
        <div className="w-8 h-8 rounded-lg bg-cyan-600/15 border border-cyan-600/30 flex items-center justify-center">
          <span className="text-cyan-400 text-sm font-mono font-bold">R</span>
        </div>
        <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${CONN_DOT[connState]}`} title={connState} />
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-1.5 overflow-y-auto">
        {NAV.map(({ id, label, path }) => {
          const active = activeSection === id;
          const badge  = id === 'keylogger' && recentKeylogs > 0 ? recentKeylogs : null;
          return (
            <button
              key={id}
              title={label}
              onClick={() => setSection(id)}
              className={`relative w-full flex items-center justify-center py-2.5 rounded-md transition-all group ${
                active
                  ? 'bg-cyan-600/15 text-cyan-400'
                  : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-cyan-500 rounded-r" />
              )}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d={path} />
              </svg>
              {badge !== null && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
              <span className="absolute left-14 z-50 px-2 py-1 bg-slate-900 border border-slate-700 text-[11px] font-mono text-white/80 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-xl">
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom — online count + view toggle */}
      <div className="flex flex-col items-center gap-2.5 mt-2 shrink-0">
        <div className="flex flex-col items-center leading-none">
          <span className="text-[11px] font-mono text-green-400 font-semibold">{onlineCount}</span>
          <span className="text-[9px] text-slate-700 mt-0.5">online</span>
        </div>
        <button
          title={`${viewMode === 'android' ? 'Android' : 'PC'} view — click to switch`}
          onClick={() => setViewMode(viewMode === 'android' ? 'pc' : 'android')}
          className="w-8 h-8 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center justify-center text-xs"
        >
          {viewMode === 'android' ? '📱' : '🖥'}
        </button>
      </div>
    </aside>
  );
};
