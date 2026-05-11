# Phase 4: Model Mapping UI & Routing Log - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds two capabilities to the existing desktop app: (1) export/import of the entire proxy configuration as JSON file, and (2) a request routing log showing the last 50 requests with full details (provider, model, timestamp, status, duration). The proxy backend (Phase 1+2) and desktop shell (Phase 3) are already complete — this phase adds observability and configuration portability.
</domain>

<decisions>
## Implementation Decisions

### Request Logging Architecture
- **D-44:** Request logs stored as JSON file on disk at `~/.claude-code-proxy/request-log.json`
- **D-45:** Each log entry captures full request details: timestamp, claudeTier (opus/sonnet/haiku), providerName, targetModel, status (success/error), durationMs, request body (truncated), response body (truncated), headers
- **D-46:** Logging implemented as Express middleware — centralized capture point before/after proxy handler
- **D-47:** Fixed 50-entry ring buffer — when 51st entry arrives, oldest is dropped
- **D-48:** Large request/response bodies truncated to keep log file manageable (exact truncation limit at agent's discretion)

### Export/Import UX & Scope
- **D-49:** Export triggers browser download of config.json file
- **D-50:** Export scope includes: providers (with masked keys, not actual API keys), routes (model mappings), proxy settings (port, auto-start). Excludes: actual API keys, request logs, runtime state
- **D-51:** Import presents user with choice: merge with existing config OR replace entire config
- **D-52:** Import validation is strict — parse JSON, validate against config schema, show specific field errors. Block import until valid
- **D-53:** Import safety: diff preview before apply + auto-backup of current config before changes are applied

### Routing Log Display
- **D-54:** Routing log displayed as sortable table with columns: Timestamp, Claude Tier, Provider, Model, Status, Duration
- **D-55:** Filtering by provider, model tier (opus/sonnet/haiku), and status (success/error)
- **D-56:** Routing Log is a new 5th sidebar nav item (between Model Mapping and Settings)
- **D-57:** Auto-refresh via polling every 5-10 seconds (consistent with existing health polling pattern)

### Navigation Update
- **D-58:** Sidebar navigation expanded from 4 to 5 items: Status, Providers, Model Mapping, Routing Log, Settings

### the agent's Discretion
- Exact truncation limit for request/response bodies in log entries
- Specific column widths and sort defaults for the routing log table
- Import file picker UI pattern (native file dialog vs drag-and-drop)
- Backup file naming convention and retention policy

### Folded Todos
None — no todos were folded into this phase's scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design
- `DESIGN.md` — Cursor brand design system (warm cream canvas, Cursor Orange #f54e00, JetBrains Mono)

### Phase 3 Context (carry-forward decisions)
- `.planning/phases/03-desktop-ui-shell/03-CONTEXT.md` — D-29 through D-43 (Tauri shell, sidebar nav, status indicator, Keychain integration, provider form)

### Phase 1+2 Context (backend)
- `.planning/phases/01-core-proxy-server/01-CONTEXT.md` — D-01 through D-14 (proxy model, port, config, Keychain, model mapping)
- `.planning/phases/02-sse-streaming-integration/02-CONTEXT.md` — D-15 through D-28 (adapters, SSE, validation, errors)

### Project
- `.planning/PROJECT.md` — Core value, constraints, model mappings
- `.planning/REQUIREMENTS.md` — Phase 4 requirements: MAP-04, UI-06
- `.planning/ROADMAP.md` — Phase 4 goal and success criteria

### Existing Code (Phase 1+2+3 deliverables)
- `packages/proxy/src/index.ts` — Express entry point with health endpoint (add logging middleware here)
- `packages/proxy/src/routes/admin.ts` — Admin REST API (add export/import endpoints)
- `packages/proxy/src/services/config.ts` — ConfigService (extend with export/import logic)
- `apps/web/src/components/Sidebar.tsx` — Sidebar component (add Routing Log nav item)
- `apps/web/src/components/SidebarNav.tsx` — Navigation items list (extend to 5 items)
- `apps/web/src/lib/api.ts` — API client (add log fetch, export/import functions)
- `apps/web/src/stores/proxyStore.ts` — Zustand store (pattern for polling state)

### Reference Implementations
- `reference/claude-code-router/` — TypeScript Node.js monorepo
- `reference/free-claude-code/` — Python proxy with provider abstraction

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`packages/proxy/src/routes/admin.ts`** — Existing admin API pattern for GET/PUT config — export can leverage GET /admin/config, import can use PUT /admin/config
- **`apps/web/src/lib/api.ts`** — API client with health check and Tauri invoke patterns — extend with log fetch and export/import functions
- **`apps/web/src/stores/proxyStore.ts`** — Zustand store with 5s health polling — pattern for routing log polling store
- **`apps/web/src/components/ui/Button.tsx`** — Button component with 4 variants — reuse for Export, Import, Refresh actions
- **`apps/web/src/components/Toast.tsx`** — Toast notification system — use for export success, import success/error feedback
- **`apps/web/src/components/Modal.tsx`** — Modal dialog — use for import merge/replace choice and diff preview

### Established Patterns
- **Admin API**: Express router at `/admin/*` with JSON responses — logging endpoints follow same pattern
- **Polling**: Zustand store with setInterval for health checks every 5s — same pattern for log polling
- **Cursor brand**: Tailwind tokens for colors, typography, spacing — all new components use these tokens
- **Sidebar navigation**: Fixed 240px width, 4 items with active state — extend to 5 items

### Integration Points
- **Express middleware**: New logging middleware inserted before proxy handler in `packages/proxy/src/index.ts`
- **Log file**: `~/.claude-code-proxy/request-log.json` — same directory as config.json
- **Frontend → Proxy**: HTTP requests to `localhost:3456/admin/logs` (new endpoint) and `localhost:3456/admin/config/export` (new endpoint)
- **Import flow**: Frontend reads file → validates → shows diff preview → user chooses merge/replace → calls PUT /admin/config

</code_context>

<specifics>
## Specific Ideas

- User wants full request details in logs (not just metadata) — useful for debugging and auditing
- User wants both diff preview AND auto-backup for import safety — defense in depth
- User wants merge OR replace choice at import time — flexibility for different scenarios
- Routing log table should be sortable and filterable — admin tool aesthetic
- Sidebar nav expands to 5 items with Routing Log as the new entry
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 04-model-mapping-ui-routing-log*
*Context gathered: 2026-05-10*
