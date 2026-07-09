import { getProxyHttpBase, setProxyHttpBaseFromPort } from './proxyBase';
import type { RouteExperiment } from '@anthropic-claude-code/shared';
import { z } from 'zod';
import {
  BootstrapTokenSchema,
  DiscoveryStatusSchema,
  HealthResponseSchema,
  ProvidersArraySchema,
  RoutesResponseSchema,
  SuccessResponseSchema,
  ValidationResultSchema,
  type ApiProvider,
} from './schemas';

let cachedAdminToken: string | null = null;

function formatApiError(body: { error?: unknown }): string {
  const err = body.error;
  if (Array.isArray(err) && err[0]?.message) return String(err[0].message);
  if (typeof err === 'string') return err;
  return 'Request failed';
}

async function bootstrapAdminToken(): Promise<string> {
  const response = await fetch(`${getProxyHttpBase()}/admin/auth/bootstrap`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error('Failed to bootstrap admin token');
  const data = await response.json() as unknown;
  const parsed = BootstrapTokenSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid bootstrap token response');
  cachedAdminToken = parsed.data.token;
  return cachedAdminToken;
}

export async function ensureAdminToken(): Promise<string> {
  if (cachedAdminToken) return cachedAdminToken;
  return bootstrapAdminToken();
}

export function clearAdminTokenCache(): void {
  cachedAdminToken = null;
}

export async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await ensureAdminToken();
  const headers = new Headers(init?.headers);
  headers.set('X-Admin-Token', token);
  let response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    clearAdminTokenCache();
    const retryToken = await bootstrapAdminToken();
    headers.set('X-Admin-Token', retryToken);
    response = await fetch(url, { ...init, headers });
  }

  return response;
}

async function adminJson<T extends z.ZodTypeAny>(
  url: string,
  schema: T,
  init?: RequestInit,
): Promise<z.output<T>> {
  const response = await adminFetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
  const data: unknown = await response.json();
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid API response: ${parsed.error.message}`);
  }
  return parsed.data;
}

// Tauri invoke — lazy loaded only when running inside Tauri app
// In browser mode, startProxy/stopProxy return helpful errors
async function tauriInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke(command, args);
}

export async function checkHealth(): Promise<{
  running: boolean;
  status: string;
  port: number | null;
  version: string | null;
  uptimeMs?: number | null;
  activeStreams?: number | null;
}> {
  try {
    const response = await fetch(`${getProxyHttpBase()}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3s timeout
    });
    if (!response.ok) {
      return { running: false, status: 'error', port: null, version: null };
    }
    const data = await response.json();
    const parsed = HealthResponseSchema.safeParse(data);
    if (!parsed.success) {
      return { running: false, status: 'error', port: null, version: null };
    }
    const health = parsed.data;
    if (health.port) setProxyHttpBaseFromPort(health.port);
    return {
      running: true,
      status: health.status || 'ok',
      port: health.port || 3456,
      version: health.version || null,
      uptimeMs: health.uptimeMs ?? null,
      activeStreams: health.activeStreams ?? null,
    };
  } catch {
    return { running: false, status: 'stopped', port: null, version: null };
  }
}

export async function startProxy(): Promise<{ success: boolean; error?: string }> {
  try {
    await tauriInvoke('start_proxy');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start proxy',
    };
  }
}

export async function stopProxy(): Promise<{ success: boolean; error?: string }> {
  try {
    await tauriInvoke('stop_proxy');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop proxy',
    };
  }
}

export async function getProviderCount(): Promise<number> {
  try {
    const response = await adminFetch(`${getProxyHttpBase()}/admin/providers`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return 0;
    const providers = await response.json();
    return Array.isArray(providers) ? providers.length : 0;
  } catch {
    return 0;
  }
}

export async function fetchProviders(): Promise<ApiProvider[]> {
  return adminJson(`${getProxyHttpBase()}/admin/providers`, ProvidersArraySchema, {
    signal: AbortSignal.timeout(5000),
  });
}

export async function saveProvider(data: {
  name: string;
  baseUrl: string;
  apiKey: string;
  providerType?: string;
  models?: string[];
  enabled?: boolean;
  priority?: number;
}): Promise<{ success: boolean; validation?: { valid: boolean; error?: string } }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      keyId: data.name,
      models: data.models || [],
      enabled: data.enabled ?? true,
      priority: data.priority ?? 1,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
  return response.json();
}

