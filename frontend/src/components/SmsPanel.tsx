import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { sendCommand } from '../services/wsService';
import type { SmsThread } from '../types';

interface Props { deviceId: string }

export const SmsPanel: React.FC<Props> = ({ deviceId }) => {
  const smsThreads    = useStore((s) => s.smsThreads);
  const threads       = smsThreads.get(deviceId) ?? [];
  const [selected, setSelected] = useState<SmsThread | null>(null);
  const [replyText,  setReplyText]  = useState('');
  const [replyTo,    setReplyTo]    = useState('');
  const [loading,    setLoading]    = useState(false);
  const addToast = useStore((s) => s.addToast);

  useEffect(() => {
    setLoading(true);
    sendCommand(deviceId, 'GET_SMS');
    // Loading state cleared when smsThreads gets populated via WS
  }, [deviceId]);

  useEffect(() => {
    if (threads.length > 0) setLoading(false);
  }, [threads.length]);

  const sendSms = () => {
    const number = selected?.address ?? replyTo;
    if (!number || !replyText.trim()) return;
    sendCommand(deviceId, 'SEND_SMS', { number, text: replyText });
    addToast({ type: 'success', message: `SMS sent to ${number}`, duration: 3000 });
    setReplyText('');
  };

  return (
    <div className="h-full flex overflow-hidden" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* Thread list */}
      <div className="w-64 border-r border-slate-800 flex flex-col shrink-0">
        <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-white/70 tracking-widest uppercase">SMS</span>
          <button
            onClick={() => { setLoading(true); sendCommand(deviceId, 'GET_SMS'); }}
            className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 font-mono"
          >
            REFRESH
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && threads.length === 0 && (
            <div className="p-4 text-xs text-slate-600 text-center animate-pulse">Fetching SMS…</div>
          )}
          {threads.map(thread => (
            <button
              key={thread.address}
              onClick={() => { setSelected(thread); setReplyTo(thread.address); }}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-900 hover:bg-slate-800/40 transition-colors ${
                selected?.address === thread.address ? 'bg-slate-800/60' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[11px] truncate font-semibold ${thread.unread > 0 ? 'text-white' : 'text-slate-300'}`}>
                  {thread.name || thread.address}
                </span>
                {thread.unread > 0 && (
                  <span className="text-[9px] px-1 rounded-full bg-cyan-600 text-white shrink-0 ml-1">{thread.unread}</span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 truncate">{thread.lastBody}</div>
              <div className="text-[9px] text-slate-700 mt-0.5">
                {new Date(thread.lastDate).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="px-4 py-2.5 border-b border-slate-800 shrink-0">
              <span className="text-sm font-semibold text-white/80">{selected.name || selected.address}</span>
              <span className="text-xs text-slate-500 ml-2">{selected.address}</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {[...selected.messages].reverse().map((msg) => (
                <div key={msg.id} className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-3 py-2 rounded-xl text-xs ${
                    msg.type === 'sent'
                      ? 'bg-cyan-700/40 text-cyan-100 rounded-tr-none'
                      : 'bg-slate-800 text-slate-200 rounded-tl-none'
                  }`}>
                    <p className="break-words">{msg.body}</p>
                    <p className="text-[9px] opacity-50 mt-1 text-right">
                      {new Date(msg.date).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply bar */}
            <div className="px-3 py-2 border-t border-slate-800 shrink-0 flex gap-2">
              <input
                type="text"
                placeholder="Type message…"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSms(); } }}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-white/80 outline-none focus:border-cyan-600 placeholder-slate-600"
              />
              <button
                onClick={sendSms}
                disabled={!replyText.trim()}
                className="px-4 py-1.5 rounded-full bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono transition-colors disabled:opacity-40"
              >
                SEND
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            {/* Custom send form when no thread selected */}
            <p className="text-xs text-slate-600">No thread selected — or send to a new number</p>
            <div className="flex flex-col gap-2 w-64">
              <input
                type="text" placeholder="+1 (555) 000-0000"
                value={replyTo} onChange={e => setReplyTo(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white/80 outline-none focus:border-cyan-600 placeholder-slate-600 font-mono"
              />
              <textarea
                placeholder="Message…"
                value={replyText} onChange={e => setReplyText(e.target.value)}
                rows={3}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white/80 outline-none focus:border-cyan-600 placeholder-slate-600 resize-none"
              />
              <button
                onClick={sendSms}
                disabled={!replyText.trim() || !replyTo.trim()}
                className="py-2 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono disabled:opacity-40 transition-colors"
              >
                SEND SMS
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
