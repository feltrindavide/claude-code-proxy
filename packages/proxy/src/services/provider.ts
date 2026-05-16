/**
 * ProviderService — registry and route resolution for LLM providers
 * Phase: 01-core-proxy-server
 * Plan: 01-02 (Task 3 references this)
 * 
 * Originally from Plan 01-01 but not yet created
 */

import type { LLMProvider, ModelRoute, RouteResolution, ClaudeTier } from '../types/index.js';

/**
 * ProviderService — manages provider registry and route resolution
 */
export class ProviderService {
  private providers: Map<string, LLMProvider> = new Map();
  private routes: ModelRoute[] = [];

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  deleteProvider(name: string): void {
    this.providers.delete(name);
  }

  getProviders(): LLMProvider[] {
    return Array.from(this.providers.values())
      .sort((a, b) => a.priority - b.priority);
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  setRoutes(routes: ModelRoute[]): void {
    this.routes = routes;
  }

  getRoutes(): ModelRoute[] {
    return [...this.routes];
  }

  /**
   * Resolve model route by model name
   * Uses prefix matching: claude-opus-* → opus tier
   */
  resolveModelRoute(modelName: string): RouteResolution | null {
    const tier = this.extractTier(modelName);
    if (!tier) {
      return null;
    }

    const route = this.routes.find(r => r.claudeTier === tier);
    if (!route) {
      return null;
    }

    const provider = this.providers.get(route.providerName);
    if (!provider || !provider.enabled) {
      return null;
    }

    return {
      provider,
      targetModel: route.targetModel,
      originalModel: modelName,
      claudeTier: tier,
    };
  }

  /**
   * Resolve a custom model by direct name lookup
   * Searches all providers for the given model name
   */
  resolveCustomModel(modelName: string): RouteResolution | null {
    // Prima prova match esatto
    for (const provider of this.providers.values()) {
      if (!provider.enabled) continue;
      if (provider.models.includes(modelName)) {
        const matchingRoute = this.routes.find(r => r.targetModel === modelName && r.providerName === provider.name);
        return {
          provider,
          targetModel: modelName,
          originalModel: modelName,
          claudeTier: matchingRoute?.claudeTier,
        };
      }
    }

    // Se match esatto fallisce, prova match parziale (es. "glm-4.5-air" matcha "z-ai/glm-4.5-air:free")
    for (const provider of this.providers.values()) {
      if (!provider.enabled) continue;
      for (const mId of provider.models) {
        if (mId.toLowerCase().includes(modelName.toLowerCase()) || modelName.toLowerCase().includes(mId.toLowerCase())) {
          const matchingRoute = this.routes.find(r => r.targetModel === mId && r.providerName === provider.name);
          return {
            provider,
            targetModel: mId,
            originalModel: modelName,
            claudeTier: matchingRoute?.claudeTier,
          };
        }
      }
    }

    return null;
  }

  /**
   * Extract Claude tier from model name
   * claude-opus-* → opus, claude-sonnet-* → sonnet, claude-haiku-* → haiku
   */
  private extractTier(modelName: string): ClaudeTier | null {
    const lower = modelName.toLowerCase();

    if (lower.startsWith('claude-opus')) return 'opus';
    if (lower.startsWith('claude-sonnet')) return 'sonnet';
    if (lower.startsWith('claude-haiku')) return 'haiku';

    return null;
  }

  /**
   * Reload providers and routes from config
   */
  reload(providers: LLMProvider[], routes: ModelRoute[]): void {
    this.providers.clear();
    providers.forEach(p => this.providers.set(p.name, p));
    this.routes = routes;
  }

}

// Singleton instance (exported for admin.ts imports)
export const providerService = new ProviderService();