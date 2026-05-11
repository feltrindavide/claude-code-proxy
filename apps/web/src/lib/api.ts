const PROXY_API_BASE = 'http://localhost:3456';

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
}> {
  try {
    const response = await fetch(`${PROXY_API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3s timeout
    });
    if (!response.ok) {
      return { running: false, status: 'error', port: null, version: null };
    }
    const data = await response.json();
    return {
      running: true,
      status: data.status || 'ok',
      port: data.port || 3456,
      version: data.version || null,
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
    const response = await fetch(`${PROXY_API_BASE}/admin/providers`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return 0;
    const providers = await response.json();
    return Array.isArray(providers) ? providers.length : 0;
  } catch {
    return 0;
  }
}

export async function fetchProviders(): Promise<Array<{
  name: string;
  baseUrl: string;
  keyId: string;
  keyMask: string | null;
  models: string[];
  enabled: boolean;
  priority: number;
}>> {
  const response = await fetch(`${PROXY_API_BASE}/admin/providers`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch providers');
  return response.json();
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
  const response = await fetch(`${PROXY_API_BASE}/admin/providers`, {
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
    throw new Error(body.error || 'Failed to save provider');
  }
  return response.json();
}

export async function deleteProvider(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/providers/${id}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to delete provider');
  return response.json();
}

export async function testProviderConnection(id: string): Promise<{ valid: boolean; error?: string }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/providers/${id}/validate`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { valid: false, error: body.error || 'Validation failed' };
  }
  return response.json();
}

export async function fetchRoutes(): Promise<{
  routes: Array<{
    claudeTier: 'opus' | 'sonnet' | 'haiku';
    providerName: string;
    targetModel: string;
  }>;
  subagentModel?: string;
}> {
  const response = await fetch(`${PROXY_API_BASE}/admin/routes`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch routes');
  return response.json();
}

export async function saveRoutes(routes: Array<{
  claudeTier: string;
  providerName: string;
  targetModel: string;
}>, subagentModel?: string): Promise<{ success: boolean }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/routes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routes, subagentModel }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Failed to save routes');
  return response.json();
}

export async function fetchConfig(): Promise<{
  providers: Array<any>;
  routes: Array<any>;
}> {
  const response = await fetch(`${PROXY_API_BASE}/admin/config`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch config');
  return response.json();
}

export interface RequestLogEntry {
  timestamp: string;
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
}

export async function fetchLogs(): Promise<RequestLogEntry[]> {
  const response = await fetch(`${PROXY_API_BASE}/admin/logs`, {
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
  const response = await fetch(`${PROXY_API_BASE}/admin/config/export`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to export config');
  return response.json();
}

export async function importConfig(data: object, strategy: 'merge' | 'replace'): Promise<{ success: boolean; backupPath?: string }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/config/import`, {
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
  const response = await fetch(`${PROXY_API_BASE}/admin/config/diff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: incoming }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to generate diff');
  return response.json();
}

export async function fetchValidationResults(): Promise<Record<string, { valid: boolean; error?: string; timestamp: string; dismissed?: boolean }>> {
  const response = await fetch(`${PROXY_API_BASE}/admin/validation-results`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch validation results');
  return response.json();
}

export async function dismissValidationWarning(providerName: string): Promise<{ success: boolean }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/validation-results/${providerName}/dismiss`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to dismiss warning');
  return response.json();
}

export async function getRateLimit(providerId: string): Promise<{ providerName: string; requestsPerMinute: number }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/providers/${providerId}/rate-limit`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch rate limit');
  return response.json();
}

export async function setRateLimit(providerId: string, rpm: number): Promise<{ success: boolean; providerName: string; requestsPerMinute: number }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/providers/${providerId}/rate-limit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestsPerMinute: rpm }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Failed to set rate limit');
  return response.json();
}

export async function fetchRecentLogs(): Promise<RequestLogEntry[]> {
  const response = await fetch(`${PROXY_API_BASE}/admin/logs`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch request logs');
  return response.json();
}

export async function scanProviderModels(providerName: string): Promise<{ models: string[] }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/providers/${providerName}/models`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to scan models');
  }
  return response.json();
}
