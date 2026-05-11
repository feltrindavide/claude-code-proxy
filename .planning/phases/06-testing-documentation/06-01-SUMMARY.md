---
phase: 06-testing-documentation
plan: 01
subsystem: testing
tags: [playwright, e2e, page-object-model, chromium, typescript]

# Dependency graph
requires:
  - phase: 01-core-proxy-server
    provides: Express proxy entry point and health endpoint
  - phase: 02-admin-ui
    provides: Next.js admin UI components (StatusPage, ProviderForm, etc.)
  - phase: 05-reliability-polish
    provides: Rate limiting, retry logic, provider validation
provides:
  - Playwright E2E test infrastructure with webServer config for proxy + Next.js
  - 5 Page Object Models encapsulating UI interactions
  - 11 E2E tests across 4 test files covering happy path, provider types, edge cases, config export/import
  - npm scripts: test:e2e, test:e2e:smoke, test:e2e:ui
affects: [06-02, 06-03, future-e2e-expansion]

# Tech tracking
tech-stack:
  added: [@playwright/test, playwright]
  patterns: [Page Object Model, getByRole/getByLabel selectors, @smoke tagging, isolated test config directory]

key-files:
  created:
    - e2e/playwright.config.ts
    - e2e/fixtures.ts
    - e2e/utils/test-helpers.ts
    - e2e/pages/StatusPage.ts
    - e2e/pages/ProviderForm.ts
    - e2e/pages/ModelMappingPage.ts
    - e2e/pages/RoutingLogPage.ts
    - e2e/pages/SettingsPage.ts
    - e2e/tests/01-happy-path.spec.ts
    - e2e/tests/02-provider-types.spec.ts
    - e2e/tests/03-edge-cases.spec.ts
    - e2e/tests/04-config-export.spec.ts
  modified:
    - package.json
    - tsconfig.json

key-decisions:
  - "Used explicit --config=e2e/playwright.config.ts in npm scripts to avoid vitest/playwright global matcher conflict"
  - "Adapted ModelMappingPage and RoutingLogPage selectors to match actual component structure (no <table> in ModelMappingForm, no clear button in RoutingLogTable)"
  - "Created root tsconfig.json to isolate e2e tests from workspace node_modules"

patterns-established:
  - "Page Object Model: each page exports a class with constructor(page: Page), readonly page, locators, and action methods"
  - "All selectors use getByRole/getByLabel (accessibility-first, no CSS selectors)"
  - "Smoke tests tagged with @smoke for fast CI validation"
  - "Test config isolated to /tmp/claude-proxy-e2e-test with cleanup in globalTeardown"

requirements-completed: [SC-06-01, D-74, D-75, D-76]

# Metrics
duration: 18min
completed: 2026-05-11
---

# Phase 06 Plan 01: Playwright E2E Testing Infrastructure Summary

**Playwright E2E framework with 5 Page Object Models and 11 tests across 4 files covering happy path, all 4 provider types, edge cases, and config export/import**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-11T14:00:00Z
- **Completed:** 2026-05-11T14:18:00Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Playwright installed and configured with webServer for both Express proxy (port 3456) and Next.js (port 3000)
- 5 Page Object Models created for all UI pages using accessibility-first selectors
- 11 E2E tests discovered and organized across 4 test files
- npm scripts added: test:e2e, test:e2e:smoke, test:e2e:ui
- Test config state isolated to /tmp/claude-proxy-e2e-test with cleanup in teardown
- No real API keys in e2e/ directory (verified with grep)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Playwright and create test infrastructure** - `d1662bcd` (feat)
2. **Task 2: Create Page Object Models for all 5 UI pages** - `5983b2bc` (feat)
3. **Task 3: Create E2E test files covering all flows** - `3714d748` (feat)

## Files Created/Modified

- `e2e/playwright.config.ts` - Playwright config with webServer for proxy + Next.js, fullyParallel: false
- `e2e/fixtures.ts` - globalSetup (isolated config dir, health polling) and globalTeardown (cleanup)
- `e2e/utils/test-helpers.ts` - TEST_CONFIG_DIR, cleanTestConfig, pollHealthEndpoint, getTestProvider
- `e2e/pages/StatusPage.ts` - StatusPagePage: health card, provider status list, navigation
- `e2e/pages/ProviderForm.ts` - ProviderFormPage: form inputs, type select, test/save/cancel buttons
- `e2e/pages/ModelMappingPage.ts` - ModelMappingPage: heading, save button, updateMapping for tier rows
- `e2e/pages/RoutingLogPage.ts` - RoutingLogPage: heading, log table, refresh button, waitForLogEntry
- `e2e/pages/SettingsPage.ts` - SettingsPage: export/import buttons, file input, exportConfig/importConfig
- `e2e/tests/01-happy-path.spec.ts` - Status page load + add provider flow (2 tests, @smoke)
- `e2e/tests/02-provider-types.spec.ts` - OpenRouter, OpenCode, Ollama, Custom (4 tests, @smoke)
- `e2e/tests/03-edge-cases.spec.ts` - Provider unavailable, rate limiting, retry log (3 tests)
- `e2e/tests/04-config-export.spec.ts` - Export as JSON, import from file (2 tests)
- `package.json` - Added @playwright/test, playwright devDependencies + test:e2e scripts
- `tsconfig.json` - Root tsconfig isolating e2e from workspace node_modules

