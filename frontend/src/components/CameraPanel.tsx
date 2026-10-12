import React, { useEffect, useRef, memo } from 'react';
import { useStore } from '../store/useStore';
import { sendCommand } from '../services/wsService';

interface Props { deviceId: string }

const CameraPanel: React.FC<Props> = ({ deviceId }) => {
  const cameraFrame = useStore((s) => s.cameraFrame);
  const camera      = useStore((s) => s.camera);
  const setCamera   = useStore((s) => s.setCamera);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const pendingRef  = useRef<Uint8Array | null>(null);
  const decodingRef = useRef(false);

  /* ── Frame decode (same pattern as HVNC) ──────────────────── */
  useEffect(() => {
    if (!cameraFrame) return;
    pendingRef.current = cameraFrame;
    if (!decodingRef.current) decodeAndDraw();
  }, [cameraFrame]);

  async function decodeAndDraw(): Promise<void> {
    decodingRef.current = true;
    try {
      while (pendingRef.current) {
        const frame = pendingRef.current;
        pendingRef.current = null;
        try {
          const bmp    = await createImageBitmap(new Blob([frame as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
                canvas.width = bmp.width; canvas.height = bmp.height;
              }
              ctx.drawImage(bmp, 0, 0);
            }
          }
          bmp.close();
        } catch { /* skip corrupt frame */ }
      }
    } finally {
      decodingRef.current = false;
    }
  }

  const start = () => {
    sendCommand(deviceId, 'TOGGLE_CAMERA');
    setCamera({ active: true });
  };
  const stop  = () => {
    sendCommand(deviceId, 'TOGGLE_CAMERA');
    setCamera({ active: false, fps: 0 });
  };
  const switchCam = () => {
    sendCommand(deviceId, 'SWITCH_CAMERA');
    setCamera({ facing: camera.facing === 'back' ? 'front' : 'back' });
  };
  const snapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/jpeg', 0.95);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = `cam-${deviceId.slice(-6)}-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <div className="h-full flex flex-col bg-black" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-3 shrink-0">
        <span className="text-xs font-semibold text-white/70 tracking-widest uppercase">Camera</span>
        <span className={`w-1.5 h-1.5 rounded-full ${camera.active ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
        {camera.active && (
          <span className="text-[10px] font-mono text-slate-400">{camera.fps} fps · {camera.facing}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={switchCam}   className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono">SWITCH</button>
          <button onClick={snapshot}    className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono">SNAP</button>
          <button
            onClick={camera.active ? stop : start}
            className={`text-[11px] px-3 py-1 rounded font-mono transition-colors ${camera.active ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
          >
            {camera.active ? 'STOP' : 'START'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center bg-[#050507]">
        <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
        {!camera.active && (
          <div className="absolute flex flex-col items-center gap-3">
            <svg className="w-10 h-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.268a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-[11px] text-slate-600 tracking-widest">CAMERA INACTIVE</p>
            <button onClick={start} className="px-4 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono">START CAMERA</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(CameraPanel);
