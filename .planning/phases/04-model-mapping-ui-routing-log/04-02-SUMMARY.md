---
phase: "04"
plan: "02"
subsystem: proxy-backend
tags: [config-export, config-import, config-backup, admin-api]
dependency_graph:
  requires: [04-01]
  provides: [exportConfig, importConfig, createBackup, admin-export-endpoint, admin-import-endpoint, admin-diff-endpoint]
  affects: [config-service, admin-api, provider-service]
tech_stack:
  added: []
  patterns: [key-masking, zod-validation, merge-dedup, atomic-backup, express-routes]
key_files:
  created:
    - packages/proxy/tests/services/config.exportImport.test.ts
    - packages/proxy/tests/routes/admin.exportImport.test.ts
  modified:
    - packages/proxy/src/services/config.ts
    - packages/proxy/src/routes/admin.ts
decisions:
  - "Fixed save() to use imported renameSync instead of require('fs') for ESM consistency (Rule 1)"
  - "Export returns hardcoded port 3456 in settings as specified by plan"
  - "Merge strategy uses Map for provider deduplication by name with incoming provider winning"
metrics:
  duration: ~10min
  completed: "2026-05-10T23:41:00Z"
  tests_added: 18
  tests_total: 59
---

# Phase 04 Plan 02: Config Export/Import Backend Summary

**One-liner:** ConfigService extended with exportConfig (masked keys), importConfig (zod validation + merge/replace), createBackup (timestamped JSON), plus three admin endpoints: GET /config/export, POST /config/import, POST /config/diff.

## Tasks Completed

| # | Task | Type | Commit | Key Files |
|---|------|------|--------|-----------|
| 1 | Add exportConfig, importConfig, createBackup to ConfigService | auto | `6bb6d4d9` | `src/services/config.ts` |
| 2 | Add /config/export, /config/import, /config/diff admin endpoints | auto | `9014b54c` | `src/routes/admin.ts` |
| 3 | Unit tests for export/import/backup | auto | `c42817a3` | `tests/services/config.exportImport.test.ts`, `tests/routes/admin.exportImport.test.ts` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] save() used require('fs') in ESM module**
- **Found during:** Task 1
- **Issue:** `save()` method used `const fs = require('fs'); fs.renameSync(...)` which is incompatible with ESM modules
- **Fix:** Changed to use already-imported `renameSync` from the top-level `import { ... } from 'fs'`
- **Files modified:** `src/services/config.ts`
- **Commit:** `6bb6d4d9`

## Key Decisions

1. **ESM consistency in save()** — The existing code had `require('fs')` inside the save method, which works at runtime but is inconsistent with the ESM module system. Fixed to use the already-imported `renameSync` function.

2. **Map-based deduplication** — Merge strategy uses a Map keyed by `provider.name`, adding current providers first then incoming, so incoming providers overwrite existing ones with the same name.

3. **Backup file permissions** — Backup files written with 0o600 permissions (same as config.json) for security consistency.

## Verification Results

- **TypeScript:** `npx tsc --noEmit` passes with zero errors
- **Tests:** All 59 tests pass (18 new + 41 existing)
  - `tests/services/config.exportImport.test.ts`: 11 tests (key masking, export structure, replace, merge, dedup, route replacement, validation errors, backup)
  - `tests/routes/admin.exportImport.test.ts`: 7 tests (export masked config, import validation, strategy validation, diff endpoint)
  - All existing tests unchanged: 41 tests pass

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: export-endpoint | `src/routes/admin.ts` | GET /admin/config/export returns config with masked keys — same localhost-only trust boundary as existing admin endpoints |
| threat_flag: import-endpoint | `src/routes/admin.ts` | POST /admin/config/import accepts untrusted JSON, validated via proxyConfigSchema before application (T-04-05 mitigated) |
| threat_flag: backup-creation | `src/services/config.ts` | createBackup() writes config snapshot with timestamp — audit trail for import operations (T-04-06 mitigated) |

Mitigations from plan threat model:
- T-04-04: All provider keyId values replaced with '••••' in export output
- T-04-05: Strict zod validation via proxyConfigSchema before any config changes
- T-04-06: Auto-backup created before every import with ISO timestamp, 0o600 permissions
- T-04-07: Strategy parameter validated against whitelist ['merge', 'replace']

## Known Stubs

None — all functionality is fully wired and tested.

## Self-Check: PASSED

All acceptance criteria verified:
- `exportConfig()` method in ConfigService: FOUND
- exportConfig returns object with keys providers, routes, settings: FOUND
- exportConfig maps keyId to '••••': FOUND
- `importConfig(data: unknown, strategy:` method in ConfigService: FOUND
- importConfig calls `proxyConfigSchema.safeParse(data)`: FOUND
- importConfig throws Error with "Invalid config:" prefix: FOUND
- importConfig merge uses Map for deduplication: FOUND
- `createBackup():` method in ConfigService: FOUND
- createBackup writes file with "config-backup-" pattern: FOUND
- createBackup returns backup file path: FOUND
- `router.get('/config/export'` in admin.ts: FOUND
- `configService.exportConfig()` in admin.ts: FOUND
- `router.post('/config/import'` in admin.ts: FOUND
- `configService.createBackup()` in admin.ts: FOUND
- `configService.importConfig(data, strategy` in admin.ts: FOUND
- `providerService.reload(` in admin.ts: FOUND
- `router.post('/config/diff'` in admin.ts: FOUND
- Import validates strategy with 400 response: FOUND
- 11+ ConfigService tests: FOUND (11 tests)
- 5+ admin route tests: FOUND (7 tests)
- All tests pass: PASSED (59/59)
