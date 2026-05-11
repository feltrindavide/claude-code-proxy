/**
 * Adapter registry — factory and registration for provider adapters
 * Phase: 02-sse-streaming-integration
 * Plan: 02-01
 *
 * Map-based registry like ProviderService — adapters register on import
 */
import type { ProviderAdapter } from './interface.js';
/** Register a provider adapter */
export declare function registerAdapter(adapter: ProviderAdapter): void;
/** Get a registered adapter by provider type (case-insensitive) */
export declare function getAdapter(providerType: string): ProviderAdapter | undefined;
/** Get existing adapter or fall back to CustomAdapter for unknown providers */
export declare function getOrCreateAdapter(providerType: string, _baseUrl: string): ProviderAdapter;
//# sourceMappingURL=index.d.ts.map