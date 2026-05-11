# Phase 3: Desktop UI Shell - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

User has a native macOS application with provider configuration UI. This phase builds the Tauri 2.x desktop shell with Next.js frontend, Express sidecar lifecycle management, sidebar navigation, status indicator, provider configuration forms, and model mapping UI. The proxy backend (Phase 1+2) is already complete — this phase wraps it in a desktop application.
</domain>

<decisions>
## Implementation Decisions

### App Shell Architecture
- **D-29:** Tauri 2.x + Express sidecar — Tauri manages Express lifecycle (start/stop/monitor)
- **D-30:** Express spawned as child process via Tauri beforeDev/beforeStart hooks
- **D-31:** App monitors health endpoint (GET /health) every 5s for status detection
- **D-32:** Proxy auto-starts on app launch if not already running

### UI Layout & Navigation
- **D-33:** Sidebar navigation with sections: Status (home), Providers, Model Mapping, Settings
- **D-34:** Full-featured UI in Phase 3 (not minimal shell) — all screens built now
- **D-35:** Cursor brand design: warm cream canvas (#f7f7f4), Cursor Orange (#f54e00) accent, JetBrains Mono for code surfaces

### Status Indicator Behavior
- **D-36:** Status visible in sidebar header (colored dot) + dedicated Status page
- **D-37:** Status page shows: port, version, uptime, provider count, recent errors
- **D-38:** Auto-check every 5s via health endpoint polling
- **D-39:** Clear visual feedback during start/stop transitions (loading state)

### Keychain Integration from UI
- **D-40:** UI sends API keys to proxy's admin API (POST /admin/providers/:id/key) — proxy stores in Keychain via KeychainService
- **D-41:** API keys never stored in frontend — always go through localhost HTTP API (D-04)
- **D-42:** Provider configuration form: name (text), base URL (text), API key (password field), provider type (dropdown: OpenRouter/OpenCode/Ollama/Custom), enable toggle, priority number
- **D-43:** "Test Connection" button validates provider before saving

### the agent's Discretion
- Specific Next.js component structure and file organization
- Exact Tauri configuration (window size, menu bar vs full window)
- Form validation error messages and UX patterns
- Settings page content (beyond what's specified above)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design
- `DESIGN.md` — Cursor brand design system (warm cream canvas, Cursor Orange #f54e00, JetBrains Mono)

### Phase 1+2 Context (carry-forward decisions)
- `.planning/phases/01-core-proxy-server/01-CONTEXT.md` — D-01 through D-14 (proxy model, port, config, Keychain, model mapping)
- `.planning/phases/02-sse-streaming-integration/02-CONTEXT.md` — D-15 through D-28 (adapters, SSE, validation, errors)

### Project
- `.planning/PROJECT.md` — Core value, constraints, model mappings
- `.planning/REQUIREMENTS.md` — Phase 3 requirements: UI-01, UI-02, UI-03, UI-04, UI-05
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria

### Research
- `.planning/research/STACK.md` — Tech stack: Tauri 2.x, Next.js 15, Express, Zustand
- `.planning/research/ARCHITECTURE.md` — Component model, build order

### Existing Code (Phase 1+2 deliverables)
- `packages/proxy/src/` — Complete proxy backend (adapters, services, routes, types)
- `packages/proxy/src/index.ts` — Express entry point with health endpoint
- `packages/proxy/src/routes/admin.ts` — Admin REST API
- `packages/proxy/src/services/keychain.ts` — KeychainService (keytar wrapper)
- `packages/cli/` — CLI setup script

### Reference Implementations
- `reference/claude-code-router/` — TypeScript Node.js monorepo
- `reference/free-claude-code/` — Python proxy with provider abstraction

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`packages/proxy/src/`** — Complete proxy backend ready to be wrapped by Tauri
- **`packages/proxy/src/index.ts`** — Health endpoint at `/health` for status detection
- **`packages/proxy/src/routes/admin.ts`** — Admin API for provider/route configuration
- **`packages/proxy/src/services/keychain.ts`** — KeychainService for API key storage
- **`packages/cli/`** — CLI patterns for process management

### Established Patterns
- **Admin API**: Express router at `/admin/*` with JSON responses — frontend will consume these
- **Config loading**: `loadConfigOnStartup()` — Tauri can trigger this via health check
- **Provider registry**: Map-based storage — admin API exposes this to frontend
- **Keychain integration**: keytar via KeychainService — accessed through admin API, not directly from frontend

### Integration Points
- **Tauri → Express**: Child process spawn with lifecycle management
- **Frontend → Proxy**: HTTP requests to localhost:3456/admin/*
- **Frontend → Keychain**: Via proxy admin API (not direct access)
- **Tauri build**: Needs Rust toolchain + Tauri CLI

</code_context>

<specifics>
## Specific Ideas

- User wants full-featured UI in Phase 3 (not minimal shell)
- Sidebar navigation with 4 sections: Status, Providers, Model Mapping, Settings
- Provider form with Test Connection button before saving
- Status indicator in both sidebar header and dedicated Status page
- Auto-start proxy on app launch
- Cursor brand design throughout (warm cream, orange accent, JetBrains Mono)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Desktop UI Shell*
*Context gathered: 2026-05-10*
