'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  fetchConfig,
  fetchContextConfig,
  saveContextConfig,
  type ContextModelEntry,
} from '@/lib/api';

export function ContextEditor() {
  const { toast } = useToast();
  const [models, setModels] = useState<ContextModelEntry[]>([]);
  const [claudeTiers, setClaudeTiers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      const [ctx, configData] = await Promise.all([
        fetchContextConfig(),
        fetchConfig(),
      ]);

      const knownModels = new Set<string>();
      for (const p of configData.providers || []) {
        if (!p.models) continue;
        for (const mId of p.models) {
          knownModels.add(`${p.name}:${mId}`);
        }
      }

      const filtered = (ctx.config.models || []).filter(
        (m) => knownModels.has(`${m.provider}:${m.id}`),
      );
      setModels(filtered);
      setClaudeTiers(ctx.config.claude || {});
    } catch {
      toast('Failed to load context', 'error');
    } finally {
      setLoading(false);
    }
  }

  function updateModel(idx: number, field: 'context' | 'max_output', value: string) {
    const updated = [...models];
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      updated[idx] = { ...updated[idx], [field]: parsed };
    }
    setModels(updated);
    setDirty(true);
  }

  function updateClaude(tier: string, value: string) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setClaudeTiers((prev) => ({ ...prev, [tier]: parsed }));
      setDirty(true);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveContextConfig({ models, claude: claudeTiers });
      setDirty(false);
      toast('Context settings saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save context settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  const groupedModels = useMemo(() => {
    const groups: Record<string, ContextModelEntry[]> = {};
    for (const m of models) {
      if (!groups[m.provider]) groups[m.provider] = [];
      groups[m.provider].push(m);
    }
    return groups;
  }, [models]);

  if (loading) {
    return <p className="text-body">Loading model context...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-lg">
      <Card title="Claude Official (reference)">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline">
                <th className="py-3 pr-4 text-sm text-muted font-medium">Tier</th>
                <th className="py-3 text-sm text-muted font-medium">Context (tokens)</th>
              </tr>
            </thead>
            <tbody>
              {['opus', 'sonnet', 'haiku', 'fable'].map((tier) => (
                <tr key={tier} className="border-b border-hairline last:border-b-0">
                  <td className="py-3 pr-4">
                    <span className="font-mono text-sm text-ink capitalize">{tier}</span>
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={claudeTiers[tier] ?? 200000}
                      onChange={(e) => updateClaude(tier, e.target.value)}
                      className="w-32 bg-surface-card text-ink border border-hairline rounded-md text-sm focus-ring h-8 px-2"
                      min={8192}
                      step={1024}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Model Library Context">
        {models.length === 0 ? (
          <p className="text-body py-6 text-center">No models in library. Go to Models page first.</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
              <div key={provider}>
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">
                  {provider}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-hairline">
                        <th className="py-3 pr-4 text-sm text-muted font-medium">Model</th>
                        <th className="py-3 pr-4 text-sm text-muted font-medium">Context (tokens)</th>
                        <th className="py-3 text-sm text-muted font-medium">Max Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerModels.map((m) => {
                        const globalIdx = models.findIndex(
                          (mm) => mm.provider === m.provider && mm.id === m.id,
                        );
                        return (
                          <tr
                            key={`${m.provider}:${m.id}`}
                            className="border-b border-hairline last:border-b-0"
                          >
                            <td className="py-3 pr-4">
                              <span className="font-mono text-sm text-ink">{m.id}</span>
                            </td>
                            <td className="py-3 pr-4">
                              <input
                                type="number"
                                value={m.context}
                                onChange={(e) => updateModel(globalIdx, 'context', e.target.value)}
                                className="w-32 bg-surface-card text-ink border border-hairline rounded-md text-sm focus-ring h-8 px-2"
                                min={1024}
                                step={1024}
                              />
                            </td>
                            <td className="py-3">
                              <input
                                type="number"
                                value={m.max_output}
                                onChange={(e) => updateModel(globalIdx, 'max_output', e.target.value)}
                                className="w-28 bg-surface-card text-ink border border-hairline rounded-md text-sm focus-ring h-8 px-2"
                                min={256}
                                step={256}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!dirty}>
          Save Changes
        </Button>
      </div>

      <div className="text-sm text-muted space-y-1">
        <p><strong>Context</strong>: limite di input del modello (es. DeepSeek = 131.072)</p>
        <p><strong>Max Output</strong>: limite di output tokens per richiesta (es. DeepSeek = 8.192)</p>
        <p><strong>Claude Official</strong>: contesto dei tier Claude ufficiali (riferimento per inflation)</p>
      </div>
    </div>
  );
}
