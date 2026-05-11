---
phase: 05-reliability-polish
plan: 02
subsystem: api
tags: [p-retry, retry-handler, exponential-backoff, validation-store, atomic-writes, admin-api]

# Dependency graph
requires:
  - phase: 01-core-proxy-server
    provides: Express proxy server, admin API router, provider service, keychain service
  - phase: 02-sse-streaming-integration
    provides: proxy.ts handleProxyRequest with upstream fetch, adapter timeouts
  - phase: 04-model-mapping-ui-routing-log
    provides: RequestLogService with enrichLastEntry pattern, atomic write persistence
  - phase: 05-reliability-polish (05-01)
    provides: Rate limiter service, rate limit admin endpoints
provides:
  - RetryHandler service with p-retry wrapper (fetchWithRetry, isTransientError)
  - 5xx errors retried up to 2x with 1s→2s exponential backoff
  - 4xx errors returned immediately via AbortError (no retry)
  - Retry attempts logged to request log via retryCount field
  - ValidationStore service with persisted validation results (atomic writes)
  - Admin API: GET/POST /admin/validation-results endpoints
  - Startup validation results persisted to ~/.claude-code-proxy/validation-results.json
affects: [05-03 (UI for validation warnings, retry toasts)]

# Tech tracking
tech-stack:
  added: [p-retry@^8.0.0]
  patterns: [p-retry AbortError for non-retryable errors, onFailedAttempt callback for logging, atomic write persistence for validation store, retry count signaling via req._retryAttempt]

key-files:
  created:
    - packages/proxy/src/services/retryHandler.ts
    - packages/proxy/src/services/validationStore.ts
    - packages/proxy/tests/services/retryHandler.test.ts
    - packages/proxy/tests/services/validationStore.test.ts
  modified:
    - packages/proxy/src/types/index.ts
    - packages/proxy/src/proxy.ts
    - packages/proxy/src/index.ts
    - packages/proxy/src/routes/admin.ts
    - packages/proxy/package.json
    - packages/proxy/package-lock.json

key-decisions:
  - "AbortController moved inside retry callback so each retry attempt gets fresh timeout"
  - "Catch block retained around fetchWithRetry to handle 4xx AbortError and exhausted retries"
  - "Timestamps added to validation results in index.ts before passing to setResults (type mismatch fix)"
  - "Test files placed in tests/services/ to match vitest include pattern (established in 05-01)"

patterns-established:
  - "p-retry with AbortError for 4xx classification — never retry client errors"
  - "fetchWithRetry accepts providerName + callback fn pattern for flexible upstream wrapping"
  - "ValidationStore follows RequestLogService atomic write pattern (temp + renameSync)"
  - "Retry count signaled via req._retryAttempt for downstream middleware consumption"

requirements-completed:
  - RELY-03
  - PROX-05

# Metrics
duration: 10min
completed: 2026-05-11
---

# Phase 05 Plan 02: Retry Logic & Validation Store Summary

**Retry handler with p-retry (2 retries, 1s→2s backoff, 4xx skip) and persisted validation results store with admin API endpoints**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-11T01:19:00Z
- **Completed:** 2026-05-11T01:29:00Z
- **Tasks:** 4 (Wave 0 + 3 tasks)
- **Files modified:** 10

## Accomplishments

- RetryHandler service created with fetchWithRetry and isTransientError using p-retry
- 5xx errors retried up to 2 times with exponential backoff (1s → 2s)
- 4xx errors classified as AbortError and returned immediately without retry
- Retry attempts logged to request log via requestLogService.enrichLastEntry({ retryCount })
- proxy.ts upstream fetch wrapped with fetchWithRetry, AbortController inside retry callback
- RequestLogEntry type extended with retryCount field
- ValidationStore service created with atomic write persistence to ~/.claude-code-proxy/validation-results.json
- Startup validation results persisted with timestamps for UI display
- Admin API endpoints: GET /admin/validation-results, POST /admin/validation-results/:id/dismiss
- TypeScript compiles cleanly, all test scaffolds in place

## Task Commits

Each task was committed atomically:

