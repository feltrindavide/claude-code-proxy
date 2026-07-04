import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/config.js', () => ({
  configService: {
    load: vi.fn(() => ({
      providers: [],
      routes: [],
      aliases: {
        fast: 'claude-haiku-4-20250514',
        smart: 'claude-opus-4-20250514',
      },
    })),
  },
}));

vi.mock('../src/services/provider.js', () => ({
  providerService: {
    resolveModelRoute: vi.fn((model: string) => {
      if (model.startsWith('claude-haiku')) {
        return {
          provider: { name: 'p', baseUrl: 'http://x', keyId: 'p', models: [], enabled: true, priority: 1 },
          targetModel: 'haiku-model',
          originalModel: model,
          claudeTier: 'haiku',
        };
      }
      return null;
    }),
    resolveCustomModel: vi.fn(() => null),
    getProvider: vi.fn(),
    getRoutes: vi.fn(() => []),
  },
}));

vi.mock('../src/services/circuit-breaker.js', () => ({
  circuitBreakerService: { canRequest: () => true },
}));

vi.mock('../src/services/smart-router.js', () => ({
  buildSmartRoute: (_model: string, primary: unknown) => ({ candidates: [primary] }),
}));

import { resolveRequest } from '../src/services/route-resolver.js';

describe('route-resolver aliases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves alias fast to configured model', () => {
    const result = resolveRequest({ model: 'fast', messages: [] });
    expect(result.modelName).toBe('claude-haiku-4-20250514');
  });
});
