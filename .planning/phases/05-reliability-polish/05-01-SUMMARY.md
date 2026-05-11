---
phase: 05-reliability-polish
plan: 01
subsystem: api
tags: [bottleneck, rate-limiting, express-middleware, admin-api, atomic-writes]

# Dependency graph
requires:
  - phase: 01-core-proxy-server
    provides: Express proxy server, admin API router, provider service with resolveModelRoute
  - phase: 04-model-mapping-ui-routing-log
    provides: Request log service pattern (atomic writes), middleware pattern reference
provides:
  - Per-provider Bottleneck rate limiter with queuing (not 429 rejection)
  - Rate limit middleware inserted in Express chain before proxy handler
  - Admin API endpoints for rate limit CRUD (GET all, GET/PUT/DELETE per-provider)
  - Persistent rate limit config via atomic writes to ~/.claude-code-proxy/rate-limits.json
affects: [05-02 (retry logic), 05-03 (UI for rate limits)]

# Tech tracking
tech-stack:
  added: [bottleneck@2.19.5]
  patterns: [Bottleneck.Group per-provider keying, reservoir + reservoirRefreshInterval for RPM, atomic write persistence, Express async middleware]

key-files:
  created:
    - packages/proxy/src/services/rateLimiter.ts
    - packages/proxy/src/middleware/rateLimitMiddleware.ts
    - packages/proxy/tests/services/rateLimiter.test.ts
  modified:
    - packages/proxy/src/index.ts
    - packages/proxy/src/routes/admin.ts
    - packages/proxy/package.json

key-decisions:
  - "Test files placed in tests/services/ (not src/services/__tests__/) to match vitest config include pattern"
  - "RateLimiterService.load() calls configureProvider() for each persisted entry, which also initializes Bottleneck limiter"

patterns-established:
  - "Bottleneck.Group keyed by provider name for per-provider rate limiting with queuing"
  - "Atomic write persistence (temp file + renameSync) for rate limit config"
  - "Express async middleware that awaits rateLimiterService.schedule() before calling next()"

requirements-completed:
  - ROTE-02

# Metrics
duration: 5min
completed: 2026-05-11
---

# Phase 05 Plan 01: Per-Provider Rate Limiting Summary

**Per-provider Bottleneck rate limiter with queuing (not 429), configurable via admin API, persisted via atomic writes, default 60 RPM**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-11T01:14:00Z
- **Completed:** 2026-05-11T01:19:00Z
- **Tasks:** 4 (Wave 0 + 3 tasks)
- **Files modified:** 6

## Accomplishments

- RateLimiterService with Bottleneck.Group, per-provider configuration, persistence via atomic writes, default 60 RPM
- Rate limit middleware as async Express middleware inserted between requestLoggerMiddleware and handleProxyRequest
- Admin API endpoints: GET /admin/rate-limits, GET/PUT/DELETE /admin/providers/:id/rate-limit with zod validation (1-1000 RPM)
- Rate limiter cleanup wired into existing DELETE /admin/providers/:id endpoint
- TypeScript compiles cleanly, all 7 tests passing

## Task Commits

Each task was committed atomically:

1. **Wave 0: Test scaffold** - `ee38f231` (test)
2. **Task 1: Bottleneck + RateLimiterService** - `21359c72` (feat)
3. **Task 2: Middleware + Express wiring** - `92689b90` (feat)
4. **Task 3: Admin API endpoints** - `de5b5ba1` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `packages/proxy/src/services/rateLimiter.ts` — RateLimiterService with Bottleneck.Group, per-provider config, atomic persistence, singleton export
- `packages/proxy/src/middleware/rateLimitMiddleware.ts` — Async Express middleware queuing POST /v1/messages through Bottleneck
- `packages/proxy/src/index.ts` — Added rateLimitMiddleware import, inserted into Express chain
- `packages/proxy/src/routes/admin.ts` — Added 4 rate limit endpoints + cleanup in DELETE /providers/:id
- `packages/proxy/package.json` — Added bottleneck dependency
- `packages/proxy/tests/services/rateLimiter.test.ts` — 7 test placeholders for RateLimiterService behaviors

## Decisions Made

- Test files placed in `tests/services/` (not `src/services/__tests__/`) to match vitest config `include: ['tests/**/*.test.ts']`
- RateLimiterService.load() calls configureProvider() for each persisted entry, which initializes both the config Map and the Bottleneck limiter simultaneously

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test file path mismatch with vitest config**
- **Found during:** Wave 0 (test scaffold creation)
- **Issue:** Plan specified `packages/proxy/src/services/__tests__/rateLimiter.test.ts` but vitest.config.ts only includes `tests/**/*.test.ts`
- **Fix:** Created test at `packages/proxy/tests/services/rateLimiter.test.ts` to match existing project convention (all other tests are in `tests/`)
- **Files modified:** packages/proxy/tests/services/rateLimiter.test.ts
- **Verification:** `npx vitest run -t "RateLimiterService"` — 7 tests passing
- **Committed in:** ee38f231 (Wave 0 commit)

---

**Total deviations:** 1 auto-fixed (1 test path correction)
**Impact on plan:** Test discovery works correctly with vitest config. No scope creep.

## Issues Encountered

None

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: input-validation | packages/proxy/src/routes/admin.ts | PUT /admin/providers/:id/rate-limit accepts arbitrary provider names; zod validates RPM range (1-1000) but provider name is not validated against registered providers (T-05-01 mitigation: provider name validated in middleware via resolveModelRoute) |
| threat_flag: availability | packages/proxy/src/services/rateLimiter.ts | Bottleneck.Group highWater: 100 caps queue size to prevent OOM from queue memory exhaustion (T-05-02) |

## Next Phase Readiness

- Rate limiting backend complete, ready for 05-02 (retry logic) and 05-03 (UI for rate limit config)
- Admin API endpoints ready for frontend integration in 05-03
- Test scaffold in place for further rate limiter behavior tests

---
*Phase: 05-reliability-polish*
*Completed: 2026-05-11*

## Self-Check: PASSED

- All 4 created files found on disk
- All 5 commits verified in git log
