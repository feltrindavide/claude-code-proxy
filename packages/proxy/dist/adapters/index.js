/**
 * Adapter registry — factory and registration for provider adapters
 * Phase: 02-sse-streaming-integration
 * Plan: 02-01
 *
 * Map-based registry like ProviderService — adapters register on import
 */
import { OpenRouterAdapter } from './openrouter.js';
import { OpenCodeAdapter } from './opencode.js';
import { OllamaAdapter } from './ollama.js';
import { CustomAdapter } from './custom.js';
const adapters = new Map();
/** Register a provider adapter */
export function registerAdapter(adapter) {
    adapters.set(adapter.providerType, adapter);
}
/** Get a registered adapter by provider type (case-insensitive) */
export function getAdapter(providerType) {
    // Try exact match first
    const exact = adapters.get(providerType);
    if (exact)
        return exact;
    // Fall back to case-insensitive match
    const lower = providerType.toLowerCase();
    for (const [key, adapter] of adapters) {
        if (key.toLowerCase() === lower)
            return adapter;
    }
    return undefined;
}
/** Get existing adapter or fall back to CustomAdapter for unknown providers */
export function getOrCreateAdapter(providerType, _baseUrl) {
    const existing = getAdapter(providerType);
    if (existing)
        return existing;
    // Fallback to custom OpenAI-compatible adapter
    return new CustomAdapter();
}
// Register built-in adapters
registerAdapter(new OpenRouterAdapter());
registerAdapter(new OpenCodeAdapter());
registerAdapter(new OllamaAdapter());
registerAdapter(new CustomAdapter());
//# sourceMappingURL=index.js.map