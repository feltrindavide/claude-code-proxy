/**
 * ProviderValidatorService — validates provider connectivity on save and startup
 * Phase: 02-sse-streaming-integration
 * Plan: 02-03, Task 1
 *
 * Per D-22: Validate on save AND on startup
 * Per D-23: Per-adapter validate() method
 * Per D-24: Default: GET /v1/models, with per-adapter fallback
 */

import type { ValidationResult } from '../adapters/interface.js';
import { getAdapter } from '../adapters/index.js';
import { getKey } from './keychain.js';
import { providerService } from './provider.js';
import { contextRegistry } from './context-registry.js';

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
  async validateProvider(
    name: string,
    baseUrl: string,
  ): Promise<ValidationResult> {
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
    const apiKey = await getKey(name);

    // Ollama-type providers: skip API key check, just test connectivity
    if (providerType === 'Ollama' || providerType === 'ollama') {
      const result = await adapter.validate(baseUrl, apiKey || '').catch(() => ({
        valid: false,
        error: 'Could not connect to Ollama server',
      }));
      return result;
    }

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
   * Validate provider credentials without persisting config (dry-run for UI test button).
   */
  async validateProviderInline(
    providerType: string,
    baseUrl: string,
    apiKey?: string,
  ): Promise<ValidationResult> {
    const adapter = getAdapter(providerType);
    if (!adapter) {
      return {
        valid: false,
        error: `No adapter found for provider type: ${providerType}`,
      };
    }

    const normalizedType = providerType.toLowerCase();
    if (normalizedType === 'ollama') {
      return adapter.validate(baseUrl, apiKey || '').catch(() => ({
        valid: false,
        error: 'Could not connect to Ollama server',
      }));
    }

    if (!apiKey?.trim()) {
      return {
        valid: false,
        error: 'API key is required for this provider type',
      };
    }

    return adapter.validate(baseUrl, apiKey);
  }

  /**
   * Validate all registered providers
   * Logs warnings for failed validations but doesn't throw
   * Used during startup (per D-22)
   */
  async validateAllProviders(): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();
    const providers = providerService.getProviders();

    for (const provider of providers) {
      if (!provider.enabled) {
        console.log(
          `[Validator] Skipping disabled provider: ${provider.name}`,
        );
        continue;
      }

      console.log(`[Validator] Validating provider: ${provider.name}...`);
      const result = await this.validateProvider(
        provider.name,
        provider.baseUrl,
      );
      results.set(provider.name, result);

      if (result.valid) {
        const modelCount = result.models?.length ?? 'unknown';
        console.log(
          `[Validator] ✓ ${provider.name} — valid (${modelCount} models)`,
        );
        // Auto-detect model context windows from validation response
        if (result.modelContexts) {
          contextRegistry.updateModelContexts(provider.name, result.modelContexts);
          const ctxCount = Object.keys(result.modelContexts).length;
          console.log(`[Validator]   ↳ updated ${ctxCount} model context windows`);
        }
      } else {
        console.warn(
          `[Validator] ✗ ${provider.name} — ${result.error}`,
        );
      }
    }

    return results;
  }
}

// Singleton instance
export const providerValidatorService = new ProviderValidatorService();
