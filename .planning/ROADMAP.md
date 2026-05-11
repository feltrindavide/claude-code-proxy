# Roadmap: Claude Code Proxy

**Created:** 2026-05-10
**Granularity:** Fine (6 phases)
**Core Value:** Route Claude Code requests through the provider offering the best quality/cost ratio for each model tier — without changing how the user uses Claude Code.

---

## Phases

- [x] **Phase 1: Core Proxy Server** — Proxy core, config service, provider service, model mapping
- [x] **Phase 2: SSE Streaming & Integration** — Streaming, error handling, Claude Code integration testing
- [x] **Phase 3: Desktop UI Shell** — Tauri + Next.js app, provider configuration UI
- [x] **Phase 4: Model Mapping UI & Routing Log** — Visual mapping configuration, request log (completed 2026-05-10)
- [x] **Phase 5: Reliability Polish** — Provider validation, rate limiting, error handling (completed 2026-05-11)
- [x] **Phase 6: Testing & Documentation** — E2E tests, user documentation, setup scripts, auto-update (completed 2026-05-11)

---

## Phase Details

### Phase 1: Core Proxy Server

**Goal:** Users can configure providers and route Claude Code requests through the proxy without modifying Claude Code behavior.

**Depends on:** Nothing (first phase)

**Requirements:** AUTH-01, AUTH-02, AUTH-03, PROV-01, PROV-02, PROV-04, MAP-01, MAP-02, MAP-03, PROX-01, PROX-02, PROX-03, INTG-01, INTG-02

**Success Criteria** (what must be TRUE):
1. User can add a provider (OpenRouter, OpenCode, Ollama, Custom) with API key and see it in the configuration
2. User can map Claude model tiers (Opus/Sonnet/Haiku) to provider-specific model identifiers
3. Proxy server starts on configurable localhost port and intercepts Claude Code traffic
4. API keys are stored in macOS Keychain and never appear in logs or config files
5. User can view masked API keys (showing only last 4 characters)
6. Mappings persist across application restarts
7. System provides `ANTHROPIC_BASE_URL` environment variable and setup instructions

**Plans:** 3 plans

**Plan list:**
- [x] 01-01-PLAN.md — Proxy core + provider registry + model routing
- [x] 01-02-PLAN.md — Config service + Keychain + admin API
- [x] 01-03-PLAN.md — CLI setup + integration

**UI hint:** no

---

### Phase 2: SSE Streaming & Integration

**Goal:** Claude Code works transparently through the proxy with proper streaming and error handling.

**Depends on:** Phase 1

**Requirements:** PROV-03, PROX-04, PROX-05, INTG-03

**Success Criteria** (what must be TRUE):
1. Claude Code receives streaming responses without truncation or corruption
2. Proxy validates provider connectivity when user adds or edits a provider
3. Request/response format transformation works correctly for all supported providers
4. Error responses from providers are converted to user-friendly messages
5. Claude Code works transparently — user sees no behavior difference compared to direct usage

**Plans:** 3 plans

**Plan list:**
- [x] 02-01-PLAN.md — ProviderAdapter interface + registry + OpenRouter adapter
- [x] 02-02-PLAN.md — SSE transformer + OpenCode/Ollama/Custom adapters
- [x] 02-03-PLAN.md — Provider validation + custom proxy handler + integration

**UI hint:** no

---

### Phase 3: Desktop UI Shell

**Goal:** User has a native macOS application with provider configuration UI.

**Depends on:** Phase 2

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05

**Success Criteria** (what must be TRUE):
1. macOS desktop application launches and shows a status indicator (running/stopped/error)
2. User can start/stop the proxy server from the application UI
3. User can access provider configuration screens from the app navigation
4. User can access model mapping configuration from the app navigation
5. Application persists configuration across restarts

**Plans:** 4 plans