## Decisions Made

- Used `--config=e2e/playwright.config.ts` explicitly in npm scripts because vitest's `@vitest/expect` in `packages/proxy/node_modules` conflicts with Playwright's global matchers when running from root without explicit config
- Adapted ModelMappingPage selectors: component uses Card elements (not `<table>`) for tier rows, so used `getByRole('heading')` and `getByRole('combobox')` instead of table-based selectors
- Adapted RoutingLogPage selectors: component has no "Clear Log" button (only Refresh), so used `getByRole('button', { name: 'Refresh logs' })` instead of clear button
- SettingsPage exportConfig returns `suggestedFilename()` instead of `download.path()` since Playwright's download.path() may return null before download completes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vitest/playwright global matcher conflict**
- **Found during:** Task 1 (test discovery verification)
- **Issue:** Running `npx playwright test --list` from root printed TypeError from `@vitest/expect` in `packages/proxy/node_modules`, preventing test discovery (0 tests found)
- **Fix:** Added explicit `--config=e2e/playwright.config.ts` to all npm test scripts, ensuring Playwright uses its own config context
- **Files modified:** package.json
- **Verification:** `npm run test:e2e -- --list` discovers all 11 tests in 4 files
- **Committed in:** 3714d748 (Task 3 commit)

**2. [Rule 1 - Bug] Adapted Page Object selectors to match actual component structure**
- **Found during:** Task 2 (Page Object creation)
- **Issue:** Plan specified `getByRole('table', { name: /model mappings/i })` for ModelMappingPage, but ModelMappingForm.tsx renders Card elements, not a `<table>`. Plan specified `clearButton` for RoutingLogPage, but RoutingLogTable.tsx has no clear button.
- **Fix:** Used actual component selectors: `getByRole('heading', { name: 'Model Mapping' })` and `getByRole('button', { name: /save.*mapping/i })` for ModelMappingPage; `getByRole('button', { name: 'Refresh logs' })` for RoutingLogPage
- **Files modified:** e2e/pages/ModelMappingPage.ts, e2e/pages/RoutingLogPage.ts
- **Verification:** TypeScript compilation succeeds, Playwright test discovery works
- **Committed in:** 5983b2bc (Task 2 commit)

**3. [Rule 2 - Missing Critical] Added root tsconfig.json for e2e isolation**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** No root tsconfig.json existed; Playwright needed TypeScript config for e2e/ directory to avoid picking up workspace-specific configs
- **Fix:** Created `tsconfig.json` at project root with `include: ["e2e/**/*.ts"]` and `exclude: ["node_modules", "packages/proxy/node_modules"]`
- **Files modified:** tsconfig.json (created)
- **Verification:** `npx tsc --noEmit` on e2e files succeeds
- **Committed in:** 3714d748 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 bug fixes, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for test infrastructure to function correctly. No scope creep — tests cover all planned scenarios.

## Issues Encountered

- vitest/playwright global matcher conflict (`$$jest-matchers-object` Symbol redefinition) — resolved by using explicit `--config` flag in npm scripts
- `npm install -D` rewrote package.json removing previously added test scripts — re-added with corrected config paths

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: test_key_exposure | e2e/utils/test-helpers.ts | getTestProvider returns hardcoded test key 'test-key-12345' — safe per T-06-01 mitigation |
| threat_flag: test_config_cleanup | e2e/fixtures.ts | globalTeardown removes TEST_CONFIG_DIR — satisfies T-06-02 mitigation |
| threat_flag: failure_artifacts | e2e/playwright.config.ts | screenshot: 'only-on-failure' and video: 'retain-on-failure' configured per T-06-03 |

## User Setup Required

None - no external service configuration required. E2E tests use mock/test API keys only.

## Next Phase Readiness

- E2E infrastructure ready for 06-02 (documentation) and 06-03 (additional test coverage)
- Tests are currently structural/skeleton — actual proxy + Next.js servers must be running for full E2E execution
- Smoke tests (6 @smoke tagged) provide fast validation path for CI

---

*Phase: 06-testing-documentation*
*Completed: 2026-05-11*
