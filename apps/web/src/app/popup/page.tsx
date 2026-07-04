'use client';
import { useEffect, useState, useCallback } from 'react';
import { getProxyHttpBase } from '@/lib/proxyBase';

interface Provider { name: string; models: string[]; enabled: boolean; }
interface RouteEntry { claudeTier: string; providerName: string; targetModel: string; }

const TIERS = [
  { tier: 'opus', label: 'Opus', color: '#ff9f0a' },
  { tier: 'sonnet', label: 'Son', color: '#5ac8fa' },
  { tier: 'haiku', label: 'Hai', color: '#34c759' },
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
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const refresh = useCallback(async () => {
    const API = getProxyHttpBase();
    try {
      const [h, r, p, d] = await Promise.all([
        fetch(`${API}/health`).then(r => r.json()),
        fetch(`${API}/admin/routes`).then(r => r.json()),
        fetch(`${API}/admin/providers`).then(r => r.json()),
        fetch(`${API}/admin/discovery`).then(r => r.json()).catch(() => ({ providers: [] })),
      ]);
      setHealth(h); setStatus('running');
      setRoutes(Array.isArray(r) ? r : (r.routes || [])); setProviders(p);
      setDiscoveredCount(d.providers?.filter((pr: any) => pr.reachable)?.length || 0);
    } catch { setStatus('stopped'); setHealth(null); }
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);

  async function updateRoute(tier: string, field: 'providerName' | 'targetModel', value: string) {
    const nr = routes.map(r => r.claudeTier === tier ? { ...r, [field]: value } : r);
    if (!nr.find(r => r.claudeTier === tier)) nr.push({ claudeTier: tier, providerName: '', targetModel: '' });
    try {
      await fetch(`${getProxyHttpBase()}/admin/routes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: nr.filter(r => r.providerName && r.targetModel) }),
      });
      setRoutes(nr);
    } catch {}
  }

  const getRoute = (t: string) => routes.find(r => r.claudeTier === t);
  const getModels = (t: string) => providers.find(p => p.name === getRoute(t)?.providerName)?.models || [];

  const statusLabel = status === 'running'
    ? `:${health?.port || '3456'}`
    : status === 'loading' ? '…' : 'off';

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      background: 'var(--color-canvas)', color: 'var(--color-ink)',
      width: '100%', boxSizing: 'border-box',
      padding: '4px 10px', margin: 0,
      overflow: 'hidden', userSelect: 'none',
    }}>
      <style>{`
        body { margin: 0; padding: 0; background: var(--color-canvas); border-radius: 10px; overflow: hidden; }
        select {
          font-family: inherit;
          font-size: 10px;
          background: var(--color-surface-card); color: var(--color-ink);
          border: 1px solid var(--color-hairline-strong); border-radius: 5px;
          padding: 2px 18px 2px 5px; outline: none; cursor: pointer;
          min-height: 20px; width: 100%;
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23807d72' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
          background-position: right 0.25rem center;
          background-repeat: no-repeat;
          background-size: 0.75rem;
        }
        select:focus { border-color: var(--color-primary); }
        button { font-family: inherit; }
      `}</style>

      {/* Header + proxy control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <div style={{ width: 16, height: 16, borderRadius: 3, background: '#f54e00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9, color: 'white', flexShrink: 0 }}>C</div>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ClaudeCode Proxy</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-muted)', flexShrink: 0 }}>{statusLabel}</span>
        <button onClick={async () => {
          setStatus('loading');
          const t = (window as any).__TAURI__;
          try {
            if (status === 'running' && t?.invoke) await t.invoke('stop_proxy');
            else if (t?.invoke) await t.invoke('start_proxy');
          } catch {}
          setTimeout(refresh, 2000);
        }}
          style={{ padding: '2px 8px', border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 600, flexShrink: 0,
            cursor: 'pointer', background: status === 'running' ? 'rgba(207,45,86,0.12)' : 'var(--color-primary)',
            color: status === 'running' ? 'var(--color-semantic-error)' : 'var(--color-on-primary)' }}>
          {status === 'loading' ? '…' : status === 'running' ? 'Stop' : 'Start'}
        </button>
      </div>

      {/* Model Mapping */}
      <div style={{ background: 'var(--color-hairline-soft)', borderRadius: 5, padding: '4px 6px', marginBottom: 4 }}>
        <div style={{ fontSize: 8, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>Mapping</div>
        {TIERS.map((t, i) => {
          const route = getRoute(t.tier);
          const models = getModels(t.tier);
          return (
            <div key={t.tier} style={{
              display: 'grid',
              gridTemplateColumns: '6px 28px 1fr 1.15fr',
              alignItems: 'center',
              columnGap: 3,
              marginBottom: i === TIERS.length - 1 ? 0 : 2,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} />
              <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t.label}</span>
              <select value={route?.providerName || ''} onChange={e => updateRoute(t.tier, 'providerName', e.target.value)}>
                <option value="">Prov</option>
                {providers.filter(p => p.enabled).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
              <select value={route?.targetModel || ''} onChange={e => updateRoute(t.tier, 'targetModel', e.target.value)}>
                <option value="">Model</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      {discoveredCount > 0 && (
        <div style={{ fontSize: 9, color: 'var(--color-muted)', marginBottom: 3, paddingLeft: 2 }}>
          {discoveredCount} local provider{discoveredCount !== 1 ? 's' : ''} detected
        </div>
      )}

      <div style={{ display: 'flex', gap: 5 }}>
        <button onClick={() => openUrl('http://localhost:3457')}
          style={{ flex: 1, padding: '3px 0', border: '1px solid var(--color-hairline-strong)', borderRadius: 4, fontSize: 9, fontWeight: 500,
            cursor: 'pointer', background: 'var(--color-surface-card)', color: 'var(--color-ink)' }}>
          Dashboard
        </button>
        <button onClick={() => openUrl('http://localhost:3457/settings')}
          style={{ flex: 1, padding: '3px 0', border: '1px solid var(--color-hairline-strong)', borderRadius: 4, fontSize: 9, fontWeight: 500,
            cursor: 'pointer', background: 'var(--color-surface-card)', color: 'var(--color-ink)' }}>
          Settings
        </button>
      </div>
    </div>
  );
}
