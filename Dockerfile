# ── Stage 1: build frontend ────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build          # outputs to ../backend/public

# ── Stage 2: build backend ─────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --prefer-offline
COPY backend/ ./
COPY --from=frontend-builder /app/backend/public ./public
RUN npm run build

# ── Stage 3: runtime ───────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache openjdk17-jre-headless
WORKDIR /app/backend

# Only production deps
COPY backend/package*.json ./
RUN npm ci --omit=dev --prefer-offline

COPY --from=backend-builder /app/backend/dist     ./dist
COPY --from=backend-builder /app/backend/public   ./public

# APK output volume mount point
RUN mkdir -p apk-output

EXPOSE 3001 3002
CMD ["node", "dist/server.js"]
