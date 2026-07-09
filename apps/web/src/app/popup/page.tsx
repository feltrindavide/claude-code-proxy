'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  adminFetch,
  fetchDiscoveryStatus,
  saveRoutes,
  startProxy,
  stopProxy,
} from '@/lib/api';
import { DiscoveryStatusSchema, HealthResponseSchema, ProvidersArraySchema, RoutesResponseSchema } from '@/lib/schemas';
import { getProxyHttpBase } from '@/lib/proxyBase';

const TIERS = [
  { tier: 'opus', label: 'Opus', color: '#ff9f0a' },
  { tier: 'sonnet', label: 'Son', color: '#5ac8fa' },
  { tier: 'haiku', label: 'Hai', color: '#34c759' },
];

interface RouteEntry { claudeTier: string; providerName: string; targetModel: string; }
interface Provider { name: string; models: string[]; enabled: boolean; }

function openUrl(url: string) {
  const tauri = (window as { __TAURI__?: { shell?: { open: (u: string) => void } } }).__TAURI__;
  if (tauri?.shell?.open) tauri.shell.open(url);
  else window.open(url, '_blank');
}

export default function PopupPage() {
  const [status, setStatus] = useState<'running' | 'stopped' | 'loading'>('stopped');
  const [health, setHealth] = useState<{ port?: number } | null>(null);
  const [routes, setRoutes] = useState<RouteEntry[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const healthRes = await fetch(`${getProxyHttpBase()}/health`, { signal: AbortSignal.timeout(3000) });
      if (!healthRes.ok) throw new Error('Proxy not reachable');
      const healthData = HealthResponseSchema.parse(await healthRes.json());

      const [routesData, providersData, discoveryData] = await Promise.all([
        adminFetch(`${getProxyHttpBase()}/admin/routes`, { signal: AbortSignal.timeout(5000) })
          .then(async (r) => {
            if (!r.ok) throw new Error('Failed to load routes');
            return RoutesResponseSchema.parse(await r.json());
          }),
        adminFetch(`${getProxyHttpBase()}/admin/providers`, { signal: AbortSignal.timeout(5000) })
          .then(async (r) => {
            if (!r.ok) throw new Error('Failed to load providers');
            return ProvidersArraySchema.parse(await r.json());
          }),
        fetchDiscoveryStatus().catch(() => DiscoveryStatusSchema.parse({ providers: [] })),
      ]);

      setHealth(healthData);
      setStatus('running');
      setRoutes(routesData.routes);
      setProviders(providersData);
      setDiscoveredCount(discoveryData.providers.filter((p) => p.reachable).length);
      setError(null);
    } catch (err) {
      setStatus('stopped');
      setHealth(null);
      setError(err instanceof Error ? err.message : 'Proxy offline');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function updateRoute(tier: string, field: 'providerName' | 'targetModel', value: string) {
    const nr = routes.map((r) => (r.claudeTier === tier ? { ...r, [field]: value } : r));
    if (!nr.find((r) => r.claudeTier === tier)) {
      nr.push({ claudeTier: tier, providerName: '', targetModel: '' });
    }
    try {
      await saveRoutes(nr.filter((r) => r.providerName && r.targetModel));
      setRoutes(nr);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save route');
    }
  }

  async function toggleProxy() {
    setStatus('loading');
    try {
      if (status === 'running') await stopProxy();
      else await startProxy();
      setTimeout(() => void refresh(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proxy control failed');
      setStatus('stopped');
    }
  }

  const getRoute = (t: string) => routes.find((r) => r.claudeTier === t);
  const getModels = (t: string) => providers.find((p) => p.name === getRoute(t)?.providerName)?.models || [];

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

      {error && (
        <div role="alert" style={{ fontSize: 9, color: 'var(--color-semantic-error)', marginBottom: 4 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <div style={{ width: 16, height: 16, borderRadius: 3, background: '#f54e00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9, color: 'white', flexShrink: 0 }} aria-hidden="true">C</div>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ClaudeCode Proxy</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-muted)', flexShrink: 0 }} aria-live="polite">{statusLabel}</span>
        <button
          type="button"
          onClick={() => void toggleProxy()}
          aria-label={status === 'running' ? 'Stop proxy' : 'Start proxy'}
          style={{ padding: '2px 8px', border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 600, flexShrink: 0,
            cursor: 'pointer', background: status === 'running' ? 'rgba(207,45,86,0.12)' : 'var(--color-primary)',
            color: status === 'running' ? 'var(--color-semantic-error)' : 'var(--color-on-primary)' }}>
          {status === 'loading' ? '…' : status === 'running' ? 'Stop' : 'Start'}
        </button>
      </div>

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
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t.label}</span>
              <select
                value={route?.providerName || ''}
                onChange={(e) => void updateRoute(t.tier, 'providerName', e.target.value)}
                aria-label={`${t.label} provider`}
              >
                <option value="">Prov</option>
                {providers.filter((p) => p.enabled).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
              <select
                value={route?.targetModel || ''}
                onChange={(e) => void updateRoute(t.tier, 'targetModel', e.target.value)}
                aria-label={`${t.label} model`}
              >
                <option value="">Model</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
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
        <button type="button" onClick={() => openUrl('http://localhost:3457')}
          aria-label="Open dashboard"
          style={{ flex: 1, padding: '3px 0', border: '1px solid var(--color-hairline-strong)', borderRadius: 4, fontSize: 9, fontWeight: 500,
            cursor: 'pointer', background: 'var(--color-surface-card)', color: 'var(--color-ink)' }}>
          Dashboard
        </button>
        <button type="button" onClick={() => openUrl('http://localhost:3457/settings')}
          aria-label="Open settings"
          style={{ flex: 1, padding: '3px 0', border: '1px solid var(--color-hairline-strong)', borderRadius: 4, fontSize: 9, fontWeight: 500,
            cursor: 'pointer', background: 'var(--color-surface-card)', color: 'var(--color-ink)' }}>
          Settings
        </button>
      </div>
    </div>
  );
}
