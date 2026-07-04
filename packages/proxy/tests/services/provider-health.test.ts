/**
 * Provider health probe tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearHealthCache } from '../../src/services/provider-health.js';
import type { LLMProvider } from '../../src/types/index.js';

vi.mock('../../src/services/upstream-http.js', () => ({
  upstreamFetch: vi.fn(),
}));

vi.mock('../../src/services/keychain.js', () => ({
  getKey: vi.fn().mockResolvedValue('test-key'),
}));

vi.mock('../../src/services/circuit-breaker.js', () => ({
  circuitBreakerService: {
    getState: vi.fn().mockReturnValue('closed'),
  },
}));

const provider: LLMProvider = {
  name: 'test-provider',
  baseUrl: 'https://api.example.com',
  keyId: 'test-provider',
  models: ['model-a'],
  enabled: true,
  priority: 1,
};

describe('checkProviderHealth', () => {
  beforeEach(() => {
    clearHealthCache();
    vi.clearAllMocks();
  });

  it('returns healthy on 200 response', async () => {
    const { upstreamFetch } = await import('../../src/services/upstream-http.js');
    vi.mocked(upstreamFetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const { checkProviderHealth } = await import('../../src/services/provider-health.js');
    const result = await checkProviderHealth(provider);
    expect(result.status).toBe('healthy');
    expect(result.providerId).toBe('test-provider');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns cached result within TTL', async () => {
    const { upstreamFetch } = await import('../../src/services/upstream-http.js');
    vi.mocked(upstreamFetch).mockResolvedValue({ ok: true, status: 200 } as Response);

    const { checkProviderHealth } = await import('../../src/services/provider-health.js');
    await checkProviderHealth(provider);
    await checkProviderHealth(provider);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('returns unhealthy on network error', async () => {
    const { upstreamFetch } = await import('../../src/services/upstream-http.js');
    vi.mocked(upstreamFetch).mockRejectedValue(new Error('ECONNRESET'));

    const { checkProviderHealth } = await import('../../src/services/provider-health.js');
    const result = await checkProviderHealth(provider);
    expect(result.status).toBe('unhealthy');
    expect(result.lastError).toContain('ECONNRESET');
  });
});
