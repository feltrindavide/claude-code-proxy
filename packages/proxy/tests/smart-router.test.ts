import { describe, it, expect } from 'vitest';
import { inferCostTier, pickExperimentVariant, sortCandidates } from '../src/services/smart-router.js';
import { latencyTracker } from '../src/services/latency-tracker.js';
import type { RouteExperiment, RouteResolution } from '../src/types/index.js';

describe('smart-router', () => {
  it('infers free cost tier from model id', () => {
    expect(inferCostTier('nvidia/nemotron:free')).toBe('free');
    expect(inferCostTier('some/model/free')).toBe('free');
  });

  it('respects explicit cost tier', () => {
    expect(inferCostTier('any-model', 'premium')).toBe('premium');
  });

  it('picks sticky experiment variant deterministically', () => {
    const experiment: RouteExperiment = {
      id: 'exp-1',
      tier: 'sonnet',
      enabled: true,
      variants: [
        { name: 'a', weight: 50, providerName: 'p1', targetModel: 'm1' },
        { name: 'b', weight: 50, providerName: 'p2', targetModel: 'm2' },
      ],
    };

    const first = pickExperimentVariant(experiment, 'session-abc');
    const second = pickExperimentVariant(experiment, 'session-abc');
    expect(first).not.toBeNull();
    expect(second?.name).toBe(first?.name);
  });

  it('sortCandidates prefers lower latency when preferLowLatency is set', () => {
    latencyTracker.record('fast-provider', 'fast-model', 80);
    latencyTracker.record('slow-provider', 'slow-model', 4000);

    const mk = (name: string, model: string): RouteResolution => ({
      provider: {
        name,
        baseUrl: 'https://example.com',
        keyId: name,
        models: [model],
        enabled: true,
        priority: 1,
      },
      targetModel: model,
      originalModel: 'claude-sonnet-4-20250514',
    });

    const sorted = sortCandidates(
      [mk('slow-provider', 'slow-model'), mk('fast-provider', 'fast-model')],
      'sonnet',
      { preferLowLatency: true },
    );

    expect(sorted[0].provider.name).toBe('fast-provider');
  });
});
