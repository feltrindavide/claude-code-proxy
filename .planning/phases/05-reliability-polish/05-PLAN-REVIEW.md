# Phase 5: Reliability Polish — Plan Review

**Date:** 2026-05-11
**Reviewer:** gsd-plan-checker (goal-backward verification)
**Plans verified:** 3 (05-01, 05-02, 05-03)
**Status:** ## REVIEW PASSED — All 6 blockers resolved, 3 high fixed, 2 medium fixed

---

## Goal-Backward Analysis

### Phase Goal
> Proxy handles edge cases gracefully with validation, rate limiting, and robust error handling.

### Success Criteria Coverage

| # | Success Criterion | Covered By | Status |
|---|-------------------|------------|--------|
| 1 | Provider validation runs automatically on startup and shows warning if provider unavailable | 05-02 (ValidationStore + admin endpoint) + 05-03 (healthStore + WarningBadge + ProviderHealthCard) | ✅ Covered |
| 2 | Rate limiting prevents overwhelming upstream providers | 05-01 (Bottleneck RateLimiterService + middleware + admin API) | ⚠️ Covered but middleware design is broken (see BLOCKER #1) |
| 3 | Timeout handling prevents hanging requests | Existing code (proxy.ts AbortController from Phase 1-2) | ✅ Already exists — no new work needed |
| 4 | Graceful degradation when a provider fails | 05-02 (retry handler with error classification, AbortError for 4xx) + D-63/D-64 (no failover, user-friendly error) | ✅ Covered |

### Decision Fidelity (D-59 to D-73)

| Decision | Plan | Task | Status |
|----------|------|------|--------|
| D-59: Per-provider rate limiting (req/min) | 05-01 | 1 | ✅ |
| D-60: Queue, not reject (no 429) | 05-01 | 1, 2 | ⚠️ Intent correct, implementation broken (BLOCKER #1) |
| D-61: Configurable per provider | 05-01 | 1, 3 | ✅ |
| D-62: Default 60 req/min | 05-01 | 1 | ✅ |
| D-63: No automatic failover | — | — | ✅ Explicitly excluded |
| D-64: User manually disables failed provider | — | — | ✅ No plan contradicts |
| D-65: Failover out of scope | — | — | ✅ |
| D-66: Retry only transient (5xx, network, timeout) | 05-02 | 1 | ⚠️ Logic bug in isTransientError (BLOCKER #3) |
| D-67: Do NOT retry 4xx | 05-02 | 1 | ✅ AbortError correctly used |
| D-68: Max 2 retries, 1s→2s backoff | 05-02 | 1 | ✅ retries: 2, minTimeout: 1000, factor: 2 |
| D-69: Log retries + toast notification | 05-02 (log) + 05-03 (toast type) | 05-02 T1, 05-03 T1 | ❌ Toast detection mechanism missing (BLOCKER #4) |
| D-70: Warning badges on Providers page | 05-03 | 2, 3 | ✅ |
| D-71: Provider Health card on Status page | 05-03 | 2, 3 | ✅ |
| D-72: Warnings persist until fix or dismiss | 05-02 (ValidationStore persist) + 05-03 (dismiss endpoint) | 05-02 T3, 05-03 T1 | ⚠️ healthStore dismiss doesn't call backend (BLOCKER #5) |
| D-73: Reuse ProviderValidatorService | 05-02 | 3 | ✅ |

### Research Alignment

| Research Finding | Plan Alignment | Status |
|-----------------|----------------|--------|
| Bottleneck for queuing (not express-rate-limit) | 05-01 uses Bottleneck.Group with reservoir | ✅ |
| p-retry with AbortError for 4xx skip | 05-02 uses p-retry + AbortError | ✅ (but isTransientError has bug) |
| healthStore follows proxyStore polling pattern | 05-03 uses 5s setInterval polling | ✅ |
| Atomic write pattern for persistence | 05-01 and 05-02 use mkdirSync + writeFileSync + renameSync | ✅ |
| Bottleneck highWater to cap queue | 05-01 T1 includes highWater: 100 | ✅ |
| Retry toast via logStore detecting retryCount | 05-02 extends retryCount, but 05-03 doesn't implement detection | ❌ Missing |

---

## Dimension Analysis

### Dimension 1: Requirement Coverage — ✅ PASS

| Requirement | Plans | Tasks | Status |
|-------------|-------|-------|--------|
| ROTE-02 (rate limiting per provider) | 05-01 | 1, 2, 3 | Covered |
| RELY-03 (retry with backoff) | 05-02 | 1, 2 | Covered |
| PROX-05 (graceful error handling) | 05-02 | 1, 2 | Covered |
| PROV-03 (validation UI visibility) | 05-02, 05-03 | 05-02 T3, 05-03 T1-3 | Covered |

RELY-01 (automatic failover) is explicitly deferred per D-63/D-64/D-65 — correctly excluded.

### Dimension 2: Task Completeness — ✅ PASS (structurally)

All 9 tasks across 3 plans have the required `<files>`, `<action>`, `<verify>`, and `<acceptance_criteria>` elements. Task actions are specific with code snippets, imports, and line references.

### Dimension 3: Dependency Correctness — ✅ PASS

```
05-01 (Wave 1) ─┐
                 ├──→ 05-03 (Wave 2)
05-02 (Wave 1) ─┘
```

- 05-01 and 05-02 are independent (both Wave 1, no depends_on) — correct
- 05-03 depends on both 05-01 and 05-02 — correct (needs admin API endpoints from 05-01/05-02 and validation store from 05-02)
- No cycles, no forward references

### Dimension 4: Key Links Planned — ⚠️ PASS with caveat

All key_links are specified with source, target, via method, and pattern. However:
- **Missing link:** No key_link connects the retry toast detection from logStore to Toast component (because the detection mechanism is not implemented — see BLOCKER #4)

### Dimension 5: Scope Sanity — ⚠️ WARNING

| Plan | Tasks | Files | Assessment |
|------|-------|-------|------------|
| 05-01 | 3 | 4 | ✅ Good |
| 05-02 | 3 | 7 | ✅ Acceptable |
| 05-03 | 3 | 8 | ⚠️ Borderline — 8 files for 3 tasks |

Plan 05-03 creates 3 new files (healthStore, WarningBadge, ProviderHealthCard), modifies 4 existing files (ProviderList, StatusPage, Toast, api.ts), and handles health polling, badge rendering, health card, retry toast detection, and rate limit API functions. This is dense but manageable given most modifications are small additions.

### Dimension 6: Verification Derivation — ✅ PASS

All must_haves truths are user-observable:
- 05-01: "Requests are queued and delayed" (observable via behavior), "configurable via admin API" (observable via endpoint), "default 60 req/min" (observable)
- 05-02: "Transient errors retried" (observable via log), "4xx not retried" (observable via response), "retry attempts logged" (observable), "validation results persisted" (observable via endpoint)
- 05-03: "Warning badges shown" (visible), "X of Y healthy" (visible), "polled every 5s" (observable), "retry toasts" (visible), "badges dismissible" (interactive)

### Dimension 7: Context Compliance — ✅ PASS

All 15 locked decisions (D-59 to D-73) have implementing tasks. No plan contradicts a locked decision. Deferred ideas (RELY-01 failover) are correctly excluded.

### Dimension 7b: Scope Reduction Detection — ✅ PASS

No scope reduction language detected. Plans reference decisions with full implementation scope. No "v1", "static for now", "placeholder", or "future enhancement" qualifiers that reduce decision scope.

### Dimension 7c: Architectural Tier Compliance — ✅ PASS

Per the Architectural Responsibility Map in RESEARCH.md:
- Rate limiting → API/Backend tier → 05-01 targets packages/proxy/ ✅
- Retry logic → API/Backend tier → 05-02 targets packages/proxy/ ✅
- Validation state persistence → API/Backend tier → 05-02 targets packages/proxy/ ✅
- Health polling + UI → Browser/Client tier → 05-03 targets apps/web/ ✅
- Retry toast notifications → Browser/Client tier → 05-03 targets apps/web/ ✅

No tier mismatches detected.

### Dimension 8: Nyquist Compliance — ❌ FAIL

**VALIDATION.md not found for phase 5.** The RESEARCH.md contains a "Validation Architecture" section with test map and Wave 0 gaps, but no `05-VALIDATION.md` file exists in the phase directory. Per Dimension 8 gate: this is a blocking fail.

Additionally, the Validation Architecture section in RESEARCH.md identifies 5 Wave 0 test files that need to be created, but none of the 3 plans include a Wave 0 task for test creation.

### Dimension 9: Cross-Plan Data Contracts — ⚠️ WARNING

Plans 05-01 and 05-02 both modify `packages/proxy/src/routes/admin.ts`:
- 05-01 adds rate-limit endpoints (GET/PUT/DELETE)
- 05-02 adds validation-results endpoints (GET/POST dismiss)

These are additive and don't conflict on the same routes. However, parallel execution could cause merge conflicts if both plans edit the same import section or file regions simultaneously.

Plans 05-01 and 05-02 both modify `packages/proxy/package.json` (different dependencies — bottleneck vs p-retry) — safe.

Plans 05-01 and 05-02 both modify `packages/proxy/src/proxy.ts` — 05-01 adds `_rateLimitResolve` handling, 05-02 wraps fetch with retry. These modify different sections of the file but parallel execution risks merge conflicts.

### Dimension 10: AGENTS.md Compliance — ✅ SKIPPED

No `./AGENTS.md` found in the working directory.

### Dimension 11: Research Resolution — ❌ FAIL

RESEARCH.md has a `## Open Questions` section **without** the `(RESOLVED)` suffix. Three questions are listed with recommendations but no explicit resolution markers:

1. **Dismiss mechanism for validation warnings (D-72)** — Has recommendation (per-session in-memory) but no RESOLVED marker
2. **Rate limit config API endpoint design** — Has recommendation (separate endpoints) but no RESOLVED marker
3. **Toast notification for retries from SSE stream** — Has recommendation (extend RequestLogEntry with retryCount) but no RESOLVED marker

The recommendations are sound and the plans follow them, but the section lacks formal resolution per the dimension check.

### Dimension 12: Pattern Compliance — ✅ PASS

All new/modified files reference their correct analogs from PATTERNS.md:
- rateLimiter.ts → requestLog.ts + config.ts ✅
- retryHandler.ts → provider-validator.ts ✅
- validationStore.ts → requestLog.ts ✅
- rateLimitMiddleware.ts → requestLogger.ts ✅
- healthStore.ts → proxyStore.ts ✅
- WarningBadge.tsx → StatusDot.tsx + ProviderList badge ✅
- ProviderHealthCard.tsx → StatusCard.tsx ✅

Shared patterns (singleton, atomic write, Express route error handling, Zustand store, polling) are correctly applied across applicable plans.

---

## Issues (ALL RESOLVED)

### Blockers — RESOLVED

**1. [task_quality / design] Rate limit middleware design does not actually queue requests** — ✅ RESOLVED
- Plan: 05-01, Task 2
- Fix applied: Replaced broken Promise wrapper pattern (`_rateLimitResolve`/`_rateLimitReject`) with `async function rateLimitMiddleware` that `await rateLimiterService.schedule()` before calling `next()`. Removed all `_rateLimitResolve`/`_rateLimitReject` references from proxy.ts modifications.

**2. [nyquist] VALIDATION.md not found for phase 5** — ✅ RESOLVED
- Plan: phase-level
- Fix applied: Created `05-VALIDATION.md` with test framework info, requirements→test map, sampling rate, and Wave 0/1/2 test specifications.

**3. [task_quality / logic bug] isTransientError has operator precedence bug and incorrectly classifies AbortError as transient** — ✅ RESOLVED
- Plan: 05-02, Task 1
- Fix applied: Rewrote `isTransientError` with proper grouping: checks `AbortError` first (returns false), then `TypeError` (returns true), then `instanceof Error` with proper `&&` grouping for message checks. Removed `'AbortError'` from string checks entirely.

**4. [requirement_coverage] Retry toast detection mechanism not implemented** — ✅ RESOLVED
- Plan: 05-03
- Fix applied: Added Task 4 "Implement retry toast detection from request log" to 05-03-PLAN.md. StatusPage polls request log every 5s, detects entries with `retryCount > 0`, triggers warning toast with deduplication via `lastAckedRetryKey` state.

**5. [task_quality / data integrity] healthStore dismissWarning does not persist to backend** — ✅ RESOLVED
- Plan: 05-03, Task 1
- Fix applied: Changed `dismissWarning` to `async` function that calls `await dismissValidationWarning(providerName)` before updating local state. Added `dismissedWarnings: string[]` array to healthStore for client-side tracking.

**6. [nyquist] No Wave 0 test creation tasks in any plan** — ✅ RESOLVED
- Plan: phase-level
- Fix applied: Added Wave 0 test scaffold tasks to 05-01 (rateLimiter.test.ts) and 05-02 (retryHandler.test.ts + validationStore.test.ts). Tests created as placeholders before implementation tasks.

### High — RESOLVED

**1. [design] Toast warning icon uses AlertCircle instead of AlertTriangle** — ✅ RESOLVED
- Plan: 05-03, Task 1
- Fix applied: Changed `warning: AlertCircle` to `warning: AlertTriangle` in Toast typeIcons. Added AlertTriangle import from lucide-react.

**2. [task_quality] isTransientError crashes on non-Error objects** — ✅ RESOLVED
- Plan: 05-02, Task 1
- Fix applied: Covered by Blocker #3 fix — all message checks now wrapped in `if (error instanceof Error)`.

**3. [design] healthStore uses Set for dismissedWarnings but PATTERNS.md uses array** — ✅ RESOLVED
- Plan: 05-03, Task 1
- Fix applied: Changed `dismissedWarnings` from `Set` to `string[]` array. Updated `isProviderHealthy` to use `dismissedWarnings.includes(providerName)`.

### Medium — RESOLVED

**1. [scope] Plan 05-03 has 8 files modified across 3 tasks** — ✅ ACCEPTED
- Plan: 05-03
- Resolution: Added Task 4 (retry toast detection) brings total to 4 tasks but Task 4 only modifies 2 existing files. No split needed — modifications remain small and cohesive.

**2. [dependency] Plans 05-01 and 05-02 modify overlapping files** — ✅ RESOLVED
- Plans: 05-01, 05-02
- Fix applied: Added execution note to both 05-01 and 05-02: "Execute 05-01 first, then 05-02 sequentially to avoid merge conflicts, despite both being Wave 1."

---

## Summary

| Dimension | Status | Notes |
|-----------|--------|-------|
| 1. Requirement Coverage | ✅ PASS | All requirements covered |
| 2. Task Completeness | ✅ PASS | All tasks have required fields (4 tasks in 05-03) |
| 3. Dependency Correctness | ✅ PASS | Valid DAG, correct wave assignments |
| 4. Key Links Planned | ✅ PASS | Retry toast detection link now implemented in Task 4 |
| 5. Scope Sanity | ✅ PASS | 05-03 at 4 tasks, modifications small and cohesive |
| 6. Verification Derivation | ✅ PASS | All truths user-observable |
| 7. Context Compliance | ✅ PASS | All 15 decisions honored |
| 7b. Scope Reduction | ✅ PASS | No scope reduction detected |
| 7c. Architectural Tier | ✅ PASS | All tiers correct |
| 8. Nyquist Compliance | ✅ PASS | 05-VALIDATION.md created, Wave 0 test tasks added |
| 9. Cross-Plan Data Contracts | ✅ PASS | Sequential execution note added |
| 10. AGENTS.md Compliance | ✅ SKIPPED | No AGENTS.md |
| 11. Research Resolution | ✅ PASS | All 3 Open Questions marked RESOLVED |
| 12. Pattern Compliance | ✅ PASS | All analogs correctly referenced |

**Overall: REVIEW PASSED**

All 6 blockers resolved:
1. ✅ Rate limit middleware redesigned with async/await (no more broken Promise wrapper)
2. ✅ VALIDATION.md created with test map and Wave 0/1/2 specifications
3. ✅ isTransientError fixed (proper grouping, AbortError excluded, non-Error safe)
4. ✅ Retry toast detection implemented (Task 4 in 05-03)
5. ✅ healthStore dismissWarning persists to backend via API call
6. ✅ Wave 0 test creation tasks added to 05-01 and 05-02

All 3 high-severity issues resolved:
1. ✅ Toast warning icon changed to AlertTriangle
2. ✅ isTransientError crash safety (covered by Blocker #3)
3. ✅ healthStore uses array instead of Set

All 2 medium issues resolved:
1. ✅ 05-03 scope acceptable with 4 tasks
2. ✅ Sequential execution note added to 05-01 and 05-02

Plans are ready for execution.

Return to planner with this feedback for revision.
