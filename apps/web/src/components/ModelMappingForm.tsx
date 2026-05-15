'use client';
import { useEffect, useState } from 'react';
import { fetchRoutes, saveRoutes, fetchProviders } from '@/lib/api';
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
  const [autoCompactThreshold, setAutoCompactThreshold] = useState(0.7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [routesData, providersData, compactData] = await Promise.all([
        fetchRoutes(),
        fetchProviders(),
        fetch('http://localhost:3456/admin/auto-compact').then(r => r.json()).catch(() => ({ threshold: 0.7 })),
      ]);

      const routeList = Array.isArray(routesData) ? routesData : routesData.routes;

      const merged = defaultRoutes.map((defaultRoute) => {
        const existing = routeList.find((r) => r.claudeTier === defaultRoute.claudeTier);
        return existing || defaultRoute;
      });
      setRoutes(merged);
      setProviders(providersData);
      setAutoCompactThreshold(compactData.threshold ?? 0.7);
    } catch {
      // Use defaults on error
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

  function getModelsForProvider(providerName: string): string[] {
    const provider = providers.find(p => p.name === providerName);
    return provider?.models || [];
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        saveRoutes(routes),
        fetch('http://localhost:3456/admin/auto-compact', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threshold: autoCompactThreshold }),
        }),
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
                  <Select
                    value={route.providerName}
                    onChange={(v) => updateRoute(route.claudeTier, 'providerName', v)}
                    placeholder="Select provider..."
                    options={providers.filter(p => p.enabled).map(p => ({ value: p.name, label: p.name }))}
                  />
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

      {/* Auto-compact threshold */}
      <Card title="Auto Compact" className="mt-lg">
        <p className="text-body text-muted mb-md">
          When context usage reaches this percentage, the proxy will suggest compacting
          the conversation to avoid hitting the context limit.
        </p>
        <div className="flex items-center gap-md">
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
