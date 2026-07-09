/** Shared types between proxy and dashboard (keep in sync with packages/proxy/src/types). */

export type ClaudeTier = 'opus' | 'sonnet' | 'haiku' | 'fable';

export interface LLMProvider {
  name: string;
  baseUrl: string;
  keyId: string;
  providerType?: string;
  models: string[];
  enabled: boolean;
  priority: number;
  autoDiscovered?: boolean;
}

export interface ModelRoute {
  claudeTier: ClaudeTier;
  providerName: string;
  targetModel: string;
}

export interface RoutingConfig {
  tierFallback?: ClaudeTier[];
  preferLowLatency?: boolean;
  preferLowCost?: boolean;
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

export interface AppConfig {
  host?: string;
  port?: number;
  providers: LLMProvider[];
  routes: ModelRoute[];
  routing?: RoutingConfig;
  activeProfile?: string;
  profiles?: Record<string, Partial<AppConfig>>;
}
