# Phase 1: Core Proxy Server - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can configure providers and route Claude Code requests through the proxy without modifying Claude Code behavior. This phase establishes the core proxy server, configuration persistence, provider management, and model mapping — without the desktop UI shell (Phase 3).
</domain>

<decisions>
## Implementation Decisions

### Proxy Server Model
- **D-01:** Proxy runs as **Express.js sidecar** Node.js process (separate from Tauri/Next.js frontend). The sidecar is managed by the Tauri app as a background process.
- **D-02:** Default port: **3456** on localhost
- **D-03:** Proxy server is standalone — can run without the UI (useful for testing/debugging)

### Configuration Communication
- **D-04:** Frontend ↔ Proxy communication via **localhost HTTP REST API** (simple HTTP endpoints on the proxy server).
- **D-05:** Proxy exposes admin endpoints for: GET /config, PUT /config, POST /providers, GET /providers, DELETE /providers/{id}, GET /routes, PUT /routes

### Model Mapping Strategy
- **D-06:** Mapping is **per-tier** (Opus → provider/model, Sonnet → provider/model, Haiku → provider/model) with optional per-provider overrides in v2.
- **D-07:** Default mappings (pre-filled from user's IDEA.md):
  - `opus` → `opencode/qwen3.6`
  - `sonnet` → `openrouter/mimo-v2-flash`
  - `haiku` → `opencode/nvidia/nemotron-3-super-120b-a12b:free`

### API Key Storage
- **D-08:** API keys stored in **macOS Keychain** (via Tauri plugin or keytar npm package).
- **D-09:** API keys **never appear in config files or logs** — only the Keychain entry ID is stored.

### Claude Code Setup
- **D-10:** System provides `ANTHROPIC_BASE_URL=http://localhost:3456` env var value and setup script.
- **D-11:** Setup is **CLI-based for Phase 1** — user runs `claude-code-proxy setup` to configure Claude Code. Phase 3 (UI) adds graphical setup.

### Provider Priority
- **D-12:** Provider priority order matters only for the "Custom" provider fallback — users can set which provider to try first for each model tier.

### Configuration Persistence
- **D-13:** Config file at `~/.claude-code-proxy/config.json` — stores provider configs (without API keys), route mappings, priority order.
- **D-14:** API keys are fetched from Keychain by provider ID — never stored in the JSON config.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design
- `DESIGN.md` — Cursor brand design system (warm cream canvas, Cursor Orange #f54e00, JetBrains Mono)

### Research (stack, architecture, pitfalls)
- `.planning/research/STACK.md` — Recommended stack: Tauri 2.x, Next.js 15, Express.js, http-proxy-middleware, Zustand
- `.planning/research/ARCHITECTURE.md` — Component model, transformer pipeline, build order
- `.planning/research/PITFALLS.md` — SSE streaming mismatch, tool calling schema, credential handling
- `.planning/research/SUMMARY.md` — Consolidated findings and phase ordering hints

### Reference implementations
- `reference/claude-code-router/` — TypeScript Node.js monorepo, multi-provider routing
- `reference/free-claude-code/` — Python proxy with provider abstraction
- `reference/claude-code-router/packages/core/src/services/` — ConfigService, ProviderService, TransformerService patterns
- `reference/free-claude-code/core/` — Anthropic protocol helpers

### Project
- `.planning/PROJECT.md` — Core value, constraints, user's model mappings
- `.planning/REQUIREMENTS.md` — Phase 1 requirements: AUTH-01, AUTH-02, AUTH-03, PROV-01, PROV-02, PROV-04, MAP-01, MAP-02, MAP-03, PROX-01, PROX-02, PROX-03, INTG-01, INTG-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **claude-code-router packages/core/src/types/**: LLMProvider, ModelRoute, Transformer interfaces — direct TypeScript reference for type definitions
- **free-claude-code core/anthropic/**: Anthropic protocol helpers for request/response parsing
- **free-claude-code providers/**: Provider factory pattern for extensible provider registration

### Established Patterns
- **Provider registry**: Map<string, LLMProvider> pattern from claude-code-router
- **Transformer chain**: Request in/out, response in/out with composable transformers
- **Transformer passthrough**: Skip transformer chain when provider format matches (performance)
- **Config file location**: `~/.claude-code-proxy/config.json` — matches CLI conventions

### Integration Points
- **Keychain**: API keys fetched by provider ID (never stored in config.json)
- **http-proxy-middleware**: Dynamic target routing via router function (getTarget from request)
- **Tauri sidecar**: Express.js process spawned as Tauri sidecar command
- **Claude Code**: Intercepts via ANTHROPIC_BASE_URL environment variable

</code_context>

<specifics>
## Specific Ideas

- User has two working reference implementations: `claude-code-router` (TypeScript) and `free-claude-code` (Python) — can reference both for implementation patterns
- User wants Cursor brand design (warm cream canvas, Cursor Orange #f54e00, JetBrains Mono)
- Default model mappings already defined by user:
  - opus → opencode/qwen3.6
  - sonnet → openrouter/mimo-v2-flash
  - haiku → opencode/nvidia/nemotron-3-super-120b-a12b:free

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Future Phases
- **Phase 2 (SSE Streaming):** Format transformation between providers (OpenAI, Anthropic, etc.)
- **Phase 3 (Desktop UI):** Visual provider configuration, model mapping UI, status indicator
- **Phase 4:** Export/import configuration, routing log

</deferred>

---

*Phase: 1-Core Proxy Server*
*Context gathered: 2026-05-10*