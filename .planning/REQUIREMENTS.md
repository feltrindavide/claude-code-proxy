# Requirements: Claude Code Proxy

**Defined:** 2026-05-10
**Core Value:** Route Claude Code requests through the provider offering the best quality/cost ratio for each model tier — without changing how the user uses Claude Code.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Config

- [x] **AUTH-01**: User can configure API keys for each provider (OpenRouter, OpenCode, Ollama, Custom)

- [x] **AUTH-02**: API keys are stored securely in macOS Keychain

- [x] **AUTH-03**: User can view masked API keys (show last 4 chars only)

### Provider Management

- [ ] **PROV-01**: User can add/edit/remove provider configurations
- [ ] **PROV-02**: User can enable/disable providers individually
- [x] **PROV-03**: System validates provider connectivity on configuration
- [ ] **PROV-04**: User can set provider priority order

### Model Mapping

- [ ] **MAP-01**: User can map each Claude model tier (Opus/Sonnet/Haiku) to a provider model
- [ ] **MAP-02**: User can set custom model mappings per provider
- [ ] **MAP-03**: Mappings persist across app restarts
- [ ] **MAP-04**: User can export/import configuration as JSON

### Proxy Core

- [ ] **PROX-01**: Proxy intercepts Claude Code requests on configurable localhost port
- [ ] **PROX-02**: Proxy routes requests to appropriate provider based on model mapping
- [ ] **PROX-03**: Proxy supports SSE streaming responses
- [ ] **PROX-04**: Proxy transforms request/response format between providers
- [ ] **PROX-05**: Proxy handles errors gracefully with user-friendly messages

### Claude Code Integration

- [ ] **INTG-01**: System provides `ANTHROPIC_BASE_URL` env var for Claude Code configuration
- [ ] **INTG-02**: System provides setup script/instructions to configure Claude Code
- [x] **INTG-03**: Claude Code works transparently through the proxy (no user behavior changes)

### UI / Desktop

- [ ] **UI-01**: macOS desktop app launches on system startup
- [ ] **UI-02**: App shows status indicator (running/stopped/error)
- [ ] **UI-03**: User can start/stop the proxy from the app
- [ ] **UI-04**: App provides access to provider configuration screens
- [ ] **UI-05**: App provides access to model mapping configuration
- [ ] **UI-06**: App shows request routing log (last 50 requests)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Routing

- **ROUTE-01**: Context-aware routing based on task type
- **ROUTE-02**: Request optimization (bypass proxy for simple queries)
- **ROUTE-03**: Token counting and cost tracking per provider

### Reliability

- **RELY-01**: Automatic failover when a provider is unavailable
- **ROTE-02**: Rate limiting per provider
- **RELY-03**: Request retry with exponential backoff

### Advanced Features

- **ADV-01**: Model discovery (list available models per provider)
- **ADV-02**: Request/response logging with detail view
- **ADV-03**: Configuration profiles (switch between mapping sets)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time model switching | Configuration changes require restart for reliability |
| Built-in model inference | Not a proxy function; goes beyond routing |
| Web-based configuration | Native macOS app per user requirement |
| iOS/Android mobile | macOS desktop only for v1 |
| OAuth provider integration | API keys sufficient for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| PROV-01 | Phase 1 | Complete |
| PROV-02 | Phase 1 | Complete |
| PROV-03 | Phase 2 | Complete |
| PROV-04 | Phase 1 | Complete |
| MAP-01 | Phase 1 | Complete |
| MAP-02 | Phase 1 | Complete |
| MAP-03 | Phase 1 | Complete |
| MAP-04 | Phase 4 | Pending |
| PROX-01 | Phase 1 | Pending |
| PROX-02 | Phase 1 | Pending |
| PROX-03 | Phase 1 | Pending |
| PROX-04 | Phase 2 | Pending |
| PROX-05 | Phase 2 | Pending |
| INTG-01 | Phase 1 | Pending |
| INTG-02 | Phase 1 | Pending |
| INTG-03 | Phase 2 | Complete |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| UI-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-10*
*Last updated: 2026-05-10 after initial definition*