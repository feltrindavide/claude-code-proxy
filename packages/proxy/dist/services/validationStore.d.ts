/**
 * ValidationStore — persisted validation results store for startup validation UI
 * Phase: 05-reliability-polish
 * Plan: 05-02
 *
 * Per D-70: Warning badges shown on failed providers in Providers page
 * Per D-71: Provider Health card on Status page showing "X of Y providers healthy"
 * Per D-72: Validation warnings persist until user fixes config or dismisses
 *
 * Threat mitigations:
 * - T-05-06: Atomic writes (temp + renameSync) with 0o600 permissions prevent partial writes
 */
import type { ValidationResult } from '../adapters/interface.js';
/**
 * ValidationStoreService — persists provider validation results to disk
 *
 * - setResults: replaces all results and persists
 * - updateResult: updates single provider result with current timestamp
 * - getResults: returns all results as plain object
 * - dismissWarning: sets dismissed flag on provider's result
 * - load/persist: atomic write pattern (temp file + renameSync)
 */
export declare class ValidationStoreService {
    private results;
    private filePath;
    constructor(filePath?: string);
    /**
     * Replace all results and persist to disk
     */
    setResults(results: Map<string, ValidationResult & {
        timestamp: string;
    }>): void;
    /**
     * Update a single provider's result with current timestamp and persist
     */
    updateResult(providerName: string, result: ValidationResult): void;
    /**
     * Return all results as a plain object
     */
    getResults(): Record<string, ValidationResult & {
        timestamp: string;
        dismissed?: boolean;
    }>;
    /**
     * Set dismissed flag on a provider's warning and persist
     */
    dismissWarning(providerName: string): void;
    /**
     * Load results from disk
     * Returns silently if file doesn't exist (graceful first-run)
     */
    private load;
    /**
     * Persist results to disk using atomic write pattern
     * Ensures directory exists with secure permissions, writes to temp file, renames
     */
    private persist;
}
export declare const validationStoreService: ValidationStoreService;
//# sourceMappingURL=validationStore.d.ts.map