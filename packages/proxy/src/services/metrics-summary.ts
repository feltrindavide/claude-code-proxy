/**
 * JSON metrics summary for dashboard (complements Prometheus text export).
 */

import { getActiveStreamCount } from './shutdown.js';
import { circuitBreakerService } from './circuit-breaker.js';
import { latencyTracker } from './latency-tracker.js';
import { requestLogService } from './requestLog.js';
import { register } from '../metrics/prometheus.js';

const SERVER_START = Date.now();

export interface MetricsSummary {
  uptimeMs: number;
  activeStreams: number;
  errorRate: number;
  requestCount: number;
  latency: { p50: number; p95: number; avg: number };
  circuitBreakers: Array<{ provider: string; state: string }>;
}

export function getMetricsSummary(): MetricsSummary {
  const logs = requestLogService.getAll();
  const errors = logs.filter((e) => e.status === 'error').length;
  const requestCount = logs.length;
  const errorRate = requestCount > 0 ? errors / requestCount : 0;

  const global = latencyTracker.getGlobalLatency();

  const circuitBreakers = [...circuitBreakerService.getAllStates()].map(([provider, state]) => ({
    provider,
    state,
  }));

  // Touch register so default metrics stay warm
  void register;

  return {
    uptimeMs: Date.now() - SERVER_START,
    activeStreams: getActiveStreamCount(),
    errorRate: Math.round(errorRate * 1000) / 1000,
    requestCount,
    latency: {
      p50: global.p50,
      p95: global.p95,
      avg: global.avg,
    },
    circuitBreakers,
  };
}
