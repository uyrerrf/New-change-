import 'dotenv/config';
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { attachWss } from './wsManager.js';
import authRouter, { verifyToken } from './routes/auth.js';
import devicesRouter from './routes/devices.js';
import apkRouter from './routes/apk.js';

const PORT        = Number(process.env['PORT']        ?? 3001);
const DEVICE_PORT = Number(process.env['DEVICE_PORT'] ?? 3002);
const USE_TLS     = process.env['USE_TLS'] === 'true';
const CERT_DIR    = process.env['CERT_DIR'] ?? path.resolve(process.cwd(), 'certs');

/* ── Express ──────────────────────────────────────────────── */
const app = express();

// CORS — no credentials flag; auth is via Bearer token / WS query param
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Auth middleware — skip /auth sub-routes
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  const header = req.headers['authorization'] ?? '';
  const token  = header.startsWith('Bearer ')
    ? header.slice(7)
    : (req.query['token'] as string | undefined) ?? '';
  if (!verifyToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

app.use('/api/auth',    authRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/apk',     apkRouter);
app.get('/api/health',  (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Serve built frontend
const publicDir = path.resolve(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback — must come after all API routes
  app.get(/^\/(?!api).*/, (_req, res) =>
    res.sendFile(path.join(publicDir, 'index.html'))
  );
}

/* ── Operator HTTP(S) server ─────────────────────────────── */
let operatorServer: http.Server | https.Server;

if (USE_TLS) {
  const keyPath  = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    operatorServer = https.createServer(
      { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
      app
    );
    console.log('[server] TLS enabled');
  } else {
    console.warn('[server] USE_TLS=true but certs not found — falling back to HTTP');
    operatorServer = http.createServer(app);
  }
} else {
  operatorServer = http.createServer(app);
}

/* ── Operator WebSocket (JWT-gated, noServer upgrade) ──────── */
const operatorWss = new WebSocketServer({ noServer: true });

operatorServer.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws/operator')) {
    socket.destroy();
    return;
  }
  const params = new URLSearchParams(req.url.split('?')[1] ?? '');
  const token  = params.get('token') ?? '';
  if (!verifyToken(token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  operatorWss.handleUpgrade(req, socket, head, (ws) => {
    operatorWss.emit('connection', ws, req);
  });
});

operatorServer.listen(PORT, () =>
  console.log(`[operator] HTTP + WS  :${PORT}`)
);

/* ── Device WebSocket (separate port) ───────────────────────
   Keep this port internal — firewall from public internet, or
   set DEVICE_SECRET in .env to require a key query-param.     */
const deviceHttpServer = http.createServer();
const deviceWss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,  // JPEG frames are already compressed; deflate adds CPU with zero gain
});

const DEVICE_SECRET = process.env['DEVICE_SECRET'] ?? '';

deviceHttpServer.on('upgrade', (req, socket, head) => {
  // Optional pre-shared key check
  if (DEVICE_SECRET) {
    const params = new URLSearchParams(req.url?.split('?')[1] ?? '');
    if (params.get('key') !== DEVICE_SECRET) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
  }
  deviceWss.handleUpgrade(req, socket, head, (ws) => {
    deviceWss.emit('connection', ws, req);
  });
});

deviceHttpServer.listen(DEVICE_PORT, () =>
  console.log(`[devices]  WS         :${DEVICE_PORT}`)
);

/* ── Wire WebSocket manager ─────────────────────────────── */
attachWss(deviceWss, operatorWss);

console.log('[server] ready');
