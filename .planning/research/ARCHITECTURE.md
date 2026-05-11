# Architecture Patterns

**Domain:** AI proxy / routing middleware
**Researched:** 2026-05-10
**Reference confidence:** HIGH — derived from two production-grade reference implementations

## Architecture Overview

AI proxy systems for Claude Code are fundamentally protocol-translating reverse proxies. They sit between the Claude Code CLI and upstream AI providers, intercepting requests in Anthropic's native format and translating them to each provider's API format before forwarding. Both reference implementations follow this same pattern.

```
Claude Code CLI  →  Proxy Server  →  Upstream Provider
     (client)        (gateway)       (OpenRouter, OpenCode, Ollama…)
```

The proxy must be transparent to Claude Code — it advertises itself as an Anthropic API endpoint but routes to heterogeneous backends. The critical constraint: **Claude Code must not detect it's talking to a proxy**.

---

## Component Boundaries

The system has four major components with clear responsibilities:

| Component | Responsibility | Talks To | Boundary |
|-----------|----------------|----------|----------|
| **Proxy Server** | HTTP server accepting Claude Code requests; routes them to providers | Client (Claude Code), Providers, Config Service | Network boundary (receives all traffic) |
| **Config Service** | Persists and serves model mappings and provider credentials | Proxy Server, UI | In-process (no network boundary) |
| **Provider Service** | Registers providers, resolves model routes | Proxy Server, Transformers | In-process |
| **Transformer Chain** | Converts request/response between provider formats | Provider Service | In-process (called per-request) |
| **Desktop UI** | macOS configuration panel | Config Service (via IPC or file) | Separate process |

### Desktop App Wrapper

The macOS desktop app wraps the proxy server as a background process. The UI communicates with it through IPC (HTTP on localhost) or a shared config file. The app's core value-add is **model mapping** — the user-facing configuration of which provider/model substitutes for each Claude tier (Opus → OpenCode/Qwen, Sonnet → OpenRouter/Mimo, etc.).

### Build implication: The proxy server is the core. The desktop UI is a thin shell around it.

---

## Data Flow

### Request Path

```
Claude Code
    │ POST /v1/messages (Anthropic format)
    ▼
Proxy Server (Fastify/Next.js API route)
    │ 1. Parse request
    ▼
Provider Service
    │ 2. Resolve model route (e.g. "claude-opus-4-20250514" → "opencode/qwen3.6")
    ▼
Transformer Chain (request side)
    │ 3. transformRequestOut: Convert from Anthropic format to neutral
    │ 4. transformRequestIn: Convert to provider-specific format
    ▼
Provider (HTTP request)
    │ Forward with provider API key
    ▼
Provider Response (streaming SSE)
    │
Transformer Chain (response side)
    │ 5. transformResponseOut: Provider format → neutral
    │ 6. transformResponseIn: Neutral → Anthropic SSE format
    ▼
Claude Code (streams Anthropic SSE)
```

### Key Design: The Transformer Pipeline

Both reference implementations use a **transformer chain** — a sequence of composable transformers applied to requests and responses. The chain has two directions:

- **Request OUT** (`transformRequestOut`): Claude's Anthropic format → neutral canonical format
- **Request IN** (`transformRequestIn`): Neutral → provider's native format (executed in forward order)
- **Response OUT** (`transformResponseOut`): Provider response → neutral (executed in reverse order)
- **Response IN** (`transformResponseIn`): Neutral → Anthropic SSE (executed last)

Each transformer is a small, focused module (e.g., `tooluse.transformer.ts` handles tool call conversion, `maxcompletiontokens.transformer.ts` handles token limits). The chain is configured per-provider and per-model in the config file.

### Data Flow for Model Mapping

The mapping decision happens at route resolution:

```typescript
// ProviderService.resolveModelRoute()
interface RequestRouteInfo {
  provider: LLMProvider        // Which upstream provider
  originalModel: string        // What Claude Code sent ("claude-opus-4-20250514")
  targetModel: string          // What to send upstream ("opencode/qwen3.6")
}
```

Configuration shape (from `free-claude-code` registry + `claude-code-router` provider service):

```yaml
providers:
  - name: opencode
    api_base_url: https://opencode.ai/v1
    api_key: $OPENCODE_KEY
    models:
      - qwen3.6
      - nemotron-3-super-120b-a12b:free
    transformer:
      use:
        - openai         # Convert to OpenAI-compatible format
        - maxtoken       # Ensure max_tokens is set correctly
        - reasoning      # Handle thinking/reasoning params

routes:
  - claude-opus-4-20250514: opencode/qwen3.6
  - claude-sonnet-4-20250514: openrouter/mimo-v2-flash
  - claude-haiku-4-20250514: opencode/nvidia/nemotron-3-super-120b-a12b:free
```

---

## Build Order Implications

Components have hard dependencies. Build in this order:

### Phase 1: Proxy Core
- HTTP server (Fastify or Next.js API routes)
- Config service (JSON file read/write)
- Provider service (register, resolve route)
- Minimal transformer: passthrough (no conversion)

