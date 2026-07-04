'use client';

import { useEffect, useState } from 'react';
import { fetchConfig, saveRoutingPrefs, saveExperiments, fetchProviders } from '@/lib/api';
import type { RouteExperiment } from '@anthropic-claude-code/shared';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/Toast';

const PRESETS = [
  { id: 'economy', label: 'Economy', preferLowCost: true, preferLowLatency: false },
  { id: 'speed', label: 'Speed', preferLowCost: false, preferLowLatency: true },
  { id: 'balanced', label: 'Balanced', preferLowCost: false, preferLowLatency: false },
] as const;

const emptyExperiment = (): RouteExperiment => ({
  id: `exp-${Date.now()}`,
  tier: 'sonnet',
  enabled: true,
  stickyKey: 'session',
  variants: [
    { name: 'a', weight: 50, providerName: '', targetModel: '' },
    { name: 'b', weight: 50, providerName: '', targetModel: '' },
  ],
});

export function RoutingExperiments() {
  const { toast } = useToast();
  const [preferLowCost, setPreferLowCost] = useState(false);
  const [preferLowLatency, setPreferLowLatency] = useState(false);
  const [experiments, setExperiments] = useState<RouteExperiment[]>([]);
  const [providers, setProviders] = useState<Array<{ name: string; models: string[] }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([fetchConfig(), fetchProviders()]).then(([cfg, provs]) => {
      setPreferLowCost(cfg.routing?.preferLowCost ?? false);
      setPreferLowLatency(cfg.routing?.preferLowLatency ?? false);
      setExperiments((cfg.experiments as RouteExperiment[] | undefined) ?? []);
      setProviders(provs.filter((p) => p.enabled).map((p) => ({ name: p.name, models: p.models })));
    });
  }, []);

  async function applyPreset(preset: (typeof PRESETS)[number]) {
    setPreferLowCost(preset.preferLowCost);
    setPreferLowLatency(preset.preferLowLatency);
  }

  async function handleSavePrefs() {
    setSaving(true);
    try {
      await saveRoutingPrefs({ preferLowCost, preferLowLatency });
      toast('Routing preferences saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveExperiments() {
    setSaving(true);
    try {
      await saveExperiments(experiments);
      toast('Experiments saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateExperiment(index: number, patch: Partial<RouteExperiment>) {
    setExperiments((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  return (
    <Card className="mb-lg" title="Smart routing">
      <p className="text-sm text-muted mb-md">Presets control candidate ordering in the smart router.</p>
      <div className="flex flex-wrap gap-2 mb-md">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void applyPreset(p)}
            className="px-3 py-1 text-sm rounded-md border border-hairline hover:bg-canvas-soft"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="space-y-2 mb-md">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={preferLowCost} onChange={(e) => setPreferLowCost(e.target.checked)} />
          Prefer low cost
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={preferLowLatency} onChange={(e) => setPreferLowLatency(e.target.checked)} />
          Prefer low latency
        </label>
      </div>
      <Button variant="secondary" onClick={handleSavePrefs} loading={saving} className="mb-lg">
        Save routing preferences
      </Button>

      <div className="border-t border-hairline pt-md">
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-sm font-medium text-ink">A/B experiments</h3>
          <Button variant="secondary" onClick={() => setExperiments((e) => [...e, emptyExperiment()])}>
            Add experiment
          </Button>
        </div>

        {experiments.length === 0 ? (
          <p className="text-sm text-muted">No experiments configured.</p>
        ) : (
          <div className="space-y-md">
            {experiments.map((exp, idx) => (
              <div key={exp.id} className="border border-hairline rounded-md p-md space-y-sm">
                <div className="grid grid-cols-2 gap-sm">
                  <Input label="ID" value={exp.id} onChange={(e) => updateExperiment(idx, { id: e.target.value })} />
                  <Select
                    value={exp.tier}
                    onChange={(v) => updateExperiment(idx, { tier: v as RouteExperiment['tier'] })}
                    options={[
                      { value: 'opus', label: 'Opus' },
                      { value: 'sonnet', label: 'Sonnet' },
                      { value: 'haiku', label: 'Haiku' },
                    ]}
                  />
                </div>
                <Select
                  value={exp.stickyKey || 'session'}
                  onChange={(v) => updateExperiment(idx, { stickyKey: v as 'session' | 'user' })}
                  options={[
                    { value: 'session', label: 'Sticky: session' },
                    { value: 'user', label: 'Sticky: user' },
                  ]}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exp.enabled}
                    onChange={(e) => updateExperiment(idx, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                {exp.variants.map((v, vIdx) => (
                  <div key={v.name} className="grid grid-cols-4 gap-2 items-end">
                    <Input label="Variant" value={v.name} onChange={(e) => {
                      const variants = [...exp.variants];
                      variants[vIdx] = { ...v, name: e.target.value };
                      updateExperiment(idx, { variants });
                    }} />
                    <Input label="Weight" type="number" value={String(v.weight)} onChange={(e) => {
                      const variants = [...exp.variants];
                      variants[vIdx] = { ...v, weight: parseInt(e.target.value, 10) || 0 };
                      updateExperiment(idx, { variants });
                    }} />
                    <Select
                      value={v.providerName}
                      onChange={(pv) => {
                        const prov = providers.find((p) => p.name === pv);
                        const variants = [...exp.variants];
                        variants[vIdx] = { ...v, providerName: pv, targetModel: prov?.models[0] || '' };
                        updateExperiment(idx, { variants });
                      }}
                      options={providers.map((p) => ({ value: p.name, label: p.name }))}
                    />
                    <Select
                      value={v.targetModel}
                      onChange={(mv) => {
                        const variants = [...exp.variants];
                        variants[vIdx] = { ...v, targetModel: mv };
                        updateExperiment(idx, { variants });
                      }}
                      options={(providers.find((p) => p.name === v.providerName)?.models || []).map((m) => ({ value: m, label: m }))}
                    />
                  </div>
                ))}
                <Button variant="ghost" onClick={() => setExperiments((all) => all.filter((_, i) => i !== idx))}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {experiments.length > 0 && (
          <Button variant="primary" className="mt-md" onClick={handleSaveExperiments} loading={saving}>
            Save experiments
          </Button>
        )}
      </div>
    </Card>
  );
}
