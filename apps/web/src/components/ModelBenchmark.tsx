'use client';

import { useEffect, useState } from 'react';
import { fetchRoutes, runBenchmark, type BenchmarkResult } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Gauge, Loader2 } from 'lucide-react';

const tierLabels: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  fable: 'Fable 5',
};

type Tier = 'opus' | 'sonnet' | 'haiku' | 'fable';

interface RouteMap {
  opus?: { providerName: string; targetModel: string };
  sonnet?: { providerName: string; targetModel: string };
  haiku?: { providerName: string; targetModel: string };
  fable?: { providerName: string; targetModel: string };
}

export function ModelBenchmark() {
  const { toast } = useToast();
  const [running, setRunning] = useState<Tier | null>(null);
  const [results, setResults] = useState<Partial<Record<Tier, BenchmarkResult>>>({});
  const [routes, setRoutes] = useState<RouteMap>({});

  useEffect(() => {
    void fetchRoutes()
      .then(({ routes: list }) => {
        const map: RouteMap = {};
        for (const r of list) {
          map[r.claudeTier] = { providerName: r.providerName, targetModel: r.targetModel };
        }
        setRoutes(map);
      })
      .catch((e) => {
        toast(e instanceof Error ? e.message : 'Failed to load routes', 'error');
      });
  }, [toast]);

  async function handleBenchmark(tier: Tier) {
    const route = routes[tier];
    if (!route?.providerName || !route.targetModel) {
      toast(`Configure ${tierLabels[tier]} mapping first`, 'warning');
      return;
    }

    setRunning(tier);
    try {
      const result = await runBenchmark({
        providerName: route.providerName,
        targetModel: route.targetModel,
        tier,
      });
      setResults((prev) => ({ ...prev, [tier]: result }));
      if (result.success && result.qualityOk) {
        toast(`${tierLabels[tier]}: ${result.latencyMs}ms`, 'success');
      } else {
        toast(`${tierLabels[tier]} benchmark failed`, 'error');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Benchmark failed', 'error');
    } finally {
      setRunning(null);
    }
  }

  async function runAll() {
    for (const tier of ['opus', 'sonnet', 'haiku', 'fable'] as Tier[]) {
      if (routes[tier]?.providerName) {
        await handleBenchmark(tier);
      }
    }
  }

  return (
    <Card className="mb-lg">
      <div className="flex items-start justify-between gap-md mb-md">
        <div>
          <h3 className="font-heading text-[18px] text-ink flex items-center gap-xs">
            <Gauge className="w-4 h-4" />
            Model benchmark
          </h3>
          <p className="text-small text-muted mt-xs">
            Sends a standard probe prompt and measures latency + response quality.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void runAll()} disabled={running !== null}>
          Test all tiers
        </Button>
      </div>

      {(['opus', 'sonnet', 'haiku', 'fable'] as Tier[]).map((tier) => {
        const route = routes[tier];
        const result = results[tier];
        return (
          <div
            key={tier}
            className="flex items-center justify-between py-sm border-t border-hairline first:border-t-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-small font-medium text-ink">{tierLabels[tier]}</p>
              {route?.targetModel ? (
                <p className="text-[11px] text-muted font-mono truncate">
                  {route.providerName}/{route.targetModel}
                </p>
              ) : (
                <p className="text-[11px] text-muted">Not mapped</p>
              )}
              {result && (
                <p className={`text-[11px] mt-0.5 ${result.qualityOk ? 'text-semantic-success' : 'text-semantic-error'}`}>
                  {result.success
                    ? `${result.latencyMs}ms · ${result.qualityOk ? 'OK' : 'quality fail'}`
                    : result.error || 'Failed'}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              className="shrink-0"
              disabled={running !== null || !route?.providerName}
              onClick={() => void handleBenchmark(tier)}
            >
              {running === tier ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test model'}
            </Button>
          </div>
        );
      })}
    </Card>
  );
}
