/**
 * RetryHandler — p-retry wrapper with error classification for upstream fetch
 */

import pRetry, { AbortError } from 'p-retry';
import { requestLogService } from './requestLog.js';
import { circuitBreakerService } from './circuit-breaker.js';
import { recordCircuitState } from '../metrics/prometheus.js';
import { logger } from '../lib/logger.js';

export function isTransientError(error: unknown): boolean {
  if (error instanceof AbortError) return false;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT');
  }
  return false;
}

export async function fetchWithRetry(
  providerName: string,
  fn: (attemptNumber: number) => Promise<Response>,
): Promise<Response> {
  if (!circuitBreakerService.canRequest(providerName)) {
    throw new Error(`Provider ${providerName} circuit breaker is open`);
  }

  try {
    const response = await pRetry(
      async (attemptNumber) => {
        const response = await fn(attemptNumber);

        if (response.status >= 400 && response.status < 500) {
          const errorText = await response.text().catch(() => '');
          throw new AbortError(
            `Provider ${providerName} returned ${response.status}: ${errorText}`,
          );
        }

        if (!response.ok) {
          throw new Error(`Provider ${providerName} returned ${response.status}`);
        }

        return response;
      },
      {
        retries: 2,
        minTimeout: 1000,
        factor: 2,
        randomize: false,
        onFailedAttempt: (error) => {
          if (!(error instanceof AbortError)) {
            logger.warn(
              { provider: providerName, attempt: error.attemptNumber },
              'Retrying upstream request',
            );
            requestLogService.enrichLastEntry({ retryCount: error.attemptNumber });
          }
        },
      },
    );

    circuitBreakerService.recordSuccess(providerName);
    recordCircuitState(providerName, circuitBreakerService.getState(providerName));
    return response;
  } catch (error) {
    if (!(error instanceof AbortError)) {
      circuitBreakerService.recordFailure(providerName);
      recordCircuitState(providerName, circuitBreakerService.getState(providerName));
    }
    throw error;
  }
}

export { AbortError };
