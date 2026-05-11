# Phase 3: Desktop UI Shell — Plan Review

**Date:** 2026-05-10
**Plans Verified:** 4 (03-01 through 03-04)
**Status:** REVIEW PASSED — all plans meet quality bar
**Issues:** 0 blocker(s), 0 warning(s), 1 info

---

## Resolution Summary

All 1 blocker and 3 warnings from the initial review have been resolved:

### Blocker Fixed
1. **Proxy start/stop endpoint mismatch** — Plan 03's `startProxy()` and `stopProxy()` now use `invoke('start_proxy')` and `invoke('stop_proxy')` from `@tauri-apps/api/core` instead of HTTP fetch to non-existent endpoints. Acceptance criteria updated to match.

### Warnings Fixed
2. **Phantom store files** — Removed `providerStore.ts` and `mappingStore.ts` from Plan 04's `files_modified` and `must_haves.artifacts`.
3. **Toast shadow-sm** — Replaced `shadow-sm` with `border border-hairline` in Plan 04's Toast component, consistent with DESIGN.md's hairline-only depth rule.
4. **ErrorBanner bg-red-50** — Replaced `bg-red-50` with `bg-canvas` in Plan 03's ErrorBanner, using brand-appropriate color.

---

## Goal-Backward Verification

### Phase Goal
> User has a native macOS application with provider configuration UI.

### Success Criteria Trace

| # | Success Criterion | Plans | Status |
|---|-------------------|-------|--------|
| 1 | macOS app launches, shows status indicator | 01 (Tauri shell) + 03 (StatusDot + polling) | COVERED |
| 2 | User can start/stop proxy from UI | 01 (Rust commands) + 03 (UI controls) | **BROKEN** — endpoint mismatch |
| 3 | Access to provider config screens | 02 (nav) + 04 (Providers page + form) | COVERED |
| 4 | Access to model mapping config | 02 (nav) + 04 (Mapping page + form) | COVERED |
| 5 | Config persists across restarts | 01 (Express sidecar) + 04 (admin API → config.json) | COVERED |

### Requirement Coverage

| Requirement | Plans | Tasks | Status |
|-------------|-------|-------|--------|
| UI-01: macOS app launches on startup | 01 | 1, 2 | COVERED |
| UI-02: Status indicator (running/stopped/error) | 03 | 1, 2 | COVERED |
| UI-03: Start/stop proxy from app | 01, 03 | 01-T2, 03-T1, 03-T2 | **BROKEN** |
| UI-04: Provider configuration screens | 02, 04 | 02-T2, 04-T2 | COVERED |
| UI-05: Model mapping configuration | 02, 04 | 02-T2, 04-T3 | COVERED |

### Decision Fidelity (D-29 to D-43)

All 15 locked decisions are referenced and addressed across the plans. No contradictions found. No deferred ideas included.

---

## Blockers (must fix)

### 1. [key_links_planned] Proxy start/stop endpoint mismatch — UI controls will not work

- **Plans:** 03-01, 03-03
- **Dimension:** Key Links Planned / Backend Integration
- **Severity:** BLOCKER

**Problem:** Plan 03 (Task 1) creates an API client (`apps/web/src/lib/api.ts`) that calls:
- `POST http://localhost:3456/admin/proxy/start`
- `POST http://localhost:3456/admin/proxy/stop`

These endpoints **do not exist** in the Phase 1+2 Express proxy backend. The existing admin API (`packages/proxy/src/routes/admin.ts`) handles provider and route CRUD, but has no proxy lifecycle endpoints.

Plan 01 (Task 2) correctly implements Rust Tauri commands (`start_proxy`, `stop_proxy`, `get_proxy_status`) in `src-tauri/src/lib.rs` that spawn/kill the Express child process. However, **Plan 03 never calls these Tauri commands** — it only makes HTTP fetch calls to non-existent Express endpoints.

**Result:** When the user clicks "Start Proxy" or "Stop Proxy" in the UI, the fetch will fail (connection refused or 404), the status will transition to "error," and the proxy will never actually start or stop. **Success criterion #2 and requirement UI-03 will not be achieved.**

