/**
 * RetryHandler tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchWithRetry, isTransientError, AbortError } from '../../src/services/retryHandler.js';

vi.mock('../../src/services/requestLog.js', () => ({
  requestLogService: { enrichEntry: vi.fn(), enrichLastEntry: vi.fn() },
}));

vi.mock('../../src/services/circuit-breaker.js', () => ({
  circuitBreakerService: {
    canRequest: vi.fn(() => true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    getState: vi.fn(() => 'closed'),
  },
}));

vi.mock('../../src/metrics/prometheus.js', () => ({
  recordCircuitState: vi.fn(),
}));

import { requestLogService } from '../../src/services/requestLog.js';

describe('isTransientError', () => {
  it('returns true for TypeError (network error)', () => {
    expect(isTransientError(new TypeError('network error'))).toBe(true);
  });

  it('returns true for ECONNRESET', () => {
    expect(isTransientError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('returns true for ETIMEDOUT', () => {
    expect(isTransientError(new Error('connect ETIMEDOUT'))).toBe(true);
  });

  it('returns false for AbortError', () => {
    expect(isTransientError(new AbortError('client error'))).toBe(false);
  });

  it('returns false for non-Error objects', () => {
    expect(isTransientError('string error')).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });

  it('returns false for 4xx errors', () => {
    expect(isTransientError(new AbortError('Provider returned 400'))).toBe(false);
  });
});

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on 5xx errors', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response('error', { status: 500 });
      }
      return new Response('ok', { status: 200 });
    });

    const response = await fetchWithRetry('test-provider', fn);
    expect(response.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 4xx errors (AbortError)', async () => {
    const fn = vi.fn(async () => new Response('unauthorized', { status: 401 }));

    await expect(fetchWithRetry('test-provider', fn)).rejects.toSatisfy(
      (err: unknown) => err instanceof AbortError || (err instanceof Error && err.message.includes('401')),
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('logs retryCount on retry', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response('error', { status: 502 });
      return new Response('ok', { status: 200 });
    });

    await fetchWithRetry('test-provider', fn, { requestId: 'req-1' });
    expect(requestLogService.enrichEntry).toHaveBeenCalledWith('req-1', { retryCount: 1 });
  });

  it('respects max 2 retries', async () => {
    const fn = vi.fn(async () => new Response('error', { status: 503 }));

    await expect(fetchWithRetry('test-provider', fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses 1s then 2s backoff delays', async () => {
    vi.useFakeTimers();
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      if (typeof ms === 'number' && ms >= 1000) delays.push(ms);
      return originalSetTimeout(fn, 0, ...args);
    }) as typeof setTimeout);

    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) return new Response('error', { status: 500 });
      return new Response('ok', { status: 200 });
    });

    const promise = fetchWithRetry('test-provider', fn);
    await vi.runAllTimersAsync();
    await promise;

    expect(delays).toContain(1000);
    expect(delays).toContain(2000);
  });
});
