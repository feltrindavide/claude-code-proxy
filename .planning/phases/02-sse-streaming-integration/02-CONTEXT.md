# Phase 2: SSE Streaming & Integration - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Claude Code works transparently through the proxy with proper streaming and error handling. This phase adds provider-specific adapters for format transformation, robust SSE streaming with Anthropic-compatible output, provider connectivity validation, and user-friendly error handling. The proxy must be invisible to Claude Code — no behavior changes from the user's perspective.
</domain>

<decisions>
## Implementation Decisions

### Format Transformation Strategy
- **D-15:** Provider-specific adapters for each provider type (OpenRouter, OpenCode, Ollama, Custom) — not a generic transformer
- **D-16:** Bidirectional transforms: each adapter implements `transformRequest()` (Anthropic → provider format) and `transformResponse()` (provider → Anthropic format)
- **D-17:** Adapters live in `packages/proxy/src/adapters/{provider}.ts`
- **D-18:** Interface-based design: `ProviderAdapter` interface with `transformRequest()` and `transformResponse()` methods

### SSE Streaming Behavior
- **D-19:** Custom SSE handler — intercept upstream SSE stream, detect format, transform events to Anthropic-style events (`message_start`, `content_block_delta`, `text_delta`, `message_stop`) before forwarding to Claude Code
- **D-20:** SSE transformation happens in the adapter's `transformResponse()` method — consistent with the adapter pattern
- **D-21:** Timeout strategy: 120s for streaming connections, 30s for non-streaming, configurable per-provider (addresses Pitfall #7)

### Provider Connectivity Validation
- **D-22:** Validate on save (when adding/editing a provider via admin API) AND on proxy startup
- **D-23:** Each adapter implements its own `validate()` method — per-adapter validation logic
- **D-24:** Default validation approach: `GET /v1/models`, with per-adapter fallback if the provider doesn't support it
- **D-25:** User noted: OpenRouter and OpenCode Zen/Go may require `POST /v1/chat/completions` — adapters must handle this

### Error Response Format
- **D-26:** All upstream errors transformed to Anthropic-compatible error format (`{type: 'error', error: {type, message}}`) so Claude Code understands them natively
- **D-27:** Error transformation happens in the adapter's `transformResponse()` — consistent with the adapter pattern
- **D-28:** Log error details internally (without API keys), return user-friendly Anthropic-format error to Claude Code

### the agent's Discretion
- Specific SSE event mapping details (which OpenAI events map to which Anthropic events) — researcher to determine
- Exact validation endpoint per provider — adapters decide based on provider capabilities
- Error message content — balance between useful debugging info and not exposing provider internals

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 Context (carry-forward decisions)
- `.planning/phases/01-core-proxy-server/01-CONTEXT.md` — D-01 through D-14 (proxy model, port, config, Keychain, model mapping)
- `.planning/phases/01-core-proxy-server/01-RESEARCH.md` — Technical research from Phase 1

### Project
- `.planning/PROJECT.md` — Core value, constraints, model mappings
- `.planning/REQUIREMENTS.md` — Phase 2 requirements: PROV-03, PROX-04, PROX-05, INTG-03
- `.planning/ROADMAP.md` — Phase 2 goal and success criteria

### Research
- `.planning/research/PITFALLS.md` — Pitfall #1 (SSE streaming mismatch), #3 (mapping ambiguity), #7 (timeouts), #10 (silent failures)
- `.planning/research/STACK.md` — Tech stack: Express, http-proxy-middleware, keytar

### Existing Code (Phase 1 deliverables)
- `packages/proxy/src/types/index.ts` — LLMProvider, ModelRoute, ProxyConfig types
- `packages/proxy/src/services/provider.ts` — ProviderService (registry, route resolution, priority sort)
- `packages/proxy/src/services/config.ts` — ConfigService (load/save JSON)
- `packages/proxy/src/services/keychain.ts` — KeychainService (keytar wrapper)
- `packages/proxy/src/proxy.ts` — http-proxy-middleware setup with dynamic router
- `packages/proxy/src/index.ts` — Express entry point, admin endpoints, config loading
- `packages/proxy/src/routes/admin.ts` — Admin REST API routes

### Reference Implementations
- `reference/claude-code-router/packages/core/src/services/` — TransformerService patterns
- `reference/free-claude-code/core/anthropic/` — Anthropic protocol helpers
- `reference/free-claude-code/providers/` — Provider factory pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`packages/proxy/src/types/index.ts`** — LLMProvider, ModelRoute, ClaudeTier types — extend with adapter types
- **`packages/proxy/src/services/provider.ts`** — ProviderService with `resolveModelRoute()` — adapters will be resolved here
- **`packages/proxy/src/proxy.ts`** — `createProxyHandler()` with `selfHandleResponse: false` — needs replacement with custom SSE handler
- **`packages/proxy/src/services/config.ts`** — ConfigService — startup validation uses this to load providers

### Established Patterns
- **Provider registry**: Map-based storage with priority sorting — adapters register alongside providers
- **Config loading on startup**: `loadConfigOnStartup()` populates service registries — extend to run validation
- **Admin API routes**: Express router pattern at `/admin/*` — add validation endpoint here

### Integration Points
- **http-proxy-middleware**: Current passthrough (`selfHandleResponse: false`) must be replaced with custom response handling for SSE transformation
- **ProviderService**: `resolveModelRoute()` returns the target provider — adapter resolution should happen here
- **KeychainService**: API keys retrieved at request time — adapters need keys for validation requests

</code_context>

<specifics>
## Specific Ideas

- User confirmed OpenRouter and OpenCode Zen/Go may not support `GET /v1/models` — need `POST /v1/chat/completions` fallback
- All 4 discussion areas covered: format transformation, SSE streaming, provider validation, error handling
- User wants provider-specific adapters (not generic transformer) — maximum control and extensibility
- Bidirectional transforms (request + response) for each adapter
- SSE transformation in adapter's transformResponse, not separate middleware
- Error transformation also in adapter's transformResponse for consistency

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-SSE Streaming & Integration*
*Context gathered: 2026-05-10*
