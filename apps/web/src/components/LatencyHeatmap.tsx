'use client';

import { useEffect, useState } from 'react';
import { fetchRoutingStats, type LatencyStat } from '@/lib/api';
import { Card } from '@/components/ui/Card';

export function LatencyHeatmap() {
  const [stats, setStats] = useState<LatencyStat[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchRoutingStats()
      .then((data) => setStats(data.latency))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load latency'));
  }, []);

  if (error) {
    return (
      <Card className="mb-lg" title="Latency heatmap">
        <p className="text-sm text-semantic-error">{error}</p>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card className="mb-lg" title="Latency heatmap">
        <p className="text-sm text-muted">No latency samples yet — run a few requests first.</p>
      </Card>
    );
  }

  const maxP95 = Math.max(...stats.map((s) => s.p95), 1);

  return (
    <Card className="mb-lg" title="Latency heatmap">
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={`${s.provider}:${s.model}`} className="flex items-center gap-3 text-sm">
            <span className="w-40 truncate font-mono text-muted">{s.provider}</span>
            <span className="flex-1 truncate font-mono">{s.model}</span>
            <div className="w-24 h-2 bg-canvas-soft rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, (s.p95 / maxP95) * 100)}%` }}
              />
            </div>
            <span className="w-16 text-right font-mono text-muted">{s.p95}ms</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
