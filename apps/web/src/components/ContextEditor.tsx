'use client';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface ModelEntry {
  id: string;
  provider: string;
  context: number;
  max_output: number;
}

interface ClaudeEntry {
  key: string;
  context: number;
}

export function ContextEditor() {
  const { toast } = useToast();
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [claudeTiers, setClaudeTiers] = useState<ClaudeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Fetch routes per sapere quali modelli sono mappati
      const [ctxResp, routesResp] = await Promise.all([
        fetch('http://localhost:3456/admin/context'),
        fetch('http://localhost:3456/admin/routes'),
      ]);
      const ctx = await ctxResp.json();
      const routes = await routesResp.json();

      // Modelli mappati dalle route
      const routeModels = new Set<string>();
      const routeList = Array.isArray(routes) ? routes : (routes.routes || []);
      for (const r of routeList) {
        if (r.targetModel) routeModels.add(r.targetModel);
      }

      // Filtra solo i modelli presenti nelle route
      const mapped = (ctx.config.models || []).filter(
        (m: ModelEntry) => routeModels.has(m.id)
      );
      setModels(mapped);

      // Tier Claude (opus, sonnet, haiku)
      const claude = ctx.config.claude || {};
      setClaudeTiers([
        { key: 'opus', context: claude.opus || 1000000 },
        { key: 'sonnet', context: claude.sonnet || 1000000 },
        { key: 'haiku', context: claude.haiku || 200000 },
      ]);
    } catch {
      toast('Failed to load context', 'error');
    } finally {
      setLoading(false);
    }
  }

  function updateModel(idx: number, field: keyof ModelEntry, value: string) {
    const updated = [...models];
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      (updated[idx] as any)[field] = parsed;
    }
    setModels(updated);
    setDirty(true);
  }

  function updateClaude(idx: number, value: string) {
    const updated = [...claudeTiers];
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      updated[idx] = { ...updated[idx], context: parsed };
    }
    setClaudeTiers(updated);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('http://localhost:3456/admin/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models, claude: Object.fromEntries(claudeTiers.map(t => [t.key, t.context])) }),
      });
      setDirty(false);
      toast('Context settings saved', 'success');
    } catch {
      toast('Failed to save context settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-body">Loading model context...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-lg">
        <h2 className="font-display text-[22px] text-ink">Model Context</h2>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!dirty}>
          Save Changes
        </Button>
      </div>

      {/* Claude official tiers */}
      <Card title="Claude Official (reference)">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline">
                <th className="py-sm pr-md text-small text-muted font-medium">Tier</th>
                <th className="py-sm text-small text-muted font-medium">Context (tokens)</th>
              </tr>
            </thead>
            <tbody>
              {claudeTiers.map((t, i) => (
                <tr key={t.key} className="border-b border-hairline last:border-0">
                  <td className="py-sm pr-md">
                    <span className="font-mono text-sm text-ink capitalize">{t.key}</span>
                  </td>
                  <td className="py-sm">
                    <input
                      type="number"
                      value={t.context}
                      onChange={(e) => updateClaude(i, e.target.value)}
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

      {/* Mapped models */}
      <Card title="Mapped Models" className="mt-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline">
                <th className="py-sm pr-md text-small text-muted font-medium">Model</th>
                <th className="py-sm pr-md text-small text-muted font-medium">Provider</th>
                <th className="py-sm pr-md text-small text-muted font-medium">Context (tokens)</th>
                <th className="py-sm text-small text-muted font-medium">Max Output</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={`${m.provider}:${m.id}`} className="border-b border-hairline last:border-0">
                  <td className="py-sm pr-md">
                    <span className="font-mono text-sm text-ink">{m.id}</span>
                  </td>
                  <td className="py-sm pr-md">
                    <span className="text-small text-muted">{m.provider}</span>
                  </td>
                  <td className="py-sm pr-md">
                    <input
                      type="number"
                      value={m.context}
                      onChange={(e) => updateModel(i, 'context', e.target.value)}
                      className="w-32 bg-surface-card text-ink border border-hairline rounded-md text-sm focus-ring h-8 px-2"
                      min={1024}
                      step={1024}
                    />
                  </td>
                  <td className="py-sm">
                    <input
                      type="number"
                      value={m.max_output}
                      onChange={(e) => updateModel(i, 'max_output', e.target.value)}
                      className="w-28 bg-surface-card text-ink border border-hairline rounded-md text-sm focus-ring h-8 px-2"
                      min={256}
                      step={256}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {models.length === 0 && (
          <p className="text-body py-lg text-center">No models in mapping. Go to Model Mapping first.</p>
        )}
      </Card>

      <div className="mt-md text-small text-muted space-y-xs">
        <p><strong>Context</strong>: limite di input del modello (es. DeepSeek = 131.072)</p>
        <p><strong>Max Output</strong>: limite di output tokens per richiesta (es. DeepSeek = 8.192)</p>
        <p><strong>Claude Official</strong>: contesto dei tier Claude ufficiali (riferimento per inflation)</p>
      </div>
    </div>
  );
}