1. **Wave 0: Test scaffolds** - `3a897adb` (test)
2. **Task 1: p-retry + RetryHandler + retryCount type** - `0eb56313` (feat)
3. **Task 2: proxy.ts fetch wrapped with retry** - `8d61fb9f` (feat)
4. **Task 3: ValidationStore + admin endpoints** - `a253e6fd` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `packages/proxy/src/services/retryHandler.ts` — fetchWithRetry with p-retry, isTransientError, AbortError re-export
- `packages/proxy/src/services/validationStore.ts` — ValidationStoreService with atomic persistence, singleton export
- `packages/proxy/src/types/index.ts` — RequestLogEntry extended with retryCount?: number
- `packages/proxy/src/proxy.ts` — Upstream fetch wrapped with fetchWithRetry, AbortController in callback
- `packages/proxy/src/index.ts` — validationStoreService.setResults wired into loadConfigOnStartup
- `packages/proxy/src/routes/admin.ts` — GET/POST /admin/validation-results endpoints
- `packages/proxy/package.json` — Added p-retry@^8.0.0 dependency
- `packages/proxy/tests/services/retryHandler.test.ts` — 11 test placeholders for retry behaviors
- `packages/proxy/tests/services/validationStore.test.ts` — 5 test placeholders for store behaviors

## Decisions Made

- AbortController moved inside retry callback so each retry attempt gets a fresh timeout (prevents stale abort signals)
- Catch block retained around fetchWithRetry to handle 4xx AbortError responses and exhausted retry scenarios
- Timestamps added to validation results in index.ts before passing to setResults (ValidationResult type from provider-validator doesn't include timestamp)
- Test files placed in tests/services/ (not src/services/__tests__/) to match vitest config include pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test file path mismatch with vitest config**
- **Found during:** Wave 0 (test scaffold creation)
- **Issue:** Plan specified `packages/proxy/src/services/__tests__/` but vitest.config.ts only includes `tests/**/*.test.ts`
- **Fix:** Created tests at `packages/proxy/tests/services/retryHandler.test.ts` and `packages/proxy/tests/services/validationStore.test.ts` to match existing project convention
- **Files modified:** packages/proxy/tests/services/retryHandler.test.ts, packages/proxy/tests/services/validationStore.test.ts
- **Verification:** vitest include pattern matches `tests/**/*.test.ts`
- **Committed in:** 3a897adb (Wave 0 commit)

**2. [Rule 3 - Blocking] Type mismatch between validateAllProviders and setResults**
- **Found during:** Task 3 (ValidationStore integration)
- **Issue:** `validateAllProviders()` returns `Map<string, ValidationResult>` but `setResults()` expects `Map<string, ValidationResult & { timestamp: string }>` — TypeScript compilation error
- **Fix:** Map validation results to include timestamps before passing to setResults in index.ts
- **Files modified:** packages/proxy/src/index.ts
- **Verification:** `npx tsc --noEmit` passes with no errors
- **Committed in:** a253e6fd (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 test path correction, 1 type mismatch fix)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered

None

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: availability | packages/proxy/src/services/retryHandler.ts | Max 2 retries (D-68) caps amplification at 3x; AbortError for 4xx prevents retry storms on auth failures (T-05-05) |
| threat_flag: tampering | packages/proxy/src/services/validationStore.ts | Atomic writes (temp + renameSync) with 0o600 permissions prevent partial writes and unauthorized reads (T-05-06) |
| threat_flag: repudiation | packages/proxy/src/services/retryHandler.ts | Every retry logged via requestLogService.enrichLastEntry({ retryCount }) — visible in routing log (T-05-08) |

## Next Phase Readiness

- Retry logic backend complete, ready for 05-03 (UI for validation warnings, retry toasts)
- Validation results API ready for frontend healthStore polling
- Test scaffolds in place for retry handler and validation store behavior tests
- retryCount field available in request log for frontend retry toast detection

---
*Phase: 05-reliability-polish*
*Completed: 2026-05-11*

## Self-Check: PASSED

- All 4 created files found on disk
- All 5 modified files found on disk
- All 5 commits verified in git log
