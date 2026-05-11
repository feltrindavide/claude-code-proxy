"use strict";
/**
 * ProviderService — registry and route resolution for LLM providers
 * Phase: 01-core-proxy-server
 * Plan: 01-02 (Task 3 references this)
 *
 * Originally from Plan 01-01 but not yet created
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerService = exports.ProviderService = void 0;
/**
 * ProviderService — manages provider registry and route resolution
 */
var ProviderService = /** @class */ (function () {
    function ProviderService() {
        this.providers = new Map();
        this.routes = [];
    }
    /**
     * Register a provider in the registry
     */
    ProviderService.prototype.registerProvider = function (provider) {
        this.providers.set(provider.name, provider);
    };
    /**
     * Delete a provider from the registry
     */
    ProviderService.prototype.deleteProvider = function (name) {
        this.providers.delete(name);
    };
    /**
     * Get all providers, sorted by priority (lower = higher priority)
     */
    ProviderService.prototype.getProviders = function () {
        return Array.from(this.providers.values())
            .sort(function (a, b) { return a.priority - b.priority; });
    };
    /**
     * Get a specific provider by name
     */
    ProviderService.prototype.getProvider = function (name) {
        return this.providers.get(name);
    };
    /**
     * Set route mappings (replaces existing)
     */
    ProviderService.prototype.setRoutes = function (routes) {
        this.routes = routes;
    };
    /**
     * Get current routes
     */
    ProviderService.prototype.getRoutes = function () {
        return __spreadArray([], this.routes, true);
    };
    /**
     * Resolve model route by model name
     * Uses prefix matching: claude-opus-* → opus tier
     */
    ProviderService.prototype.resolveModelRoute = function (modelName) {
        var tier = this.extractTier(modelName);
        if (!tier) {
            return null;
        }
        var route = this.routes.find(function (r) { return r.claudeTier === tier; });
        if (!route) {
            return null;
        }
        var provider = this.providers.get(route.providerName);
        if (!provider || !provider.enabled) {
            return null;
        }
        return {
            provider: provider,
            targetModel: route.targetModel,
            originalModel: modelName,
            claudeTier: tier,
        };
    };
    /**
     * Resolve a custom model by direct name lookup
     * Searches all providers for the given model name
     */
    ProviderService.prototype.resolveCustomModel = function (modelName) {
        var _loop_1 = function (provider) {
            if (!provider.enabled)
                return "continue";
            if (provider.models.includes(modelName)) {
                // Determine which tier this model maps to, if any
                var matchingRoute = this_1.routes.find(function (r) { return r.targetModel === modelName && r.providerName === provider.name; });
                return { value: {
                        provider: provider,
                        targetModel: modelName,
                        originalModel: modelName,
                        claudeTier: matchingRoute === null || matchingRoute === void 0 ? void 0 : matchingRoute.claudeTier,
                    } };
            }
        };
        var this_1 = this;
        for (var _i = 0, _a = this.providers.values(); _i < _a.length; _i++) {
            var provider = _a[_i];
            var state_1 = _loop_1(provider);
            if (typeof state_1 === "object")
                return state_1.value;
        }
        return null;
    };
    /**
     * Extract Claude tier from model name
     * claude-opus-* → opus, claude-sonnet-* → sonnet, claude-haiku-* → haiku
     */
    ProviderService.prototype.extractTier = function (modelName) {
        var lower = modelName.toLowerCase();
        if (lower.startsWith('claude-opus'))
            return 'opus';
        if (lower.startsWith('claude-sonnet'))
            return 'sonnet';
        if (lower.startsWith('claude-haiku'))
            return 'haiku';
        return null;
    };
    /**
     * Reload providers and routes from config
     */
    ProviderService.prototype.reload = function (providers, routes) {
        var _this = this;
        this.providers.clear();
        providers.forEach(function (p) { return _this.providers.set(p.name, p); });
        this.routes = routes;
    };
    return ProviderService;
}());
exports.ProviderService = ProviderService;
// Singleton instance (exported for admin.ts imports)
exports.providerService = new ProviderService();