export interface ContextModelEntry {
  id: string;
  provider: string;
  context: number;
  max_output: number;
}

export async function fetchContextConfig(): Promise<{
  config: { models: ContextModelEntry[]; claude: Record<string, number> };
}> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/context`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch context config');
  return response.json();
}

export async function saveContextConfig(data: {
  models: ContextModelEntry[];
  claude: Record<string, number>;
}): Promise<void> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/context`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
}

export async function checkForUpdates(): Promise<{ version: string }> {
  const response = await fetch(`${getProxyHttpBase()}/update-check`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Update check failed');
  return response.json();
}

export async function patchProviderModels(
  providerName: string,
  models: string[],
): Promise<{ success: boolean; models: string[] }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/providers/${providerName}/models`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
  return response.json();
}

export async function deleteProvider(id: string): Promise<{ success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/providers/${id}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to delete provider');
  return response.json();
}

export async function testProviderConnection(id: string): Promise<{ valid: boolean; error?: string }> {
  return adminJson(
    `${getProxyHttpBase()}/admin/providers/${id}/validate`,
    ValidationResultSchema,
    { method: 'POST', signal: AbortSignal.timeout(15000) },
  );
}

/** Dry-run validation — tests credentials without saving provider config. */
export async function testProviderDry(data: {
  name: string;
  baseUrl: string;
  apiKey?: string;
  providerType: string;
}): Promise<{ valid: boolean; error?: string }> {
  return adminJson(
    `${getProxyHttpBase()}/admin/providers/validate-dry`,
    ValidationResultSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    },
  );
}

export async function fetchRoutes(): Promise<z.output<typeof RoutesResponseSchema>> {
  return adminJson(`${getProxyHttpBase()}/admin/routes`, RoutesResponseSchema, {
    signal: AbortSignal.timeout(5000),
  });
}

export async function saveRoutes(routes: Array<{
  claudeTier: string;
  providerName: string;
  targetModel: string;
}>, subagentModel?: string): Promise<{ success: boolean }> {
  return adminJson(
    `${getProxyHttpBase()}/admin/routes`,
    SuccessResponseSchema,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routes, subagentModel }),
      signal: AbortSignal.timeout(10000),
    },
  );
}

export async function fetchConfig(): Promise<{
  providers: ApiProvider[];
  routes: Array<{
    claudeTier: 'opus' | 'sonnet' | 'haiku';
    providerName: string;
    targetModel: string;
  }>;
  routing?: { preferLowLatency?: boolean; preferLowCost?: boolean; tierFallback?: string[] };
  experiments?: RouteExperiment[];
  activeProfile?: string;
  profiles?: Record<string, unknown>;
}> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/config`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch config');
  return response.json();
}

export interface LatencyStat {
  provider: string;
  model: string;
  count: number;
  p50: number;
  p95: number;
  avg: number;
  lastMs: number;
}

export async function fetchRoutingStats(): Promise<{ latency: LatencyStat[] }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/routing-stats`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch routing stats');
  return response.json();
}

export async function saveRoutingPrefs(prefs: {
  preferLowLatency?: boolean;
  preferLowCost?: boolean;
}): Promise<void> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/routing/prefs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
}

export async function saveProfileSnapshot(name: string): Promise<void> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/profiles/${encodeURIComponent(name)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
}

export async function saveExperiments(experiments: RouteExperiment[]): Promise<void> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/experiments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ experiments }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
}

export interface ConfigAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  summary?: string;
  snapshotFile: string;
}

export async function fetchConfigAudit(): Promise<{ entries: ConfigAuditEntry[] }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/config/audit`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch config audit');
  return response.json();
}

export async function rollbackConfig(id: string): Promise<void> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/config/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
}

export interface MetricsSummary {
  uptimeMs: number;
  activeStreams: number;
  errorRate: number;
  requestCount: number;
  latency: { p50: number; p95: number; avg: number };
  circuitBreakers: Array<{ provider: string; state: string }>;
}

export async function fetchMetricsSummary(): Promise<MetricsSummary> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/metrics/summary`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch metrics');
  return response.json();
}

export interface ProviderHealthResult {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number | null;
  lastError: string | null;
  circuitState: 'closed' | 'open' | 'half-open';
  checkedAt: string;
}

export async function fetchAllProviderHealth(): Promise<{ providers: ProviderHealthResult[] }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/providers/health`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Failed to fetch provider health');
  return response.json();
}

