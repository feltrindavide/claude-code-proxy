/**
 * ProviderService — registry and route resolution for LLM providers
 * Phase: 01-core-proxy-server
 * Plan: 01-02 (Task 3 references this)
 *
 * Originally from Plan 01-01 but not yet created
 */
/**
 * ProviderService — manages provider registry and route resolution
 */
export class ProviderService {
    providers = new Map();
    routes = [];
    /**
     * Register a provider in the registry
     */
    registerProvider(provider) {
        this.providers.set(provider.name, provider);
    }
    /**
     * Delete a provider from the registry
     */
    deleteProvider(name) {
        this.providers.delete(name);
    }
    /**
     * Get all providers, sorted by priority (lower = higher priority)
     */
    getProviders() {
        return Array.from(this.providers.values())
            .sort((a, b) => a.priority - b.priority);
    }
    /**
     * Get a specific provider by name
     */
    getProvider(name) {
        return this.providers.get(name);
    }
    /**
     * Set route mappings (replaces existing)
     */
    setRoutes(routes) {
        this.routes = routes;
    }
    /**
     * Get current routes
     */
    getRoutes() {
        return [...this.routes];
    }
    /**
     * Resolve model route by model name
     * Uses prefix matching: claude-opus-* → opus tier
     */
    resolveModelRoute(modelName) {
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
    resolveCustomModel(modelName) {
        for (const provider of this.providers.values()) {
            if (!provider.enabled)
                continue;
            if (provider.models.includes(modelName)) {
                // Determine which tier this model maps to, if any
                const matchingRoute = this.routes.find(r => r.targetModel === modelName && r.providerName === provider.name);
                return {
                    provider,
                    targetModel: modelName,
                    originalModel: modelName,
                    claudeTier: matchingRoute?.claudeTier,
                };
            }
        }
        return null;
    }
    /**
     * Extract Claude tier from model name
     * claude-opus-* → opus, claude-sonnet-* → sonnet, claude-haiku-* → haiku
     */
    extractTier(modelName) {
        const lower = modelName.toLowerCase();
        if (lower.startsWith('claude-opus'))
            return 'opus';
        if (lower.startsWith('claude-sonnet'))
            return 'sonnet';
        if (lower.startsWith('claude-haiku'))
            return 'haiku';
        return null;
    }
    /**
     * Reload providers and routes from config
     */
    reload(providers, routes) {
        this.providers.clear();
        providers.forEach(p => this.providers.set(p.name, p));
        this.routes = routes;
    }
}
// Singleton instance (exported for admin.ts imports)
export const providerService = new ProviderService();
//# sourceMappingURL=provider.js.map