---
phase: "04"
plan: "03"
subsystem: frontend
tags: [routing-log, export-import, frontend, zustand, jsondiffpatch]
dependency:
  requires: ["04-01", "04-02"]
  provides: ["routing-log-ui", "config-export-import-ui"]
  affects: ["sidebar-nav", "settings-page"]
tech-stack:
  added: ["jsondiffpatch"]
  patterns: ["zustand-polling", "blob-download", "file-picker", "diff-modal"]
key-files:
  created:
    - apps/web/src/stores/logStore.ts
    - apps/web/src/app/logs/page.tsx
    - apps/web/src/components/RoutingLogTable.tsx
    - apps/web/src/components/JsonDiffViewer.tsx
    - apps/web/src/components/ConfigExportImport.tsx
  modified:
    - apps/web/src/components/SidebarNav.tsx
    - apps/web/src/lib/api.ts
    - apps/web/src/app/settings/page.tsx
decisions:
  - "Polling in component useEffect (not store) following proxyStore pattern"
  - "Sort cycling: asc → desc → null (no sort) for flexible table interaction"
  - "jsondiffpatch HTML formatter imported from formatters/html subpath (not formatters on main export)"
metrics:
  duration: "~15min"
  completed: "2026-05-10T23:45:00Z"
---

# Phase 04 Plan 03: Frontend — Routing Log + Export/Import UI Summary

**One-liner:** Routing Log page with sortable/filterable table and 5s auto-refresh polling, sidebar nav expanded to 5 items, Settings page with Config Export/Import UI featuring file picker → diff preview modal → merge/replace choice, powered by jsondiffpatch HTML formatter.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Routing Log nav item + API functions + logStore | `2254cbc8` | SidebarNav.tsx, api.ts, logStore.ts |
| 2 | Routing Log page + sortable table | `ba655eed` | logs/page.tsx, RoutingLogTable.tsx |
| 3 | Config Export/Import UI + JsonDiffViewer | `1cab0d59` | ConfigExportImport.tsx, JsonDiffViewer.tsx, settings/page.tsx |

## What Was Built

### 1. Sidebar Navigation Update
- Added `ScrollText` icon from lucide-react
- Expanded navItems from 4 to 5: Status, Providers, Model Mapping, **Routing Log**, Settings
- Routing Log at position 4 (between Model Mapping and Settings) per D-56, D-58

### 2. API Client Functions (api.ts)
- `fetchLogs()` — GET /admin/logs with 5s timeout
- `exportConfig()` — GET /admin/config/export with 5s timeout
- `importConfig(data, strategy)` — POST /admin/config/import with 15s timeout, merge/replace strategy
- `fetchDiff(incoming)` — POST /admin/config/diff with 5s timeout
- `RequestLogEntry` interface with all log entry fields

### 3. Zustand Log Store (logStore.ts)
- State: entries, isLoading, lastRefresh, error
- Action: fetchLogs() with loading/error handling
- Polling done in component useEffect (NOT in store), following proxyStore pattern

### 4. Routing Log Page (/logs)
- Simple page wrapper rendering RoutingLogTable
- 'use client' directive for client-side rendering

### 5. RoutingLogTable Component
- 6 sortable columns: Timestamp, Claude Tier, Provider, Model, Status, Duration
- Sort cycling: asc → desc → null (default order)
- 3 filter dropdowns: provider (dynamic), tier (opus/sonnet/haiku), status (success/error)
- 5s auto-refresh polling via useLogStore
- Manual refresh button with loading spinner
- Empty state, error state, loading state handling
- Cursor brand styling: text-semantic-success for success, text-semantic-error for errors
- Border-collapse table with hover states

### 6. JsonDiffViewer Component
- Visual JSON diff display using jsondiffpatch HTML formatter
- Imports: jsondiffpatch.diff() + formatters/html.format()
- CSS: annotated.css + html.css from jsondistpatch dist
- dangerouslySetInnerHTML for rendering (trusted source per T-04-10)
- "No differences detected" fallback when delta is null

### 7. ConfigExportImport Component
- **Export:** Blob URL download of claude-code-proxy-config.json
- **Import:** Hidden file input (.json only) → JSON.parse → fetchDiff → diff modal
- **Diff Modal:** Modal with JsonDiffViewer + Cancel/Merge/Replace buttons
- Toast feedback for success/error states
- Loading states for export and import operations
- File input reset after selection for re-selection support

### 8. Settings Page Update
- Added ConfigExportImport below SettingsForm
- Wrapped in space-y-xl for vertical spacing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsondiffpatch formatter import path**
- **Found during:** Task 3
- **Issue:** Plan specified `jsondiffpatch.formatters.html.format()` but v4+ exports formatters via subpath `jsondiffpatch/formatters/html`, not on main export
- **Fix:** Changed import to `import { format as formatHtml } from 'jsondiffpatch/formatters/html'` and used `formatHtml(delta, current)` directly
- **Files modified:** JsonDiffViewer.tsx
- **Commit:** `1cab0d59`

## Known Stubs

None — all components are fully wired to backend endpoints built in Plans 01 and 02.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: dangerouslySetInnerHTML | JsonDiffViewer.tsx | HTML content from jsondiffpatch library rendered via innerHTML — trusted source (local config data), mitigated by T-04-10 acceptance |

## Commits

- `2254cbc8` — feat(04-03): add Routing Log nav item, API functions, and logStore
- `ba655eed` — feat(04-03): create Routing Log page with sortable/filterable table
- `1cab0d59` — feat(04-03): add Config Export/Import UI with diff modal and JsonDiffViewer

## Self-Check: PASSED

All acceptance criteria verified:
- Sidebar has 5 nav items with Routing Log (ScrollText icon) ✓
- API client has 4 new functions (fetchLogs, exportConfig, importConfig, fetchDiff) ✓
- RequestLogEntry interface exported ✓
- logStore has Zustand state with fetchLogs action ✓
- /logs page renders RoutingLogTable ✓
- RoutingLogTable has 6 sortable columns, 3 filter dropdowns, 5s polling ✓
- JsonDiffViewer uses jsondiffpatch HTML formatter with CSS ✓
- ConfigExportImport has export (Blob download) + import (file picker → diff modal → merge/replace) ✓
- Settings page shows both SettingsForm and ConfigExportImport ✓
- jsondiffpatch installed ✓