export async function replayRequest(replayId: string): Promise<{
  success: boolean;
  statusCode: number;
  preview: string;
}> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replayId }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
  return response.json();
}

export async function fetchProfiles(): Promise<{ activeProfile: string; profiles: string[] }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/profiles`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch profiles');
  return response.json();
}

export async function activateProfile(name: string): Promise<void> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/profiles/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
}

export async function fetchPluginStatus(): Promise<Array<{ id: string; installed: boolean; path?: string }>> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/plugins`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch plugins');
  return response.json();
}

export async function installPlugin(id: string): Promise<void> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/plugins/${id}/install`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
  }
}

export async function testNetworkConnection(port: number): Promise<{ ok: boolean; status?: string }> {
  const base = `http://localhost:${port}`;
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { ok: false };
    const data = await response.json();
    return { ok: true, status: data.status };
  } catch {
    return { ok: false };
  }
}

export interface RequestLogEntry {
  timestamp: string;
  requestId?: string;
  requestModel: string;
  claudeTier?: string;
  providerName?: string;
  targetModel?: string;
  status: 'success' | 'error';
  durationMs: number;
  statusCode: number;
  requestBodyPreview?: string;
  responsePreview?: string;
  retryCount?: number;
  replayId?: string;
}

export async function fetchLogs(): Promise<RequestLogEntry[]> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/logs`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch request logs');
  return response.json();
}

export async function exportConfig(): Promise<{
  providers: Array<{ name: string; baseUrl: string; keyId: string; models: string[]; enabled: boolean; priority: number }>;
  routes: Array<{ claudeTier: string; providerName: string; targetModel: string }>;
  settings: { port: number };
}> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/config/export`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to export config');
  return response.json();
}

export async function importConfig(data: object, strategy: 'merge' | 'replace'): Promise<{ success: boolean; backupPath?: string }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/config/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, strategy }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to import config');
  }
  return response.json();
}

export async function fetchDiff(incoming: object): Promise<{ current: object; incoming: object }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/config/diff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: incoming }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to generate diff');
  return response.json();
}

export async function fetchValidationResults(): Promise<Record<string, { valid: boolean; error?: string; timestamp: string; dismissed?: boolean }>> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/validation-results`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch validation results');
  return response.json();
}

export async function dismissValidationWarning(providerName: string): Promise<{ success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/validation-results/${providerName}/dismiss`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to dismiss warning');
  return response.json();
}

export async function getRateLimit(providerId: string): Promise<{ providerName: string; requestsPerMinute: number }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/providers/${providerId}/rate-limit`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch rate limit');
  return response.json();
}

export async function setRateLimit(providerId: string, rpm: number): Promise<{ success: boolean; providerName: string; requestsPerMinute: number }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/providers/${providerId}/rate-limit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestsPerMinute: rpm }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Failed to set rate limit');
  return response.json();
}

export const fetchRecentLogs = fetchLogs;

// ---------------------------------------------------------------------------
// Discovery API
// ---------------------------------------------------------------------------

export interface DiscoveredProvider {
  name: string;
  reachable: boolean;
}

export interface DiscoveryStatus {
  enabled: boolean;
  config: {
    enabled: boolean;
    intervalMs: number;
    ollama: boolean;
    lmStudio: boolean;
    llamaCpp: boolean;
  };
  providers: DiscoveredProvider[];
}

export async function fetchDiscoveryStatus(): Promise<DiscoveryStatus> {
  return adminJson(`${getProxyHttpBase()}/admin/discovery`, DiscoveryStatusSchema, {
    signal: AbortSignal.timeout(5000),
  });
}

export async function scanDiscovery(): Promise<{ success: boolean; providers: DiscoveredProvider[] }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/discovery/scan`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Failed to trigger discovery scan');
  return response.json();
}

// ---------------------------------------------------------------------------
// Thinking config API
// ---------------------------------------------------------------------------

export interface TierThinkingConfig {
  mode: 'passthrough' | 'strip' | 'transform' | 'auto';
}

export interface ThinkingConfig {
  opus: TierThinkingConfig;
  sonnet: TierThinkingConfig;
  haiku: TierThinkingConfig;
  overrides?: Record<string, string>;
}

