# Phase 06: Testing & Documentation - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete integration testing and user-facing documentation for first release. This phase delivers: end-to-end test suite verifying Claude Code works through the proxy with each provider type, comprehensive documentation (README + docs/), setup automation script, and release packaging (.dmg with auto-update + setup + docs).

</domain>

<decisions>
## Implementation Decisions

### E2E Test Strategy
- **D-74:** Use Playwright for E2E testing — covers the full stack (Tauri app + Express sidecar + Next.js UI)
- **D-75:** E2E coverage includes all main flows from Phase 1-5: happy path + provider unavailable, rate limiting, retry logic, config export/import
- **D-76:** Test scenarios cover each provider type (OpenRouter, OpenCode Zen/Go, Ollama, Custom)

### Documentation Scope
- **D-77:** Documentation includes README for developers + docs/ directory with architecture, decisions, and API reference
- **D-78:** All documentation in English (standard for the industry, maximum reach)
- **D-79:** docs/ should include: architecture overview, setup guide, configuration reference, troubleshooting, API reference for admin endpoints

### Setup Automation
- **D-80:** Setup delivered as CLI script (npm script), not Tauri wizard or manual instructions
- **D-81:** Setup script includes: configure ANTHROPIC_BASE_URL, create default config.json, verify provider connections, import config from backup, configure Keychain, generate diagnostic report

### Release Packaging
- **D-82:** Release package includes: .dmg with app + auto-update integrated + setup script + documentation
- **D-83:** Auto-update is part of the Tauri app (not separate mechanism)

### the agent's Discretion
- Specific Playwright test structure and page object patterns
- Exact docs/ directory structure and file naming
- Setup script implementation language (bash vs Node.js)
- Auto-update mechanism specifics (Tauri updater vs custom)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project value, tech stack, out-of-scope items
- `.planning/ROADMAP.md` — Phase 6 goal and success criteria
- `.planning/STATE.md` — Current project state (Phase 5 complete)
- `.planning/config.json` — GSD configuration

### Design & Architecture
- `DESIGN.md` — Cursor brand tokens, UI patterns, component specifications
- `src-tauri/tauri.conf.json` — Tauri app configuration (auto-update settings)
- `src-tauri/Cargo.toml` — Rust dependencies for Tauri

### Existing Codebase
- `packages/proxy/src/` — Proxy backend (adapters, services, middleware, routes, types)
- `apps/web/src/` — Next.js frontend (components, stores, pages)
- `packages/proxy/tests/` — Existing 82 unit tests (pattern reference)

### Prior Phase Context
- `.planning/phases/05-reliability-polish/05-CONTEXT.md` — Phase 5 decisions (D-59 to D-73)
- `.planning/phases/05-reliability-polish/05-RESEARCH.md` — Phase 5 research (Bottleneck, p-retry patterns)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/proxy/tests/services/` — Test patterns for services (config, provider, keychain, rateLimiter, retryHandler, validationStore) — use as template for new E2E test structure
- `packages/proxy/tests/routes/admin.test.ts` — Express route testing pattern with supertest
- `apps/web/src/stores/proxyStore.ts` — Zustand polling pattern (reference for UI state testing)
- `apps/web/src/components/Toast.tsx` — Toast component (needs E2E verification of warning type from Phase 5)
- `apps/web/src/components/ProviderList.tsx` — Provider list with warning badges (E2E target)
- `apps/web/src/components/StatusPage.tsx` — Status page with health card (E2E target)

### Established Patterns
- Vitest for unit testing (packages/proxy/vitest.config.ts)
- Atomic write pattern for config persistence (config.ts, rateLimiter.ts, validationStore.ts)
- Zustand stores for frontend state (proxyStore, logStore, healthStore)
- Express middleware chain (requestLogger, rateLimitMiddleware)
- Admin API route patterns with zod validation

### Integration Points
- E2E tests need to start Tauri app + Express sidecar together
- Setup script interacts with: ~/.claude-code-proxy/config.json, macOS Keychain, ANTHROPIC_BASE_URL env var
- Auto-update requires Tauri updater plugin configuration
- Release packaging requires Tauri build configuration (tauri.conf.json)

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond what's captured in decisions — open to standard approaches for Playwright E2E structure, docs/ organization, and setup script implementation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)

None.

</deferred>

---

*Phase: 06-Testing & Documentation*
*Context gathered: 2026-05-11*
