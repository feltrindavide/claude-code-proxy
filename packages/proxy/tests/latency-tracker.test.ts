import { describe, it, expect, beforeEach } from 'vitest';
import { latencyTracker } from '../src/services/latency-tracker.js';

describe('latency-tracker', () => {
  beforeEach(() => {
    latencyTracker.reset();
  });

  it('computes p50 and p95 from samples', () => {
    const samples = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    for (const ms of samples) {
      latencyTracker.record('openrouter', 'test-model', ms);
    }

    const stats = latencyTracker.getStats('openrouter', 'test-model');
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(10);
    expect(stats!.p50).toBe(500);
    expect(stats!.p95).toBe(1000);
    expect(stats!.avg).toBe(550);
  });

  it('returns high default score when no data', () => {
    expect(latencyTracker.latencyScore('unknown', 'model')).toBe(10_000);
  });
});
