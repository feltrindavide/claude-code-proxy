/**
 * ProviderValidatorService — validates provider connectivity on save and startup
 * Phase: 02-sse-streaming-integration
 * Plan: 02-03, Task 1
 *
 * Per D-22: Validate on save AND on startup
 * Per D-23: Per-adapter validate() method
 * Per D-24: Default: GET /v1/models, with per-adapter fallback
 */
import { getAdapter } from '../adapters/index.js';
import { keychainService } from './keychain.js';
import { providerService } from './provider.js';
/**
 * ProviderValidatorService — validates provider connectivity
 * using the appropriate adapter's validate() method
 */
export class ProviderValidatorService {
    /**
     * Validate a single provider's connectivity
     * @param name — provider name (used to look up adapter and API key)
     * @param baseUrl — provider base URL to validate against
     */
    async validateProvider(name, baseUrl) {
        // Look up the provider to get its providerType
        const provider = providerService.getProvider(name);
        const providerType = provider?.providerType || 'Custom';
        // Look up adapter by providerType (e.g., 'OpenRouter', 'OpenCode', 'Ollama', 'Custom')
        const adapter = getAdapter(providerType);
        if (!adapter) {
            return {
                valid: false,
                error: `No adapter found for provider type: ${providerType}`,
            };
        }
        // Retrieve API key from Keychain
        // Some providers (Ollama) don't need API keys — validate without one
        const apiKey = await keychainService.getKey(name);
        if (!apiKey) {
            // Try validating without API key — adapter may support it (e.g., Ollama)
            const result = await adapter.validate(baseUrl, '').catch(() => ({
                valid: false,
                error: 'API key not found',
            }));
            if (result.valid) {
                return result;
            }
            return {
                valid: false,
                error: `API key not found for provider: ${name}`,
            };
        }
        // Call adapter's validate() method (per D-23)
        return adapter.validate(baseUrl, apiKey);
    }
    /**
     * Validate all registered providers
     * Logs warnings for failed validations but doesn't throw
     * Used during startup (per D-22)
     */
    async validateAllProviders() {
        const results = new Map();
        const providers = providerService.getProviders();
        for (const provider of providers) {
            if (!provider.enabled) {
                console.log(`[Validator] Skipping disabled provider: ${provider.name}`);
                continue;
            }
            console.log(`[Validator] Validating provider: ${provider.name}...`);
            const result = await this.validateProvider(provider.name, provider.baseUrl);
            results.set(provider.name, result);
            if (result.valid) {
                const modelCount = result.models?.length ?? 'unknown';
                console.log(`[Validator] ✓ ${provider.name} — valid (${modelCount} models)`);
            }
            else {
                console.warn(`[Validator] ✗ ${provider.name} — ${result.error}`);
            }
        }
        return results;
    }
}
// Singleton instance
export const providerValidatorService = new ProviderValidatorService();
//# sourceMappingURL=provider-validator.js.map