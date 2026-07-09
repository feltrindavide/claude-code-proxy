/**
 * Rolling latency stats per provider/model for smart routing (p50/p95).
 */

const MAX_SAMPLES = 100;

interface SampleRing {
  values: number[];
  index: number;
  count: number;
}

export interface LatencyStats {
  provider: string;
  model: string;
  count: number;
  p50: number;
  p95: number;
  avg: number;
  lastMs: number;
}

function key(provider: string, model: string): string {
  return `${provider}\x1f${model}`;
}

function parseKey(k: string): [string, string] {
  const idx = k.indexOf('\x1f');
  if (idx === -1) {
    const legacy = k.split('::');
    return [legacy[0] ?? '', legacy.slice(1).join('::')];
  }
  return [k.slice(0, idx), k.slice(idx + 1)];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

class LatencyTrackerService {
  private rings = new Map<string, SampleRing>();

  record(provider: string, model: string, latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
    const k = key(provider, model);
    let ring = this.rings.get(k);
    if (!ring) {
      ring = { values: new Array(MAX_SAMPLES).fill(0), index: 0, count: 0 };
      this.rings.set(k, ring);
    }
    ring.values[ring.index] = latencyMs;
    ring.index = (ring.index + 1) % MAX_SAMPLES;
    ring.count = Math.min(ring.count + 1, MAX_SAMPLES);
  }

  getStats(provider: string, model: string): LatencyStats | null {
    const ring = this.rings.get(key(provider, model));
    if (!ring || ring.count === 0) return null;

    const samples = ring.values.slice(0, ring.count).sort((a, b) => a - b);
    const sum = samples.reduce((a, b) => a + b, 0);
    const lastIdx = ring.count < MAX_SAMPLES ? ring.count - 1 : (ring.index - 1 + MAX_SAMPLES) % MAX_SAMPLES;

    return {
      provider,
      model,
      count: ring.count,
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      avg: Math.round(sum / samples.length),
      lastMs: ring.values[lastIdx] ?? 0,
    };
  }

  getAllStats(): LatencyStats[] {
    const out: LatencyStats[] = [];
    for (const k of this.rings.keys()) {
      const [provider, model] = parseKey(k);
      const stats = this.getStats(provider, model);
      if (stats) out.push(stats);
    }
    return out.sort((a, b) => a.provider.localeCompare(b.provider));
  }

  /** Aggregate all samples for global percentile metrics (not average of per-model p50s). */
  getGlobalLatency(): { p50: number; p95: number; avg: number } {
    const allSamples: number[] = [];
    for (const ring of this.rings.values()) {
      const count = ring.count;
      for (let i = 0; i < count; i++) {
        allSamples.push(ring.values[i]);
      }
    }
    if (allSamples.length === 0) {
      return { p50: 0, p95: 0, avg: 0 };
    }
    allSamples.sort((a, b) => a - b);
    const sum = allSamples.reduce((a, b) => a + b, 0);
    return {
      p50: percentile(allSamples, 50),
      p95: percentile(allSamples, 95),
      avg: Math.round(sum / allSamples.length),
    };
  }

  /** Lower score = faster (uses p50, falls back to avg or high default). */
  latencyScore(provider: string, model: string): number {
    const stats = this.getStats(provider, model);
    if (!stats) return 10_000;
    return stats.p50 || stats.avg || 10_000;
  }

  reset(): void {
    this.rings.clear();
  }
}

export const latencyTracker = new LatencyTrackerService();