**Plan list:**
- [x] 03-01-PLAN.md — Tauri app shell + Express lifecycle management
- [x] 03-02-PLAN.md — Next.js frontend shell + Cursor brand navigation
- [x] 03-03-PLAN.md — Status page + proxy lifecycle UI
- [x] 03-04-PLAN.md — Provider forms + model mapping + settings UI

**UI hint:** yes

---

### Phase 4: Model Mapping UI & Routing Log

**Goal:** User can visually configure model mappings and view request routing history.

**Depends on:** Phase 3

**Requirements:** MAP-04, UI-06

**Success Criteria** (what must be TRUE):
1. User can export entire configuration as JSON file
2. User can import configuration from JSON file
3. App displays request routing log showing last 50 requests with provider, model, timestamp
4. User can see which model was used for each request in the log

**Plans:** 3/3 plans complete

**UI hint:** yes

---

### Phase 5: Reliability Polish

**Goal:** Proxy handles edge cases gracefully with validation, rate limiting, and robust error handling.

**Depends on:** Phase 4

**Requirements:** (All v1 requirements already covered; this phase adds polish)

**Success Criteria** (what must be TRUE):
1. Provider validation runs automatically on startup and shows warning if provider unavailable
2. Rate limiting prevents overwhelming upstream providers
3. Timeout handling prevents hanging requests
4. Graceful degradation when a provider fails (user-friendly error, doesn't crash)

**Plans:** 3/3 plans complete

**Plan list:**
- [x] 05-01-PLAN.md — Rate limiting backend (Bottleneck per-provider queuing + admin API)
- [x] 05-02-PLAN.md — Retry logic backend (p-retry + validation store + admin endpoint)
- [x] 05-03-PLAN.md — Frontend health UI (warning badges + health card + healthStore polling)

**UI hint:** yes

---

### Phase 6: Testing & Documentation

**Goal:** Complete integration testing and user-facing documentation for first release.

**Depends on:** Phase 5

**Requirements:** (All v1 requirements already covered; this phase completes the release)

**Success Criteria** (what must be TRUE):
1. End-to-end test verifies Claude Code works through proxy with each provider type
2. Setup script automates Claude Code configuration (sets ANTHROPIC_BASE_URL)
3. User-facing README documents all features and troubleshooting steps
4. Configuration schema is documented for advanced users
5. Desktop app includes auto-update plugin and DMG packaging for release

**Plans:** 3/3 plans complete

**Plan list:**
- [x] 06-01-PLAN.md — Playwright E2E infrastructure + page objects + test files (4 test suites, 11 tests)
- [x] 06-02-PLAN.md — Enhanced setup script (6 features) + README + docs/ (5 files)
- [x] 06-03-PLAN.md — Tauri auto-update plugin + DMG packaging + updater service

**UI hint:** no

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Core Proxy Server | 3/3 | ✅ Complete | Phase 1 all plans |
| 2. SSE Streaming & Integration | 3/3 | ✅ Complete | Phase 2 all plans |
| 3. Desktop UI Shell | 4/4 | ✅ Complete | Plans 01, 02, 03, 04 complete |
| 4. Model Mapping UI & Routing Log | 3/3 | Complete   | 2026-05-10 |
| 5. Reliability Polish | 3/3 | ✅ Complete | 2026-05-11, 82 tests passing |
| 6. Testing & Documentation | 3/3 | ✅ Complete | 11 E2E tests, 5 docs, setup script, auto-update |

---

## Coverage

**Requirements mapped:** 26/26 ✓

| Category | Count | Phases |
|----------|-------|--------|
| Authentication (AUTH) | 3 | Phase 1 |
| Provider Management (PROV) | 4 | Phase 1, 2, 5 |
| Model Mapping (MAP) | 4 | Phase 1, 4 |
| Proxy Core (PROX) | 5 | Phase 1, 2, 5 |
| Integration (INTG) | 3 | Phase 1, 2 |
| UI / Desktop (UI) | 6 | Phase 3, 4 |

---

*Roadmap created: 2026-05-10*