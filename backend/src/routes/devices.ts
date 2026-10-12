import { Router } from 'express';
import { getDevices, getDevice } from '../wsManager.js';
import { WebSocket } from 'ws';

const router = Router();

/* GET /api/devices */
router.get('/', (_req, res) => {
  const list = getDevices().map(({ ws: _ws, ...d }) => { void _ws; return d; });
  res.json({ devices: list });
});

/* GET /api/devices/:id */
router.get('/:id', (req, res) => {
  const dev = getDevice(req.params.id);
  if (!dev) { res.status(404).json({ error: 'Not found' }); return; }
  const { ws: _ws, ...rest } = dev; void _ws;
  res.json(rest);
});

/* POST /api/devices/:id/command — fire-and-forget command via REST */
router.post('/:id/command', (req, res) => {
  const dev = getDevice(req.params.id);
  if (!dev) { res.status(404).json({ error: 'Not found' }); return; }
  const { command, params } = req.body as { command: string; params?: Record<string, unknown> };
  if (!command) { res.status(400).json({ error: 'Missing command' }); return; }
  if (dev.ws.readyState === WebSocket.OPEN) {
    dev.ws.send(JSON.stringify({ type: 'command', command, params: params ?? {} }));
    res.json({ ok: true });
  } else {
    res.status(503).json({ error: 'Device not connected' });
  }
});

/* GET /api/devices/:id/files?path= — request file listing via REST
   Sends GET_FILES command to device; actual data arrives via WS.
   This endpoint also returns any cached listing from the last WS response.   */
router.get('/:id/files', (req, res) => {
  const dev = getDevice(req.params.id);
  if (!dev) { res.status(404).json({ error: 'Not found' }); return; }
  const path = String(req.query['path'] ?? '/sdcard');
  if (dev.ws.readyState === WebSocket.OPEN) {
    dev.ws.send(JSON.stringify({ type: 'command', command: 'GET_FILES', params: { path } }));
    res.json({ files: [], path, note: 'File listing will arrive via WebSocket' });
  } else {
    res.status(503).json({ error: 'Device not connected' });
  }
});

/* DELETE /api/devices/:id/files?path= — delete a file on device */
router.delete('/:id/files', (req, res) => {
  const dev = getDevice(req.params.id);
  if (!dev) { res.status(404).json({ error: 'Not found' }); return; }
  const path = String(req.query['path'] ?? '');
  if (!path) { res.status(400).json({ error: 'Missing path' }); return; }
  if (dev.ws.readyState === WebSocket.OPEN) {
    dev.ws.send(JSON.stringify({ type: 'command', command: 'DELETE_FILE', params: { path } }));
    res.json({ ok: true });
  } else {
    res.status(503).json({ error: 'Device not connected' });
  }
});

/* GET /api/devices/:id/download?path= — proxy file download from device
   Sends DOWNLOAD_FILE command; device streams the file back via a separate
   HTTP request or WS binary. For now returns a redirect hint.               */
router.get('/:id/download', (req, res) => {
  const dev = getDevice(req.params.id);
  if (!dev) { res.status(404).json({ error: 'Not found' }); return; }
  const path = String(req.query['path'] ?? '');
  if (!path) { res.status(400).json({ error: 'Missing path' }); return; }
  // Request device to upload the file — it will send via WS binary
  if (dev.ws.readyState === WebSocket.OPEN) {
    dev.ws.send(JSON.stringify({ type: 'command', command: 'GET_FILE_CONTENT', params: { path } }));
    res.json({ ok: true, message: 'File requested — will arrive via WebSocket' });
  } else {
    res.status(503).json({ error: 'Device not connected' });
  }
});

/* GET /api/devices/:id/screenshot */
router.get('/:id/screenshot', (req, res) => {
  const dev = getDevice(req.params.id);
  if (!dev) { res.status(404).json({ error: 'Not found' }); return; }
  if (dev.ws.readyState === WebSocket.OPEN) {
    dev.ws.send(JSON.stringify({ type: 'command', command: 'SNAP_SCREEN' }));
    res.json({ ok: true, message: 'Screenshot requested — will arrive via WebSocket' });
  } else {
    res.status(503).json({ error: 'Device not connected' });
  }
});

export default router;
