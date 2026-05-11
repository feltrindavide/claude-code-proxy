---
phase: "03"
plan: "03"
subsystem: frontend
tags: [status-page, proxy-lifecycle, zustand, health-polling]
dependency:
  requires: ["03-02"]
  provides: ["proxy state management", "status UI", "start/stop controls"]
  affects: ["SidebarHeader", "HomePage"]
tech-stack:
  added: ["zustand", "@tauri-apps/api/core invoke"]
  patterns: ["Zustand store with health polling", "Tauri invoke for lifecycle commands"]
key-files:
  created:
    - apps/web/src/lib/api.ts
    - apps/web/src/stores/proxyStore.ts
    - apps/web/src/components/StatusPage.tsx
    - apps/web/src/components/StatusCard.tsx
    - apps/web/src/components/ProxyControls.tsx
    - apps/web/src/components/ErrorBanner.tsx
  modified:
    - apps/web/src/components/StatusDot.tsx
    - apps/web/src/components/SidebarHeader.tsx
    - apps/web/src/app/page.tsx
decisions:
  - "startProxy/stopProxy use Tauri invoke() not HTTP fetch (per plan review blocker fix)"
  - "Health polling interval: 5 seconds (per D-38)"
  - "Error threshold: 3 consecutive failures before marking error state"
  - "Uptime tracked via startTime field, computed as floor((now - start) / 1000)"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-10T22:30:00Z"
---

# Phase 03 Plan 03: Status Page + Proxy Lifecycle UI Summary

**One-liner:** Real-time proxy health monitoring with Zustand store (5s polling, 3-failure error threshold), Status page with large indicator + 4 metric cards + Start/Stop controls, StatusDot in sidebar header reflecting real state.

---

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | API client + Zustand store | `aed21b97` | `api.ts`, `proxyStore.ts` |
| 2 | Status page + components | `0ef41d8a` | `StatusPage.tsx`, `StatusCard.tsx`, `ProxyControls.tsx`, `ErrorBanner.tsx` |

## Task Details

### Task 1: API Client and Zustand Store
- `api.ts`: `checkHealth()` (HTTP fetch GET /health), `startProxy()` (Tauri `invoke('start_proxy')`), `stopProxy()` (Tauri `invoke('stop_proxy')`), `getProviderCount()` (HTTP fetch GET /admin/providers)
- `proxyStore.ts`: Zustand store with `status`, `port`, `version`, `startTime`, `providerCount`, `consecutiveFailures`, `lastError`, `isStarting`, `isStopping`
- Health polling: increments `consecutiveFailures` on error, resets on success, marks `error` at 3+ failures
- Start/Stop: loading states, error handling, health re-check after start

### Task 2: Status Page Components
- `StatusPage.tsx`: Large status indicator (16px dot + heading), 4 metric cards (Port/Version/Uptime/Providers), 5s health polling with cleanup, empty state for stopped proxy
- `StatusCard.tsx`: Individual metric card with label (11px uppercase), value (18px heading), optional icon
- `ProxyControls.tsx`: State-aware Start/Stop buttons with loading states
- `ErrorBanner.tsx`: Dismissible error banner with red left border, `bg-canvas` (per DESIGN.md hairline-only rule)
- `StatusDot.tsx`: Updated to support `size` prop (`sm` = 8px, `lg` = 16px)
- `SidebarHeader.tsx`: Reads `status` from `useProxyStore`, passes to `StatusDot`
- `page.tsx`: Replaced placeholder with `<StatusPage />`

## Deviations from Plan

None - plan executed exactly as written. Plan review fixes were already incorporated (Tauri invoke for start/stop, bg-canvas for ErrorBanner).

## Known Stubs

None. All components are fully wired to the Zustand store and API client.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag:info_disclosure | `api.ts` | Health endpoint exposes port/version — localhost-only, non-sensitive per T-03-09 |

## Self-Check: PASSED

All created files verified:
- `apps/web/src/lib/api.ts` ✅
- `apps/web/src/stores/proxyStore.ts` ✅
- `apps/web/src/components/StatusPage.tsx` ✅
- `apps/web/src/components/StatusCard.tsx` ✅
- `apps/web/src/components/ProxyControls.tsx` ✅
- `apps/web/src/components/ErrorBanner.tsx` ✅
- `apps/web/src/components/StatusDot.tsx` (modified) ✅
- `apps/web/src/components/SidebarHeader.tsx` (modified) ✅
- `apps/web/src/app/page.tsx` (modified) ✅
