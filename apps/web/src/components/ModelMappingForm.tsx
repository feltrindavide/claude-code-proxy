'use client';
import { useEffect, useState } from 'react';
import { fetchRoutes, saveRoutes, fetchProviders, fetchAutoCompactThreshold, saveAutoCompactThreshold, fetchAllProviderHealth, type ProviderHealthResult } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Save } from 'lucide-react';

interface Provider {
  name: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  priority: number;
  providerType?: string;
}

interface RouteEntry {
  claudeTier: 'opus' | 'sonnet' | 'haiku';
  providerName: string;
  targetModel: string;
}

const tierLabels: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

const defaultRoutes: RouteEntry[] = [
  { claudeTier: 'opus', providerName: '', targetModel: '' },
  { claudeTier: 'sonnet', providerName: '', targetModel: '' },
  { claudeTier: 'haiku', providerName: '', targetModel: '' },
];

export function ModelMappingForm() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState<RouteEntry[]>(defaultRoutes);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [subagentModel, setSubagentModel] = useState('');
  const [autoCompactThreshold, setAutoCompactThreshold] = useState(0.7);
  const [autoCompactMode, setAutoCompactMode] = useState<'suggest' | 'trigger'>('suggest');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [providerHealth, setProviderHealth] = useState<Record<string, ProviderHealthResult>>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    void fetchAllProviderHealth()
      .then((data) => {
        const map: Record<string, ProviderHealthResult> = {};
        for (const p of data.providers) map[p.providerId] = p;
        setProviderHealth(map);
      })
      .catch(() => {});
  }, [providers]);

  async function loadData() {
    try {
      setLoadError(null);
      const [routesData, providersData, compactData] = await Promise.all([
        fetchRoutes(),
        fetchProviders(),
        fetchAutoCompactThreshold().catch(() => ({ threshold: 0.7, mode: 'suggest' as const })),
      ]);

      const routeList = routesData.routes ?? [];

      const merged = defaultRoutes.map((defaultRoute) => {
        const existing = routeList.find((r) => r.claudeTier === defaultRoute.claudeTier);
        return existing || defaultRoute;
      });
      setRoutes(merged);
      setProviders(providersData);
      setSubagentModel(routesData.subagentModel || '');
      setAutoCompactThreshold(compactData.threshold ?? 0.7);
      setAutoCompactMode(compactData.mode ?? 'suggest');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load routes';
      setLoadError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  function updateRoute(claudeTier: string, field: 'providerName' | 'targetModel', value: string) {
    setRoutes((prev) =>
      prev.map((r) => {
        if (r.claudeTier === claudeTier) {
          const updated = { ...r, [field]: value };
          if (field === 'providerName') {
            const provider = providers.find(p => p.name === value);
            updated.targetModel = provider?.models[0] || '';
          }
          return updated;
        }
        return r;
      })
    );
  }

  function healthBadge(providerName: string) {
    if (!providerName) return null;
    const h = providerHealth[providerName];
    if (!h) return null;
    const colors = {
      healthy: 'bg-semantic-success/15 text-semantic-success',
      degraded: 'bg-yellow-500/15 text-yellow-700',
      unhealthy: 'bg-semantic-error/15 text-semantic-error',
    };
    const label = h.circuitState === 'open' ? 'circuit open' : h.status;
    return (
      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${colors[h.status]}`}>
        {label}
      </span>
    );
  }

  function getModelsForProvider(providerName: string): string[] {
    const provider = providers.find(p => p.name === providerName);
    return provider?.models || [];
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        saveRoutes(routes, subagentModel || undefined),
        saveAutoCompactThreshold(autoCompactThreshold, autoCompactMode),
      ]);
      toast('Settings saved', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-body">Loading mappings...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="font-display text-[22px] text-ink mb-lg">Model Mapping</h2>
      <p className="text-body text-muted mb-lg">
        Map Claude tiers to providers and models. Models come from the <a href="/models" className="text-primary hover:underline">Model Library</a>.
      </p>

      {/* Tier mappings */}
      <div className="space-y-md">
        {routes.map((route) => {
          const availableModels = getModelsForProvider(route.providerName);
          return (
            <Card key={route.claudeTier}>
              <div className="flex items-center gap-lg">
                <div className="w-24">
                  <p className="font-heading text-[18px] font-semibold text-ink">
                    {tierLabels[route.claudeTier]}
                  </p>
                </div>

                <div className="flex-1 space-y-xs">
                  <label className="block text-small text-muted">Provider</label>
                  <div className="flex items-center">
                    <Select
                      value={route.providerName}
                      onChange={(v) => updateRoute(route.claudeTier, 'providerName', v)}
                      placeholder="Select provider..."
                      options={providers.filter(p => p.enabled).map(p => ({ value: p.name, label: p.name }))}
                    />
                    {healthBadge(route.providerName)}
                  </div>
                </div>

                <div className="flex-1 space-y-xs">
                  <label className="block text-small text-muted">Model</label>
                  {availableModels.length > 0 ? (
                    <Select
                      value={route.targetModel}
                      onChange={(v) => updateRoute(route.claudeTier, 'targetModel', v)}
                      placeholder="Select model..."
                      options={availableModels.map(m => ({ value: m, label: m }))}
                    />
                  ) : (
                    <div className="w-full bg-surface-card text-muted border border-hairline rounded-md text-body h-11 px-4 font-mono text-small flex items-center">
                      {route.providerName ? 'Add models in Model Library' : 'Select a provider first'}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Subagent model override */}
      <Card title="Subagent Model" className="mt-lg">
        <p className="text-body text-muted mb-md">
          Optional model for subagent/Task requests. Applied when the system prompt indicates a subagent invocation.
        </p>
        <Select
          value={
            subagentModel
              ? providers.flatMap((p) =>
                  p.models.map((m) => ({ key: `${p.name}:${m}`, model: m })),
                ).find((o) => o.model === subagentModel)?.key ?? subagentModel
              : ''
          }
          onChange={(v) => {
            if (!v) {
              setSubagentModel('');
              return;
            }
            const idx = v.indexOf(':');
            setSubagentModel(idx >= 0 ? v.slice(idx + 1) : v);
          }}
          placeholder="Same as tier routing (default)"
          options={[
            { value: '', label: '— Use tier routing —' },
            ...providers.flatMap((p) =>
              p.models.map((m) => ({ value: `${p.name}:${m}`, label: `${p.name}: ${m}` })),
            ),
          ]}
        />
      </Card>

      {/* Auto-compact threshold */}
      <Card title="Auto Compact" className="mt-lg">
        <p className="text-body text-muted mb-md">
          When context usage reaches this percentage, the proxy hook will suggest or trigger
          <code className="font-mono text-small mx-1">/compact</code> via PostToolUse.
        </p>
        <div className="flex items-center gap-md mb-md">
          <input
            type="range"
            min={0.3}
            max={0.95}
            step={0.05}
            value={autoCompactThreshold}
            onChange={(e) => setAutoCompactThreshold(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-hairline rounded-full appearance-none cursor-pointer accent-primary"
          />
          <span className="font-mono text-sm text-ink w-16 text-right">
            {Math.round(autoCompactThreshold * 100)}%
          </span>
        </div>
        <div className="flex gap-sm">
          <button
            type="button"
            onClick={() => setAutoCompactMode('suggest')}
            className={`flex-1 rounded-md border px-md py-sm text-small transition-colors ${
              autoCompactMode === 'suggest'
                ? 'border-primary bg-primary/10 text-ink font-medium'
                : 'border-hairline text-muted hover:bg-canvas-soft'
            }`}
          >
            Suggest
            <span className="block text-[11px] font-normal mt-0.5 opacity-80">
              Injects context hint
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAutoCompactMode('trigger')}
            className={`flex-1 rounded-md border px-md py-sm text-small transition-colors ${
              autoCompactMode === 'trigger'
                ? 'border-primary bg-primary/10 text-ink font-medium'
                : 'border-hairline text-muted hover:bg-canvas-soft'
            }`}
          >
            Trigger
            <span className="block text-[11px] font-normal mt-0.5 opacity-80">
              Blocks until /compact (5m cooldown)
            </span>
          </button>
        </div>
      </Card>

      <div className="mt-lg">
        <Button
          variant="primary"
          onClick={handleSave}
          loading={saving}
          loadingText="Saving..."
        >
          <Save className="w-4 h-4 mr-xs" />
          Save Mappings
        </Button>
      </div>
    </div>
  );
}