export async function fetchThinkingConfig(): Promise<ThinkingConfig> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/thinking-config`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch thinking config');
  return response.json();
}

export async function saveThinkingConfig(config: ThinkingConfig): Promise<{ success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/thinking-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Failed to save thinking config');
  return response.json();
}

// ---------------------------------------------------------------------------
// Cache config API
// ---------------------------------------------------------------------------

export interface CacheConfig {
  enabled: boolean;
  ttlMs: number;
  maxEntries: number;
}

export async function fetchCacheConfig(): Promise<CacheConfig> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/cache-config`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch cache config');
  return response.json();
}

export async function saveCacheConfig(config: CacheConfig): Promise<{ success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/cache-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Failed to save cache config');
  return response.json();
}

export async function scanProviderModels(providerName: string): Promise<{ models: string[] }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/providers/${providerName}/models`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to scan models');
  }
  return response.json();
}

export async function fetchAutoCompactThreshold(): Promise<{ threshold: number; mode: 'suggest' | 'trigger' }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/auto-compact`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch auto-compact threshold');
  return response.json();
}

export async function saveAutoCompactThreshold(
  threshold: number,
  mode?: 'suggest' | 'trigger',
): Promise<{ success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/auto-compact`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threshold, mode }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Failed to save auto-compact threshold');
  return response.json();
}

export async function fetchAliases(): Promise<{ aliases: Record<string, string> }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/aliases`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch aliases');
  return response.json();
}

export async function saveAliases(aliases: Record<string, string>): Promise<{ success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/aliases`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aliases }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Failed to save aliases');
  return response.json();
}

// ---------------------------------------------------------------------------
// Onboarding / benchmark / context stream / OpenRouter import
// ---------------------------------------------------------------------------

export interface OnboardingStatus {
  complete: boolean;
  hasProviders: boolean;
  hasRoutes: boolean;
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/onboarding`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch onboarding status');
  return response.json();
}

export async function completeOnboarding(): Promise<{ success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/onboarding/complete`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to complete onboarding');
  return response.json();
}

export interface BenchmarkResult {
  providerName: string;
  targetModel: string;
  tier?: string;
  latencyMs: number;
  statusCode: number;
  success: boolean;
  qualityOk: boolean;
  outputPreview: string;
  outputTokens: number;
  error?: string;
}

export async function runBenchmark(params: {
  providerName: string;
  targetModel: string;
  tier?: 'opus' | 'sonnet' | 'haiku';
}): Promise<BenchmarkResult> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Benchmark failed');
  }
  return response.json();
}

export interface ContextStreamPayload {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  provider: string;
  tier: string;
  inflation: number;
  limit: number;
  usagePercent: number;
}

export async function importOpenRouterModels(
  providerName: string,
  filter: 'all' | 'free' | 'paid' = 'all',
): Promise<{
  success: boolean;
  added: string[];
  total: number;
  catalogSize: number;
  filter: string;
}> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/providers/${providerName}/import-openrouter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'OpenRouter import failed');
  }
  return response.json();
}

export interface NetworkConfig {
  host: string;
  requestedHost: string;
  port: number;
  lanBindAllowed: boolean;
  restartRequired?: boolean;
}

export async function fetchNetworkConfig(): Promise<NetworkConfig> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/network`);
  if (!response.ok) throw new Error('Failed to load network config');
  return response.json();
}

export async function saveNetworkConfig(data: {
  host?: string;
  port?: number;
}): Promise<NetworkConfig & { success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/network`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save network config');
  }
  const result = await response.json() as NetworkConfig & { success: boolean };
  if (result.port) setProxyHttpBaseFromPort(result.port);
  return result;
}

export interface MtlsStatus {
  enabled: boolean;
  ready: boolean;
  port: number;
  certDir: string;
  configured: { enabled: boolean; port?: number };
  generateScript: string;
  restartRequired?: boolean;
}

export async function fetchMtlsStatus(): Promise<MtlsStatus> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/security/mtls`);
  if (!response.ok) throw new Error('Failed to load mTLS status');
  return response.json();
}

export async function saveMtlsConfig(data: {
  enabled: boolean;
  port?: number;
}): Promise<MtlsStatus & { success: boolean }> {
  const response = await adminFetch(`${getProxyHttpBase()}/admin/security/mtls`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save mTLS config');
  }
  return response.json();
}
