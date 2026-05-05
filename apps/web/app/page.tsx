'use client';

import { useEffect, useState } from 'react';

export default function HomePage() {
  const [token, setToken] = useState('');
  const [api, setApi] = useState('http://localhost:8787');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('xdm_token');
    const a = localStorage.getItem('xdm_api');
    if (t) setToken(t);
    if (a) setApi(a);
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${api.replace(/\/$/, '')}/health`, { headers });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      localStorage.setItem('xdm_token', token);
      localStorage.setItem('xdm_api', api);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass p-8 max-w-md w-full">
        <h1 className="text-3xl gradient-text mb-2">x-dm-engine</h1>
        <p className="text-zinc-400 text-sm mb-6">
          Connect to your self-hosted instance.
        </p>
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">API URL</label>
            <input
              type="url"
              value={api}
              onChange={(e) => setApi(e.target.value)}
              placeholder="http://localhost:8787"
              className="w-full px-3 py-2 bg-black/40 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-zinc-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              API Token <span className="text-zinc-600">(leave blank if API_TOKEN is unset)</span>
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="optional"
              className="w-full px-3 py-2 bg-black/40 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" className="btn-primary w-full">
            Connect
          </button>
        </form>
        <p className="text-xs text-zinc-600 mt-6">
          Token is stored in your browser's localStorage. For multi-user setups, put a real
          auth provider in front of the API.
        </p>
      </div>
    </div>
  );
}
