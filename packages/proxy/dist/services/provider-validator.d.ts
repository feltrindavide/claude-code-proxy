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
/**
 * ProviderValidatorService — validates provider connectivity
 * using the appropriate adapter's validate() method
 */
export declare class ProviderValidatorService {
    /**
     * Validate a single provider's connectivity
     * @param name — provider name (used to look up adapter and API key)
     * @param baseUrl — provider base URL to validate against
     */
    validateProvider(name: string, baseUrl: string): Promise<ValidationResult>;
    /**
     * Validate all registered providers
     * Logs warnings for failed validations but doesn't throw
     * Used during startup (per D-22)
     */
    validateAllProviders(): Promise<Map<string, ValidationResult>>;
}
export declare const providerValidatorService: ProviderValidatorService;
//# sourceMappingURL=provider-validator.d.ts.map