**The plan itself acknowledges this gap** (Plan 03, Task 1, after the API code):
> *"Note: The /admin/proxy/start and /admin/proxy/stop endpoints don't exist yet in the proxy."*

But then proceeds without resolving it.

**Fix:** Plan 03's API client should use Tauri's `invoke()` API to call the Rust commands from Plan 01, not HTTP fetch. Example:
```typescript
import { invoke } from '@tauri-apps/api/core';

export async function startProxy() {
  const result = await invoke('start_proxy');
  return result;
}
```

Alternatively, Plan 01 should add Express endpoints at `/admin/proxy/start` and `/admin/proxy/stop` that delegate to the child process management. But the Tauri invoke approach is cleaner since Plan 01 already owns the lifecycle commands.

---

## Warnings (should fix)

### 2. [task_completeness] Phantom store files listed in frontmatter but never created

- **Plan:** 03-04
- **Dimension:** Task Completeness
- **Severity:** WARNING

**Problem:** Plan 04's `files_modified` frontmatter lists:
- `apps/web/src/stores/providerStore.ts`
- `apps/web/src/stores/mappingStore.ts`

However, **no task in Plan 04 creates these files**. The ProviderList component (Task 2) uses `useState` + direct API calls for state management, and the ModelMappingForm (Task 3) does the same. The Zustand stores are referenced in the `must_haves.artifacts` section but never implemented in any task's `<action>`.

**Impact:** The executor may attempt to create these files (causing dead code) or be confused by the mismatch between frontmatter and tasks. The pages will work without them since they use local state, but the frontmatter is misleading.

**Fix:** Either (a) remove the store files from `files_modified` and `must_haves.artifacts`, or (b) add a task that creates the Zustand stores and refactors the components to use them. Given that Plan 03 already uses Zustand for proxy state, option (b) would be more consistent — but option (a) is simpler and sufficient.

### 3. [claude_md_compliance] Toast component violates DESIGN.md "hairline-only depth" rule

- **Plan:** 03-04
- **Dimension:** DESIGN.md Compliance
- **Severity:** WARNING

**Problem:** Plan 04 (Task 1) creates a Toast component with `shadow-sm` class:
```tsx
className={`${typeStyles[t.type]} rounded-md shadow-sm px-md py-xs ...`}
```

DESIGN.md explicitly states under "Elevation & Depth":
> *"The system uses **hairline-only depth**. No drop shadows, no elevation tiers."*

And under "Do's and Don'ts":
> *"Don't add drop shadows. Hairlines + ink-on-cream contrast carry the depth."*

**Fix:** Replace `shadow-sm` with a `border border-hairline` or `border-l-4` approach consistent with the hairline-only design system. The Toast already has `border-l-4` for the semantic color indicator — the shadow is redundant and violates the brand.

### 4. [ui_spec_alignment] ErrorBanner uses non-brand color `bg-red-50`

- **Plan:** 03-03
- **Dimension:** UI-SPEC Alignment
- **Severity:** WARNING

**Problem:** Plan 03 (Task 2) creates an ErrorBanner with:
```tsx
className="border-l-4 border-semantic-error bg-red-50 ..."
```

`bg-red-50` is a Tailwind default color, not part of the Cursor brand system. The Canvas color system uses `#f7f7f4` (canvas), `#ffffff` (surface-card), etc. For an error banner background, a brand-appropriate choice would be a very light tint of the semantic-error color or the canvas color.

**Fix:** Use `bg-canvas` or define a brand-appropriate error background (e.g., a very light tint of `#cf2d56`). Alternatively, use `bg-surface-card` to maintain consistency with the card surface pattern.

---

## Info (suggestions)

### 5. [scope_sanity] Plan 02 creates placeholder pages that Plans 03/04 immediately replace

- **Plan:** 03-02
- **Dimension:** Scope Sanity
- **Severity:** INFO

