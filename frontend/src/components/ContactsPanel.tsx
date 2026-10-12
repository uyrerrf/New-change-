import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { sendCommand } from '../services/wsService';
import type { Contact } from '../types';

interface Props { deviceId: string }

export const ContactsPanel: React.FC<Props> = ({ deviceId }) => {
  const contacts    = useStore((s) => s.contacts);
  const list        = contacts.get(deviceId) ?? [];
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);

  useEffect(() => {
    setLoading(true);
    sendCommand(deviceId, 'GET_CONTACTS');
  }, [deviceId]);

  useEffect(() => {
    if (list.length > 0) setLoading(false);
  }, [list.length]);

  const filtered = search
    ? list.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phones.some(p => p.includes(search))
      )
    : list;

  const exportCsv = () => {
    const rows = filtered.map(c => [c.name, c.phones.join(' | '), c.emails.join(' | ')].join(','));
    const blob  = new Blob([['Name,Phones,Emails', ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contacts-${deviceId.slice(-6)}-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="h-full flex overflow-hidden" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* List */}
      <div className="w-72 flex flex-col border-r border-slate-800 shrink-0">
        <div className="px-3 py-2.5 border-b border-slate-800 flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-white/70 tracking-widest uppercase">Contacts</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">{filtered.length}</span>
          <div className="ml-auto flex gap-1.5">
            <button onClick={exportCsv} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 font-mono">CSV</button>
            <button onClick={() => { setLoading(true); sendCommand(deviceId, 'GET_CONTACTS'); }}
              className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 font-mono">↺</button>
          </div>
        </div>

        <div className="px-3 py-1.5 border-b border-slate-800/60 shrink-0">
          <input
            type="text" placeholder="Search name or number…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-cyan-600 placeholder-slate-600"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && list.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-600 animate-pulse">Fetching contacts…</div>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full text-left px-3 py-2 border-b border-slate-900 hover:bg-slate-800/30 transition-colors ${selected?.id === c.id ? 'bg-slate-800/50' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-semibold text-slate-300">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-white/80 font-semibold truncate">{c.name || '—'}</div>
                  <div className="text-[10px] text-slate-500 truncate">{c.phones[0] ?? c.emails[0] ?? ''}</div>
                </div>
              </div>
            </button>
          ))}
          {!loading && filtered.length === 0 && list.length > 0 && (
            <div className="p-4 text-center text-xs text-slate-600">No results for "{search}"</div>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-5">
        {selected ? (
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-slate-300">
                  {selected.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-white/90">{selected.name}</h2>
                <p className="text-xs text-slate-500">{selected.id}</p>
              </div>
            </div>

            {selected.phones.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">Phone Numbers</p>
                <div className="space-y-1">
                  {selected.phones.map(p => (
                    <div key={p} className="flex items-center justify-between px-3 py-2 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-xs font-mono text-white/70">{p}</span>
                      <button
                        onClick={() => sendCommand(deviceId, 'MAKE_CALL', { number: p })}
                        className="text-[10px] px-2 py-0.5 rounded bg-cyan-800/40 text-cyan-400 hover:bg-cyan-700/50 transition-colors"
                      >
                        CALL
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.emails.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">Emails</p>
                {selected.emails.map(e => (
                  <div key={e} className="px-3 py-2 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono text-white/60">{e}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-slate-600">Select a contact</p>
          </div>
        )}
      </div>
    </div>
  );
};
