/**
 * Prometheus metrics for proxy observability.
 */

import client from 'prom-client';
import type { CircuitState } from '../services/circuit-breaker.js';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const proxyRequestsTotal = new client.Counter({
  name: 'proxy_requests_total',
  help: 'Total proxy requests',
  labelNames: ['status', 'provider', 'tier', 'stream'] as const,
  registers: [register],
});

export const proxyUpstreamLatencyMs = new client.Histogram({
  name: 'proxy_upstream_latency_ms',
  help: 'Upstream request latency in milliseconds',
  labelNames: ['provider', 'stream'] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 120000],
  registers: [register],
});

export const proxyCacheHitsTotal = new client.Counter({
  name: 'proxy_cache_hits_total',
  help: 'Response cache lookups',
  labelNames: ['hit'] as const,
  registers: [register],
});

export const proxyCircuitBreakerState = new client.Gauge({
  name: 'proxy_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['provider', 'state'] as const,
  registers: [register],
});

const stateToGauge: Record<CircuitState, number> = {
  closed: 0,
  'half-open': 1,
  open: 2,
};

export function recordCircuitState(provider: string, state: CircuitState): void {
  for (const s of ['closed', 'half-open', 'open'] as CircuitState[]) {
    proxyCircuitBreakerState.set({ provider, state: s }, s === state ? stateToGauge[state] : 0);
  }
}

export async function getMetricsText(): Promise<string> {
  return register.metrics();
}

export { register };
