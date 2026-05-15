/**
 * TypeScript type definitions for the Claude Code Proxy
 * Phase: 01-core-proxy-server
 * Plan: 01-01
 */

export type ClaudeTier = 'opus' | 'sonnet' | 'haiku';

export interface LLMProvider {
  name: string;
  baseUrl: string;
  keyId: string; // Keychain account name (D-14)
  providerType?: string; // Adapter type (e.g., 'openrouter', 'opencode', 'ollama', 'custom')
  models: string[];
  enabled: boolean;
  priority: number; // lower = higher priority (D-12)
  autoDiscovered?: boolean; // Set by local provider discovery
}

export interface AdapterConfig {
  providerType: string;
  timeouts?: { streaming?: number; nonStreaming?: number };
}

export interface ModelRoute {
  claudeTier: ClaudeTier;
  providerName: string;
  targetModel: string;
}

export interface ProxyConfig {
  port: number;      // default 3456 (D-02)
  host: string;      // default "localhost"
  providers: LLMProvider[];
  routes: ModelRoute[];
  subagentModel?: string; // Model to use for subagent tasks
  autoCompactThreshold?: number; // % di contesto per auto-compact (0-1, default 0.7)
}

export interface RouteResolution {
  provider: LLMProvider;
  targetModel: string;
  originalModel: string;
  claudeTier?: ClaudeTier; // Added for request log enrichment (04-01)
}

/**
 * Request log entry — captured for every POST /v1/messages request
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 */
export interface RequestLogEntry {
  timestamp: string;
  requestModel: string;
  claudeTier?: ClaudeTier;
  providerName?: string;
  targetModel?: string;
  status: 'success' | 'error';
  durationMs: number;
  statusCode: number;
  requestBodyPreview?: string;   // truncated to ~2KB
  responsePreview?: string;      // truncated preview
  retryCount?: number;           // retry attempt number (05-02, D-69)
}