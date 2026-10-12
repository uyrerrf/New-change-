import React, { useState } from 'react';
import { auth as authApi } from '../services/api';
import { useStore } from '../store/useStore';

export const Login: React.FC = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useStore((s) => s.setAuth);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, ok } = await authApi.login(password);
      if (!ok) throw new Error('Invalid credentials');
      setAuth({ authenticated: true, token });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#070A0F]"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <div className="w-72 flex flex-col gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-cyan-600/20 border border-cyan-600/40 flex items-center justify-center">
            <span className="text-cyan-400 text-xl font-bold font-mono">R</span>
          </div>
          <h1 className="text-sm font-semibold text-white/60 tracking-[0.3em] uppercase">Remote Panel</h1>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Access Key</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white/80 outline-none focus:border-cyan-600 transition-colors placeholder-slate-700"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-mono tracking-widest transition-colors disabled:opacity-40"
          >
            {loading ? 'VERIFYING...' : 'CONNECT'}
          </button>
        </form>

        <p className="text-[10px] text-slate-700 text-center">v1.0.0</p>
      </div>
    </div>
  );
};
