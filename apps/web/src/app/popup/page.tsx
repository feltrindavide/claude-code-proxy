'use client';
import { useEffect, useState, useCallback } from 'react';

const API = 'http://localhost:3456';

interface Provider { name: string; models: string[]; enabled: boolean; }
interface RouteEntry { claudeTier: string; providerName: string; targetModel: string; }

const TIERS = [
  { tier: 'opus', label: 'Opus', color: '#ff9f0a' },
  { tier: 'sonnet', label: 'Sonnet', color: '#5ac8fa' },
  { tier: 'haiku', label: 'Haiku', color: '#34c759' },
];

function openUrl(url: string) {
  const tauri = (window as any).__TAURI__;
  if (tauri?.shell?.open) tauri.shell.open(url);
  else window.open(url, '_blank');
}

export default function PopupPage() {
  const [status, setStatus] = useState<'running' | 'stopped' | 'loading'>('stopped');
  const [health, setHealth] = useState<any>(null);
  const [routes, setRoutes] = useState<RouteEntry[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [h, r, p] = await Promise.all([
        fetch(`${API}/health`).then(r => r.json()),
        fetch(`${API}/admin/routes`).then(r => r.json()),
        fetch(`${API}/admin/providers`).then(r => r.json()),
      ]);
      setHealth(h); setStatus('running');
      setRoutes(Array.isArray(r) ? r : (r.routes || [])); setProviders(p);
    } catch { setStatus('stopped'); setHealth(null); }
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);

  async function updateRoute(tier: string, field: 'providerName' | 'targetModel', value: string) {
    const nr = routes.map(r => r.claudeTier === tier ? { ...r, [field]: value } : r);
    if (!nr.find(r => r.claudeTier === tier)) nr.push({ claudeTier: tier, providerName: '', targetModel: '' });
    try {
      await fetch(`${API}/admin/routes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: nr.filter(r => r.providerName && r.targetModel) }),
      });
      setRoutes(nr);
    } catch {}
  }

  const getRoute = (t: string) => routes.find(r => r.claudeTier === t);
  const getModels = (t: string) => providers.find(p => p.name === getRoute(t)?.providerName)?.models || [];

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      background: 'var(--color-canvas)', color: 'var(--color-ink)', width: 350,
      padding: '14px 16px 12px 16px', margin: 0,
      overflow: 'hidden', userSelect: 'none',
    }}>
      <style>{`
        body { margin: 0; padding: 0; background: var(--color-canvas); border-radius: 10px; overflow: hidden; font-family: 'JetBrains Mono', 'SF Mono', monospace; }
        select {
          font-family: 'JetBrains Mono', 'SF Mono', monospace;
          font-size: 11px; font-weight: 400;
          background: var(--color-surface-card); color: var(--color-ink);
          border: 1px solid var(--color-hairline-strong); border-radius: 6px;
          padding: 4px 28px 4px 8px; outline: none; cursor: pointer;
          min-height: 26px; transition: border-color 0.15s;
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23807d72' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
          background-position: right 0.4rem center;
          background-repeat: no-repeat;
          background-size: 1rem;
        }
        select:hover { border-color: var(--color-muted); }
        select:focus { border-color: var(--color-primary); box-shadow: 0 0 0 1.5px var(--color-primary); }
        select option { background: var(--color-surface-card); color: var(--color-ink); padding: 4px; font-family: 'JetBrains Mono', 'SF Mono', monospace; }
        button { font-family: 'JetBrains Mono', 'SF Mono', monospace; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: '#f54e00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: 'white' }}>C</div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>ClaudeCode Proxy</span>
        </div>
        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500,
          background: status === 'running' ? 'rgba(31,138,101,0.15)' : 'var(--color-surface-strong)',
          color: status === 'running' ? 'var(--color-semantic-success)' : 'var(--color-muted)' }}>
          {status === 'running' ? 'Running' : 'Stopped'}
        </span>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-hairline-soft)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Proxy</div>
          <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 500, marginTop: 2, color: 'var(--color-ink)' }}>
            {status === 'running' ? `Running on port ${health?.port || '3456'}` : 'Not running'}
          </div>
        </div>
        <button onClick={async () => {
          setStatus('loading');
          const t = (window as any).__TAURI__;
          try {
            if (status === 'running' && t?.invoke) await t.invoke('stop_proxy');
            else if (t?.invoke) await t.invoke('start_proxy');
          } catch {}
          setTimeout(refresh, 2000);
        }}
          style={{ padding: '5px 16px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', background: status === 'running' ? 'rgba(207,45,86,0.12)' : 'var(--color-primary)',
            color: status === 'running' ? 'var(--color-semantic-error)' : 'var(--color-on-primary)' }}>
          {status === 'loading' ? '...' : status === 'running' ? 'Stop' : 'Start'}
        </button>
      </div>

      {/* Model Mapping */}
      <div style={{ background: 'var(--color-hairline-soft)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Model Mapping</div>
        {TIERS.map(t => {
          const route = getRoute(t.tier);
          const models = getModels(t.tier);
          return (
            <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#8e8e93', width: 48, flexShrink: 0 }}>{t.label}</span>
              <select value={route?.providerName || ''} onChange={e => updateRoute(t.tier, 'providerName', e.target.value)}
                style={{ flex: 1, minWidth: 0, marginRight: 4 }}>
                <option value="">Provider</option>
                {providers.filter(p => p.enabled).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
              <select value={route?.targetModel || ''} onChange={e => updateRoute(t.tier, 'targetModel', e.target.value)}
                style={{ flex: 1.3, minWidth: 0 }}>
                <option value="">Model</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => openUrl('http://localhost:3456')}
          style={{ flex: 1, padding: 8, border: '1px solid var(--color-hairline-strong)', borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', background: 'var(--color-surface-card)', color: 'var(--color-ink)' }}>
          Dashboard
        </button>
        <button onClick={() => openUrl('http://localhost:3456/settings')}
          style={{ flex: 1, padding: 8, border: '1px solid var(--color-hairline-strong)', borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', background: 'var(--color-surface-card)', color: 'var(--color-ink)' }}>
          Settings
        </button>
      </div>
    </div>
  );
}
