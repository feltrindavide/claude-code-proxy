/**
 * ProviderService — registry and route resolution for LLM providers
 * Phase: 01-core-proxy-server
 * Plan: 01-02 (Task 3 references this)
 *
 * Originally from Plan 01-01 but not yet created
 */
import type { LLMProvider, ModelRoute, RouteResolution } from '../types/index.js';
/**
 * ProviderService — manages provider registry and route resolution
 */
export declare class ProviderService {
    private providers;
    private routes;
    /**
     * Register a provider in the registry
     */
    registerProvider(provider: LLMProvider): void;
    /**
     * Delete a provider from the registry
     */
    deleteProvider(name: string): void;
    /**
     * Get all providers, sorted by priority (lower = higher priority)
     */
    getProviders(): LLMProvider[];
    /**
     * Get a specific provider by name
     */
    getProvider(name: string): LLMProvider | undefined;
    /**
     * Set route mappings (replaces existing)
     */
    setRoutes(routes: ModelRoute[]): void;
    /**
     * Get current routes
     */
    getRoutes(): ModelRoute[];
    /**
     * Resolve model route by model name
     * Uses prefix matching: claude-opus-* → opus tier
     */
    resolveModelRoute(modelName: string): RouteResolution | null;
    /**
     * Resolve a custom model by direct name lookup
     * Searches all providers for the given model name
     */
    resolveCustomModel(modelName: string): RouteResolution | null;
    /**
     * Extract Claude tier from model name
     * claude-opus-* → opus, claude-sonnet-* → sonnet, claude-haiku-* → haiku
     */
    private extractTier;
    /**
     * Reload providers and routes from config
     */
    reload(providers: LLMProvider[], routes: ModelRoute[]): void;
}
export declare const providerService: ProviderService;
//# sourceMappingURL=provider.d.ts.map