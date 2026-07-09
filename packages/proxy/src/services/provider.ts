/**
 * ProviderService — registry and route resolution for LLM providers
 * Phase: 01-core-proxy-server
 * Plan: 01-02 (Task 3 references this)
 * 
 * Originally from Plan 01-01 but not yet created
 */

import type { LLMProvider, ModelRoute, RouteResolution, ClaudeTier } from '../types/index.js';
import { logger } from '../lib/logger.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    const seen = new Set<string>();
    for (const route of routes) {
      if (seen.has(route.claudeTier)) {
        console.warn(
          `[Provider] Duplicate route for tier "${route.claudeTier}" — using first match only`,
        );
        continue;
      }
      seen.add(route.claudeTier);
    }
    this.routes = routes.filter((r, i, arr) =>
      arr.findIndex((x) => x.claudeTier === r.claudeTier) === i,
    );
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
    // Exact match first
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

    // Partial match — non-Claude names, min 8 chars, longest match wins
    const lower = modelName.toLowerCase();
    const blockedPartial = new Set(['sonnet', 'opus', 'haiku', 'claude', 'anthropic']);
    if (lower.startsWith('claude-') || modelName.length < 8 || blockedPartial.has(lower)) {
      return null;
    }

    let best: { provider: LLMProvider; mId: string; score: number } | null = null;

    const sortedProviders = [...this.providers.values()]
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const provider of sortedProviders) {
      for (const mId of provider.models) {
        const mLower = mId.toLowerCase();
        const lastSegment = (mLower.split('/').pop() ?? mLower).split(':')[0];
        const wordBoundary =
          lastSegment === lower ||
          new RegExp(`(?:^|[-_/])${escapeRegExp(lower)}(?:$|[-_/])`).test(lastSegment) ||
          mLower.endsWith(`/${lower}`) ||
          mLower.endsWith(`:${lower}`);
        if (!wordBoundary) continue;

        const score = mId.length + (100 - provider.priority);
        if (!best || score > best.score) {
          best = { provider, mId, score };
        }
      }
    }

    if (best) {
      const matchingRoute = this.routes.find(
        r => r.targetModel === best!.mId && r.providerName === best!.provider.name,
      );
      return {
        provider: best.provider,
        targetModel: best.mId,
        originalModel: modelName,
        claudeTier: matchingRoute?.claudeTier,
      };
    }

    return null;
  }

  /**
   * Extract Claude tier from model name
   * claude-opus-* → opus, claude-sonnet-* → sonnet, claude-haiku-* → haiku
   */
  private extractTier(modelName: string): ClaudeTier | null {
    const lower = modelName.toLowerCase();

    if (lower.startsWith('claude-fable') || lower === 'fable') return 'fable';
    if (lower.startsWith('claude-opus')) return 'opus';
    if (lower.startsWith('claude-sonnet')) return 'sonnet';
    if (lower.startsWith('claude-haiku')) return 'haiku';

    return null;
  }

  /**
   * Reload providers and routes from config (atomic swap — no clear on live map)
   */
  reload(providers: LLMProvider[], routes: ModelRoute[]): void {
    this.providers = new Map(providers.map((p) => [p.name, p]));
    this.routes = [...routes];
  }

}

// Singleton instance (exported for admin.ts imports)
export const providerService = new ProviderService();