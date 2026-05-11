# Phase 4: Model Mapping UI & Routing Log — Discussion Log

**Date:** 2026-05-10
**Areas discussed:** 4

---

## Area 1: Request Logging Architecture

| Question | Options | Selected |
|----------|---------|----------|
| Where should request logs be stored? | JSON file on disk, In-memory array, SQLite | JSON file on disk (`~/.claude-code-proxy/request-log.json`) |
| What data should each log entry capture? | Essential fields, Essential + token/cost, Full request details | Full request details (truncated bodies) |
| How should logging integrate into proxy? | Express middleware, Inside provider adapters, Sidecar process | Express middleware |
| How should old log entries be managed? | Fixed 50-entry ring, Time-based 24h, 50 + archive | Fixed 50-entry ring buffer |

**Notes:** User wants full debugging capability — request/response bodies captured but truncated to keep file size manageable.

---

## Area 2: Export/Import UX & Scope

| Question | Options | Selected |
|----------|---------|----------|
| How should config export work? | Download JSON file, Copy to clipboard, Both | Download JSON file |
| What should be included in export? | Providers + Routes + Settings, Full config + UI, Routes only | Providers + Routes + Settings (excludes API keys, request logs) |
| How should import be applied? | Replace entire config, Merge with existing, Preview + selective | User chooses merge or replace at import time |
| How should invalid imports be handled? | Strict validation, Lenient import, Preview + fix | Strict validation with error details |

**Notes:** Import flow: file picker → validate → diff preview → user chooses merge/replace → apply with auto-backup.

---

## Area 3: Routing Log Display

| Question | Options | Selected |
|----------|---------|----------|
| How should routing log be displayed? | Sortable table, Card-based list, Timeline view | Sortable table |
| What filtering capabilities? | Provider + tier + status, Text search only, No filtering | Filter by provider + tier + status |
| Where in app navigation? | New sidebar nav item, Tab on Status, Section in Settings | New sidebar nav item "Routing Log" |
| How should log update? | Auto-refresh polling, Manual refresh, Real-time push | Auto-refresh polling (5-10s) |

**Notes:** Table columns: Timestamp, Claude Tier, Provider, Model, Status, Duration. Consistent with existing health polling pattern.

---

## Area 4: Config Import Safety

| Question | Options | Selected |
|----------|---------|----------|
| What safety mechanism? | Diff preview, Auto-backup, Staged import | Both diff preview + auto-backup |

**Notes:** User explicitly requested "1 + 2" — wants both safety mechanisms working together.

---

## Decisions Captured

D-44 through D-58 (15 decisions total)

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Discussion completed: 2026-05-10*
