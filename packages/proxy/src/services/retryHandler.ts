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

import pRetry, { AbortError } from 'p-retry';
import { requestLogService } from './requestLog.js';

/**
 * Classify whether an error is transient (retryable) or permanent (non-retryable)
 *
 * Transient: TypeError (network error), ECONNRESET, ETIMEDOUT
 * Permanent: AbortError (4xx client errors, explicit aborts), non-Error objects
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof AbortError) return false; // Never retry AbortError (D-67)
  if (error instanceof TypeError) return true; // network error
  if (error instanceof Error) {
    return error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT');
  }
  return false;
}

/**
 * Wrap an upstream fetch with retry logic using p-retry
 *
 * - 5xx errors: retried up to 2 times with 1s → 2s backoff (D-66, D-68)
 * - 4xx errors: thrown as AbortError, NOT retried (D-67)
 * - Network errors (TypeError): retried (D-66)
 * - Each retry attempt logged to request log (D-69)
 */
export async function fetchWithRetry(
  providerName: string,
  fn: (attemptNumber: number) => Promise<Response>,
): Promise<Response> {
  return pRetry(
    async (attemptNumber) => {
      const response = await fn(attemptNumber);

      // D-67: Do NOT retry 4xx (permanent errors)
      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text().catch(() => '');
        throw new AbortError(
          `Provider ${providerName} returned ${response.status}: ${errorText}`,
        );
      }

      // 5xx: throw regular Error to trigger retry (D-66)
      if (!response.ok) {
        throw new Error(`Provider ${providerName} returned ${response.status}`);
      }

      return response;
    },
    {
      retries: 2,           // D-68: max 2 retries
      minTimeout: 1000,     // D-68: 1s first delay
      factor: 2,            // D-68: 1s -> 2s backoff
      randomize: false,     // Deterministic backoff
      onFailedAttempt: (error) => {
        if (!(error instanceof AbortError)) {
          // D-69: log retry in routing log
          console.log(`[Proxy] Retrying request to ${providerName} (attempt ${error.attemptNumber}/2)`);
          requestLogService.enrichLastEntry({ retryCount: error.attemptNumber });
        }
      },
    },
  );
}

export { AbortError };
