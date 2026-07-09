/**
 * TypeScript type definitions for the Claude Code Proxy
 * Phase: 01-core-proxy-server
 * Plan: 01-01
 */

export type ClaudeTier = 'opus' | 'sonnet' | 'haiku' | 'fable';

export type CostTier = 'free' | 'cheap' | 'standard' | 'premium';

export interface RouteCandidate {
  providerName: string;
  targetModel: string;
  priority?: number;
  costTier?: CostTier;
}

export interface RouteExperimentVariant {
  name: string;
  weight: number;
  providerName: string;
  targetModel: string;
}

export interface RouteExperiment {
  id: string;
  tier: ClaudeTier;
  enabled: boolean;
  variants: RouteExperimentVariant[];
  stickyKey?: 'session' | 'user';
}

export interface RoutingConfig {
  tierFallback?: ClaudeTier[];
  preferLowLatency?: boolean;
  preferLowCost?: boolean;
}

export interface ModelAliases {
  fast?: string;
  smart?: string;
  free?: string;
  [alias: string]: string | undefined;
}

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
  candidates?: RouteCandidate[];
  tierFallback?: ClaudeTier[];
}

export interface ProxyConfig {
  port: number;      // default 3456 (D-02)
  host: string;      // default "127.0.0.1"
  providers: LLMProvider[];
  routes: ModelRoute[];
  subagentModel?: string; // Model to use for subagent tasks
  autoCompactThreshold?: number; // % di contesto per auto-compact (0-1, default 0.7)
  autoCompactMode?: 'suggest' | 'trigger';
  onboardingComplete?: boolean;
  aliases?: ModelAliases;
  experiments?: RouteExperiment[];
  routing?: RoutingConfig;
  adminMtls?: AdminMtlsConfig;
  thinking?: unknown;
  responseCache?: unknown;
  discoveryConfig?: unknown;
  activeProfile?: string;
  profiles?: Record<string, unknown>;
}

export interface AdminMtlsConfig {
  enabled: boolean;
  port?: number;
}

export interface RouteResolution {
  provider: LLMProvider;
  targetModel: string;
  originalModel: string;
  claudeTier?: ClaudeTier; // Added for request log enrichment (04-01)
  fallbackTier?: boolean;
  costTier?: CostTier;
  candidatePriority?: number;
  experimentId?: string;
  experimentVariant?: string;
}

export interface ResolveRequestResult {
  modelName: string;
  resolution: RouteResolution | null;
  candidates: RouteResolution[];
  experimentId?: string;
  experimentVariant?: string;
}

/**
 * Request log entry — captured for every POST /v1/messages request
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 */
export interface RequestLogEntry {
  timestamp: string;
  requestId?: string;
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
  replayId?: string;             // key for full body in replay store
}