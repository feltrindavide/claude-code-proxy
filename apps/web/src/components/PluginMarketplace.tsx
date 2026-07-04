'use client';

import { useEffect, useState } from 'react';
import { fetchPluginStatus, installPlugin } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/Toast';

export function PluginMarketplace() {
  const { toast } = useToast();
  const [plugins, setPlugins] = useState<Array<{ id: string; installed: boolean; path?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchPluginStatus()
      .then(setPlugins)
      .catch(() => setPlugins([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleInstall(id: string) {
    try {
      await installPlugin(id);
      toast(`Installed ${id}`, 'success');
      const next = await fetchPluginStatus();
      setPlugins(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Install failed', 'error');
    }
  }

  return (
    <Card title="Plugin marketplace">
      {loading ? (
        <p className="text-sm text-muted">Loading plugins…</p>
      ) : plugins.length === 0 ? (
        <p className="text-sm text-muted">No plugins available.</p>
      ) : (
        <ul className="space-y-2">
          {plugins.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="font-mono">{p.id}</span>
              {p.installed ? (
                <span className="text-semantic-success">Installed</span>
              ) : (
                <Button variant="secondary" onClick={() => void handleInstall(p.id)}>
                  Install
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