**Goal:** Proxy server that accepts requests and forwards them to one hardcoded provider.

### Phase 2: Transformer System
- Transformer interface (request in/out, response in/out)
- Provider-specific transformers (OpenAI, Anthropic, OpenRouter, OpenCode)
- Transformer chain execution

**Goal:** Support multiple providers with format translation.

### Phase 3: Configuration UI
- macOS UI (Tauri/Electron/Neutralino shell)
- Provider CRUD (add/remove/edit providers)
- Model mapping UI (assign provider models to Claude tiers)
- Config persistence (IPC with proxy)

**Goal:** User can configure without editing JSON directly.

### Phase 4: Desktop Integration
- Background proxy process (managed by desktop app)
- App lifecycle (start on login, stop on quit)
- Localhost proxy binding (port 8082 default)
- Claude Code env var setup (`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`)

**Goal:** User installs app → proxy runs → Claude Code uses it automatically.

### Phase 5: Advanced Features
- Provider model discovery (fetch model list from upstream API)
- Token counting (for context window management)
- SSE stream handling (thinking blocks, tool calls)
- Error mapping (provider errors → Anthropic format)
- Rate limiting

---

## Reference Architecture Patterns

### Pattern 1: Plugin-Provider Registry

Both implementations use a registry factory pattern:

```typescript
// claude-code-router: ProviderService.registerProvider()
providers: Map<string, LLMProvider>    // name → provider config
modelRoutes: Map<string, ModelRoute>  // model name → route
```

```python
# free-claude-code: PROVIDER_FACTORIES dict
PROVIDER_FACTORIES = {
    "nvidia_nim": _create_nvidia_nim,
    "open_router": _create_open_router,
    "ollama": _create_ollama,
    # extensible by adding new factory
}
```

**For our app:** Use TypeScript registry with a provider interface. Each provider implements the same contract. New providers are added by implementing the interface.

### Pattern 2: Transformer Pipeline with Passthrough

The key insight from both references is that transformers can be skipped when formats match:

```typescript
// claude-code-router: shouldBypassTransformers()
// If provider uses exactly one transformer and it matches current,
// skip the transformer chain entirely (passthrough mode)
function shouldBypassTransformers(provider, transformer, body): boolean {
  return provider.transformer?.use?.length === 1
      && provider.transformer.use[0].name === transformer.name
}
```

**For our app:** Passthrough is critical for performance. When the proxy handles an OpenAI-compatible provider, the transformer chain can be almost empty.

### Pattern 3: SSE Transform Streams

Streaming responses require transform streams:

- `SSEParserTransform`: Parse raw SSE text → structured event objects
- `SSESerializerTransform`: Serialize event objects → SSE text
- `rewriteStream`: Intercept and modify streaming data (for tool calls, thinking blocks)

```typescript
// claude-code-router: utils/sse/
rewriteStream: Intercept SSE stream and modify chunks in-flight
```

**For our app:** SSE handling is non-negotiable. Claude Code always streams. Must implement transform stream pipeline for streaming responses.

### Pattern 4: Shared Core Module

Both implementations isolate shared logic:

```python
# free-claude-code: core/anthropic/
"""Neutral shared Anthropic protocol helpers across API, providers, and integrations."""
```

```typescript
// claude-code-router/packages/core/src/
services/    # ConfigService, ProviderService, TransformerService
transformer/ # All transformer implementations
types/       # LLMProvider, ModelRoute, Transformer interfaces
```

**For our app:** Keep protocol conversion logic in a core module. The desktop shell wraps it. This allows the proxy to run standalone.

### Pattern 5: Configuration Hot Reload

Neither implementation supports true hot reload — changes require restart. The config file path:

- `claude-code-router`: `~/.claude-code-router/config.json`
- `free-claude-code`: `.env` + `pyproject.toml` settings

**For our app:** Config changes require proxy restart. Document this limitation. For v1, acceptable.

---

## Scalability Considerations

| Concern | At 10 users | At 100 users | At 1000 users |
|---------|-------------|---------------|----------------|
| Concurrent connections | Single proxy, no load balancing | Local proxy per user (isolated) | Proxy service with session routing |
| Model routes | Static config, no DB | Static config, no DB | Config file per user |
| Provider rate limits | Handled per-request | Per-user rate limit tracking | Provider-level aggregation |
| SSE streaming | Per-connection memory | Per-connection memory | Stream multiplexing |

**For v1:** Single-user desktop app. No scalability concerns needed.

---

## Sources

- `reference/claude-code-router/packages/core/src/` — TypeScript provider service, transformer chain, routes
- `reference/free-claude-code/` — Python provider registry, base provider interface, model mapping
- `reference/claude-code-router/CLAUDE.md` — Architecture overview and build commands
- `reference/free-claude-code/AGENTS.md` — Architecture principles and naming conventions

**Confidence:** HIGH. Two production implementations with identical core patterns. No ambiguity about fundamental architecture.