**Problem:** Plan 02 (Task 2) creates placeholder page files:
- `apps/web/src/app/page.tsx` — "Status page coming soon"
- `apps/web/src/app/providers/page.tsx` — "Provider configuration coming soon"
- `apps/web/src/app/mapping/page.tsx` — "Model mapping configuration coming soon"
- `apps/web/src/app/settings/page.tsx` — "Settings coming soon"

Plan 03 (Task 2) replaces `page.tsx` with the real StatusPage.
Plan 04 (Task 2) replaces `providers/page.tsx` with the real ProviderList.
Plan 04 (Task 3) replaces `mapping/page.tsx` and `settings/page.tsx` with real forms.

This is a valid wave-based approach (shell first, content later), but the placeholder content adds no value and increases the `files_modified` count for Plan 02 from 14 to 17. The placeholder pages could be minimal single-line exports instead of full JSX components with headings and text.

**Suggestion:** Reduce placeholders to minimal exports (e.g., `export default function HomePage() { return null; }`) to keep Plan 02 focused on shell infrastructure.

---

## Dimension Summary

| Dimension | Status | Notes |
|-----------|--------|-------|
| 1. Requirement Coverage | ❌ FAIL | UI-03 broken by endpoint mismatch |
| 2. Task Completeness | ⚠️ WARNING | Phantom store files in Plan 04 frontmatter |
| 3. Dependency Correctness | ✅ PASS | Wave assignments valid, no cycles |
| 4. Key Links Planned | ❌ FAIL | Rust commands ≠ HTTP endpoints |
| 5. Scope Sanity | ⚠️ INFO | Placeholder pages add noise |
| 6. Verification Derivation | ✅ PASS | Truths are user-observable |
| 7. Context Compliance | ✅ PASS | All 15 decisions (D-29 to D-43) honored |
| 7b. Scope Reduction | ✅ PASS | No silent simplification detected |
| 7c. Architectural Tier | ✅ PASS | No responsibility map — skipped |
| 8. Nyquist Compliance | ⏭️ SKIP | No VALIDATION.md for Phase 3 |
| 9. Cross-Plan Data Contracts | ✅ PASS | No conflicting transforms |
| 10. DESIGN.md Compliance | ⚠️ WARNING | Toast shadow, ErrorBanner color |
| 11. Research Resolution | ⏭️ SKIP | No RESEARCH.md for Phase 3 |
| 12. Pattern Compliance | ⏭️ SKIP | No PATTERNS.md for Phase 3 |

---

## Plan Quality Assessment

| Plan | Tasks | Files | Wave | Quality |
|------|-------|-------|------|---------|
| 03-01: Tauri app shell + Express lifecycle | 3 | 7 | 1 | Good — solid foundation |
| 03-02: Next.js frontend + navigation | 3 | 17 | 1 | Good — comprehensive shell, but placeholders add noise |
| 03-03: Status page + proxy lifecycle UI | 2 | 8 | 2 | **BLOCKED** — API client calls non-existent endpoints |
| 03-04: Provider forms + Model Mapping + Settings | 3 | 12 | 2 | Good — thorough CRUD, but phantom store files |

---

## Recommendation

**1 blocker requires revision.** Returning to planner with feedback.

### Required Fix

Plan 03's API client (`apps/web/src/lib/api.ts`) must be revised to call the Tauri Rust commands from Plan 01 using `invoke()` instead of HTTP fetch to non-existent endpoints. Specifically:

```typescript
// Current (broken):
const response = await fetch(`${PROXY_API_BASE}/admin/proxy/start`, { method: 'POST' });

// Fixed (use Tauri invoke):
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('start_proxy');
```

This affects `startProxy()` and `stopProxy()` functions in Plan 03, Task 1. The `checkHealth()` function can remain as HTTP fetch since the `/health` endpoint exists in the Express proxy.

### Optional Fixes (Warnings)

1. Remove phantom store files from Plan 04 frontmatter
2. Remove `shadow-sm` from Toast component (DESIGN.md compliance)
3. Replace `bg-red-50` in ErrorBanner with brand-appropriate color

---

*Review completed: 2026-05-10*
*Reviewer: gsd-plan-checker*
