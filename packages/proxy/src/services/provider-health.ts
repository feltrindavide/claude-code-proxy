/**
 * Provider health probes with short-lived cache.
 */

import { upstreamFetch } from './upstream-http.js';
import { circuitBreakerService, type CircuitState } from './circuit-breaker.js';
import { getKey } from './keychain.js';
import type { LLMProvider } from '../types/index.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ProviderHealthResult {
  providerId: string;
  status: HealthStatus;
  latencyMs: number | null;
  lastError: string | null;
  circuitState: CircuitState;
  checkedAt: string;
}

interface CachedHealth {
  result: ProviderHealthResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CachedHealth>();

export async function checkProviderHealth(provider: LLMProvider): Promise<ProviderHealthResult> {
  const cached = cache.get(provider.name);
  if (cached && Date.now() < cached.expiresAt) {
    return {
      ...cached.result,
      circuitState: circuitBreakerService.getState(provider.name),
    };
  }

  const circuitState = circuitBreakerService.getState(provider.name);
  if (circuitState === 'open') {
    const result: ProviderHealthResult = {
      providerId: provider.name,
      status: 'unhealthy',
      latencyMs: null,
      lastError: 'Circuit breaker open',
      circuitState,
      checkedAt: new Date().toISOString(),
    };
    cache.set(provider.name, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  const start = Date.now();
  let status: HealthStatus = 'healthy';
  let lastError: string | null = null;
  let latencyMs: number | null = null;

  try {
    const apiKey = await getKey(provider.name);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const response = await upstreamFetch(`${provider.baseUrl}/v1/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    latencyMs = Date.now() - start;
    if (!response.ok) {
      status = response.status >= 500 ? 'unhealthy' : 'degraded';
      lastError = `HTTP ${response.status}`;
    } else if (latencyMs > 3_000) {
      status = 'degraded';
    }
  } catch (err) {
    latencyMs = Date.now() - start;
    status = 'unhealthy';
    lastError = err instanceof Error ? err.message : 'Probe failed';
  }

  const result: ProviderHealthResult = {
    providerId: provider.name,
    status,
    latencyMs,
    lastError,
    circuitState: circuitBreakerService.getState(provider.name),
    checkedAt: new Date().toISOString(),
  };

  cache.set(provider.name, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export function clearHealthCache(providerId?: string): void {
  if (providerId) cache.delete(providerId);
  else cache.clear();
}
