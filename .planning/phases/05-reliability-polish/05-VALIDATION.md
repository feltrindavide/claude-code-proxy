# Phase 5: Reliability Polish — Validation Strategy

**Phase:** 05-reliability-polish
**Date:** 2026-05-11
**Status:** Active

## Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^3.2.4 |
| Config file | `packages/proxy/vitest.config.ts` |
| Quick run command | `cd packages/proxy && npx vitest run -t "rate|retry|health" --reporter=verbose` |
| Full suite command | `cd packages/proxy && npx vitest run` |

## Requirements → Test Map

| Req ID | Behavior | Test Type | Test File |
|--------|----------|-----------|-----------|
| ROTE-02 | Per-provider rate limiting queues requests (not 429) | unit | `rateLimiter.test.ts` |
| RELY-03 | Retry only transient errors (5xx, network, timeout) | unit | `retryHandler.test.ts` |
| RELY-03 | Max 2 retries with 1s→2s backoff | unit | `retryHandler.test.ts` |
| PROX-05 | Graceful error handling with retry | unit | `retryHandler.test.ts` |
| PROV-03 | Validation warnings shown as badges in UI | unit | `healthStore.test.ts` |
| PROV-03 | Provider Health card shows X/Y healthy | unit | `healthStore.test.ts` |

## Sampling Rate

- **Per task commit:** `cd packages/proxy && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd packages/proxy && npx vitest run`
- **Phase gate:** Full suite green (59+ tests) before `/gsd-verify-work`

## Wave 0: Test Scaffolds

These test files must be created before implementation tasks begin:

| # | File | Covers | Plan |
|---|------|--------|------|
| 1 | `packages/proxy/src/services/__tests__/rateLimiter.test.ts` | Per-provider rate limiting, queuing behavior, reservoir refresh, persistence, default 60 RPM | 05-01 |
| 2 | `packages/proxy/src/services/__tests__/retryHandler.test.ts` | Transient vs permanent error classification, backoff timing, max retries, AbortError skip | 05-02 |
| 3 | `packages/proxy/src/services/__tests__/validationStore.test.ts` | Persistence, retrieval, dismiss, admin endpoint | 05-02 |

Note: Frontend tests (`healthStore.test.ts`) are deferred to Wave 2 since they depend on backend APIs from Wave 1.

## Wave 1: Unit Tests (after 05-01 and 05-02)

| Test | Description |
|------|-------------|
| `rateLimiter.test.ts` | - `configureProvider` sets correct Bottleneck settings<br>- `schedule` queues requests when rate limit exceeded<br>- `getRateLimit` returns configured or default value<br>- `getAllRateLimits` returns all configured limits<br>- `removeProvider` cleans up limiter and config<br>- `persist` / `load` round-trip via atomic writes<br>- Default RPM is 60 |
| `retryHandler.test.ts` | - `isTransientError` returns true for TypeError (network)<br>- `isTransientError` returns true for ECONNRESET/ETIMEDOUT<br>- `isTransientError` returns false for AbortError<br>- `isTransientError` returns false for non-Error objects<br>- `isTransientError` returns false for 4xx errors<br>- `fetchWithRetry` retries on 5xx<br>- `fetchWithRetry` does NOT retry on 4xx (AbortError)<br>- `fetchWithRetry` logs retryCount on retry<br>- `fetchWithRetry` respects max 2 retries |
| `validationStore.test.ts` | - `setResults` stores and persists results<br>- `getResults` returns all results<br>- `dismissWarning` sets dismissed flag and persists<br>- `load` / `persist` round-trip via atomic writes<br>- Graceful first-run (no file) returns empty |

## Wave 2: Integration Tests (after 05-03)

| Test | Description |
|------|-------------|
| `healthStore.test.ts` | - `pollValidation` fetches from API and updates state<br>- `dismissWarning` calls backend API and updates local state<br>- `isProviderHealthy` respects dismissedWarnings array<br>- `isProviderHealthy` returns true for unknown providers |

## Acceptance Criteria

- [ ] All Wave 0 test files created before implementation
- [ ] `npx vitest run` passes with 59+ tests (existing 59 + new tests)
- [ ] No test failures, no skipped tests
- [ ] Test coverage for new services (rateLimiter, retryHandler, validationStore) > 80%
