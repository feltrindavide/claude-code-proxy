/**
 * RetryHandler — p-retry wrapper with error classification for upstream fetch
 * Phase: 05-reliability-polish
 * Plan: 05-02
 *
 * Per D-66: Retry only transient errors (5xx, network, timeout)
 * Per D-67: Do NOT retry 4xx client errors (AbortError)
 * Per D-68: Max 2 retries with exponential backoff: 1s then 2s
 * Per D-69: Log retry attempts via requestLogService.enrichLastEntry
 *
 * Threat mitigations:
 * - T-05-05: Max 2 retries caps amplification at 3x; AbortError for 4xx prevents retry storms
 * - T-05-08: Every retry logged via requestLogService.enrichLastEntry({ retryCount })
 */
import { AbortError } from 'p-retry';
/**
 * Classify whether an error is transient (retryable) or permanent (non-retryable)
 *
 * Transient: TypeError (network error), ECONNRESET, ETIMEDOUT
 * Permanent: AbortError (4xx client errors, explicit aborts), non-Error objects
 */
export declare function isTransientError(error: unknown): boolean;
/**
 * Wrap an upstream fetch with retry logic using p-retry
 *
 * - 5xx errors: retried up to 2 times with 1s → 2s backoff (D-66, D-68)
 * - 4xx errors: thrown as AbortError, NOT retried (D-67)
 * - Network errors (TypeError): retried (D-66)
 * - Each retry attempt logged to request log (D-69)
 */
export declare function fetchWithRetry(providerName: string, fn: (attemptNumber: number) => Promise<Response>): Promise<Response>;
export { AbortError };
//# sourceMappingURL=retryHandler.d.ts.map