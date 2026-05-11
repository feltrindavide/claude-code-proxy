---
phase: 05-reliability-polish
plan: 03
subsystem: ui
tags: [zustand, health-store, warning-badge, provider-health-card, toast, polling]

# Dependency graph
requires:
  - phase: 05-reliability-polish (05-01)
    provides: Rate limiter backend, admin API endpoints for rate limits
  - phase: 05-reliability-polish (05-02)
    provides: Validation results API, retryCount in request log, validation-store persistence
provides:
  - healthStore Zustand store with 5s polling and dismissWarning persistence
  - WarningBadge component with Cursor brand semantic-error styling
  - ProviderHealthCard component showing X/Y healthy count on Status page
  - Toast system extended with 'warning' type using AlertTriangle icon
  - ProviderList shows warning badges for unhealthy providers
  - StatusPage shows ProviderHealthCard and retry toast detection from request log
  - API functions: fetchValidationResults, dismissValidationWarning, getRateLimit, setRateLimit, fetchRecentLogs
affects: [future UI polish, settings page for rate limit config]

# Tech tracking
tech-stack:
  added: []
  patterns: [Zustand polling pattern (5s interval), dismissWarning persists to backend before local state update, array-based dismissedWarnings (not Set) for serialization, StatusCard valueColor prop for conditional coloring]

key-files:
  created:
    - apps/web/src/stores/healthStore.ts
    - apps/web/src/components/WarningBadge.tsx
    - apps/web/src/components/ProviderHealthCard.tsx
  modified:
    - apps/web/src/lib/api.ts
    - apps/web/src/components/Toast.tsx
    - apps/web/src/components/ProviderList.tsx
    - apps/web/src/components/StatusPage.tsx
    - apps/web/src/components/StatusCard.tsx

key-decisions:
  - "Retry toast deduplication uses timestamp (not id) since RequestLogEntry may not have id field"
  - "Task 4 (retry toast) changes were committed as part of Task 3 since both modify StatusPage.tsx"
  - "dismissedWarnings uses plain array instead of Set for React serialization compatibility (Pitfall 5 from RESEARCH.md)"

patterns-established:
  - "healthStore follows proxyStore polling pattern with 5s setInterval"
  - "WarningBadge uses Cursor brand tokens: bg-semantic-error/10, text-semantic-error, rounded-pill"
  - "ProviderHealthCard wraps StatusCard with conditional valueColor (success vs error)"
  - "Retry toast detection polls request log every 5s, deduplicates via lastAckedRetryKey state"

requirements-completed:
  - PROV-03

# Metrics
duration: 8min
completed: 2026-05-11
---

# Phase 05 Plan 03: Provider Health UI Summary

**Frontend Provider Health UI: warning badges on Providers page, Provider Health card on Status page, healthStore with 5s polling, retry toast detection, and rate limit API functions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-11T01:34:00Z
- **Completed:** 2026-05-11T01:42:00Z
- **Tasks:** 4
- **Files modified:** 8

## Accomplishments

- healthStore created with Zustand polling pattern, dismissWarning persists to backend via API call, dismissedWarnings uses array (not Set) for serialization
- WarningBadge component with Cursor brand semantic-error styling (bg-semantic-error/10, text-semantic-error, rounded-pill, AlertTriangle icon)
- ProviderHealthCard wraps StatusCard with healthyCount/totalCount display and conditional valueColor
- Toast system extended with 'warning' type using AlertTriangle icon and semantic-error border
- ProviderList shows warning badges for unhealthy providers with 5s validation polling
- StatusPage shows ProviderHealthCard as 5th metric card (hidden when no providers exist)
- Retry toast detection polls request log every 5s for entries with retryCount > 0, triggers warning toast, deduplicates via timestamp-based lastAckedRetryKey
- API functions added: fetchValidationResults, dismissValidationWarning, getRateLimit, setRateLimit, fetchRecentLogs
- RequestLogEntry extended with retryCount field
- StatusCard extended with optional valueColor prop for conditional text coloring
- TypeScript compiles cleanly in all modified files (pre-existing error in ModelMappingForm.tsx unrelated)

## Task Commits

Each task was committed atomically:

1. **Task 1: healthStore + Toast warning + API functions** - `788d9a17` (feat)
2. **Task 2: WarningBadge + ProviderHealthCard components** - `b7d6aa11` (feat)
3. **Task 3: Wire health UI into ProviderList + StatusPage** - `ff79bd96` (feat)
4. **Task 4: Retry toast detection** - committed within Task 3 (both modify StatusPage.tsx)

## Files Created/Modified

- `apps/web/src/stores/healthStore.ts` — Zustand store with pollValidation, dismissWarning (persists to backend), isProviderHealthy, getProviderError
- `apps/web/src/components/WarningBadge.tsx` — Warning badge with semantic-error/10 bg, AlertTriangle icon, Cursor brand typography
- `apps/web/src/components/ProviderHealthCard.tsx` — StatusCard wrapper showing "X of Y" with conditional valueColor
- `apps/web/src/lib/api.ts` — Added fetchValidationResults, dismissValidationWarning, getRateLimit, setRateLimit, fetchRecentLogs; RequestLogEntry extended with retryCount
- `apps/web/src/components/Toast.tsx` — Extended ToastType with 'warning', added AlertTriangle icon and semantic-error border style
- `apps/web/src/components/ProviderList.tsx` — Added healthStore polling, conditional WarningBadge for unhealthy providers
- `apps/web/src/components/StatusPage.tsx` — Added ProviderHealthCard, health polling, retry toast detection from request log
- `apps/web/src/components/StatusCard.tsx` — Added optional valueColor prop for conditional value text coloring

## Decisions Made

- Retry toast deduplication uses `timestamp` field instead of `id` since RequestLogEntry may not have an id field — timestamp is always present and unique per entry
- Task 4 (retry toast detection) changes were committed as part of Task 3's commit since both modify StatusPage.tsx — avoids interleaved commits on the same file
- dismissedWarnings uses plain array instead of Set for React serialization compatibility (per Pitfall 5 from RESEARCH.md)
- WarningBadge uses semantic-error color (#cf2d56) for warnings, matching DESIGN.md guidance that timeline pastels are restricted to agent visualizations only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript error in ModelMappingForm.tsx (TS2345: claudeTier type mismatch) — unrelated to this plan's changes, not fixed (out of scope per deviation scope boundary rules)

## Next Phase Readiness

- Provider Health UI complete, all acceptance criteria met
- Rate limit config API functions ready for Settings page integration (future plan)
- Retry toast detection wired up, depends on backend retryCount being set by retryHandler (05-02)
- Ready for 05-04 (if any) or phase verification

---
*Phase: 05-reliability-polish*
*Completed: 2026-05-11*

## Self-Check: PASSED

- All 3 created files found on disk
- All 5 modified files found on disk
- All 3 commits verified in git log
