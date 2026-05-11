# Claude Code Proxy — Research Synthesis

**Project:** Claude Code Proxy — macOS desktop app that routes Claude Code through various AI providers (OpenRouter, OpenCode, Ollama, Custom)
**Researched:** May 10, 2026

---

## Executive Summary

Claude Code Proxy is a protocol-translating reverse proxy that sits between the Claude Code CLI and upstream AI providers, enabling model substitution, cost optimization, and provider flexibility. The core value proposition is **transparency** — users get different models without changing their behavior.

The recommended stack is **Tauri 2.x** for the desktop wrapper (58% less memory, 96% smaller bundle than Electron), **Next.js 15 + React 19** for the frontend UI, **Express.js + http-proxy-middleware** for the proxy server, and **Zustand** for state management. The architecture follows a transformer pipeline pattern adapted from production-grade reference implementations (claude-code-router, free-claude-code), with clear component boundaries between the proxy server, config service, provider service, and transformer chain.

The critical pitfalls to avoid are SSE streaming mismatches (the #1 failure point), tool calling schema transformation incompleteness, model mapping ambiguity causing routing confusion, and credential handling that leaks API keys. Build in phases: proxy core first, then transformer system, then configuration UI, then desktop integration.

---

## Key Findings

### Stack Summary

| Technology | Version | Purpose |
|-----------|---------|---------|
| Tauri | 2.x | Desktop app wrapper — native macOS WebView, Rust backend for proxy performance |
| Next.js | 15.x | React framework with App Router and Turbopack |
| React | 19.x | UI library — use `useActionState`, not deprecated `useFormState` |
| Express | 4.x | HTTP server for proxy |
| http-proxy-middleware | 3.x | Request routing with dynamic target routing, SSE support |
| Zustand | 5.x | State management — ~1.7KB gzipped, no boilerplate |
| Tailwind CSS | 3.x | Styling with `tailwind-merge` + `clsx` |
| lucide-react | latest | Icons for macOS-native feel |

**Key decision:** Tauri over Electron for ~58% less RAM and ~96% smaller bundle. Zustand over Redux for simplicity. JSON config file for provider/route storage.

### Table Stakes (v1 Must-Haves)

| Feature | Purpose | Phase |
|---------|---------|-------|
| Multi-Provider Support | OpenRouter, OpenCode, Ollama, Custom extensibility | Phase 1 |
| Model Mapping | Per-tier routing (Opus → X, Sonnet → Y, Haiku → Z) | Phase 1 |
| Transparent Proxy | Anthropic-compatible endpoints (`/v1/messages`, `/v1/models`) | Phase 1 |
| Configuration Persistence | JSON config file surviving restarts | Phase 1 |
| Format Translation | Anthropic ↔ OpenAI format conversion | Phase 1 |
| Streaming Responses | SSE support for Claude Code | Phase 1 |
| Basic Error Handling | Retry logic, fallback to secondary model | Phase 2 |
| API Key Management | Secure storage and provider routing | Phase 1 |

### Differentiators (Competitive Advantages — Defer to v2+)

| Feature | Value | Defer Reason |
|---------|-------|---------------|
| Context-Aware Routing | Token threshold routing (e.g., >32K/60K tokens) | Extra complexity, not core |
| Task-Specific Routing | Different models for background, thinking, web search | Requires custom router scripts |
| Request Optimization | Intercept trivial requests locally (quota probes, title gen) | Nice-to-have, not required |
| Thinking Token Parsing | Convert `<thinking>` tags to native Claude blocks | Provider-specific, complex |
| Heuristic Tool Parser | Convert text-output tool calls to structured JSON | Extra validation layer |
| Visual Configuration UI | Desktop app interface vs. JSON editing | Phase 3 priority, not core proxy |
| Custom Router Scripts | User-defined routing logic beyond built-in | High complexity, v4+ |

### Anti-Features (Explicitly NOT Building)

- **Real-Time Model Switching** — Config changes require restart; document this limitation
- **Built-in Local Inference** — Pass-through proxy only; rely on Ollama/LM Studio
- **Web-Based Config Panel** — PROJECT.md specifies native macOS app
- **Mobile Support** — Out of scope per PROJECT.md
- **Multi-Tenant / Organization** — Single-user local app
- **Cost Analytics Dashboard** — Defer to future milestone

---

## Architecture Highlights

### Component Model

```
┌─────────────────────────────────────────────────────┐
│                    Tauri App                        │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │   Next.js Frontend  │  │   Proxy Server      │  │
│  │   (React UI)        │  │   (Express +        │  │
│  │                     │  │   http-proxy)       │  │
│  │   - Provider config │  │                     │  │
│  │   - Route mapping   │  │   - Intercept calls │  │
│  │   - Status display  │  │   - Route to AI     │  │
│  └─────────────────────┘  │   - Transform req/  │  │
│           │               │        resp          │  │
│           └───────────────┴──────────────────────┘  │
│                         │                            │
│                    localhost (127.0.0.1:3456)       │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
          ┌────────────────────────────────┐
          │      Upstream AI Providers     │
          │  - OpenRouter (OpenAI-compat) │
          │  - OpenCode/Zen               │
          │  - Ollama (local)             │
          │  - Custom endpoints           │
          └────────────────────────────────┘
```

### Data Flow

1. Claude Code sends POST to `/v1/messages` (Anthropic format)
2. Proxy Server parses request
3. Provider Service resolves model route (e.g., `claude-opus-4-20250514` → `opencode/qwen3.6`)
4. Transformer Chain converts request (Anthropic → neutral → provider format)
5. Forward to provider with API key
6. Provider response (streaming SSE)
7. Transformer Chain converts response (provider → neutral → Anthropic SSE)
8. Stream back to Claude Code

### Key Patterns

- **Plugin-Provider Registry** — TypeScript registry with provider interface; extensible by implementing the interface
- **Transformer Pipeline with Passthrough** — Skip transformer chain when formats match (critical for performance)
- **SSE Transform Streams** — SSEParserTransform, SSESerializerTransform, rewriteStream for streaming responses
- **Shared Core Module** — Keep protocol conversion logic in core; desktop shell wraps it

### Build Order

| Phase | Components | Goal |
|-------|------------|------|
| Phase 1 | Proxy core (HTTP server, config service, provider service, minimal transformer) | Forward requests to one hardcoded provider |
| Phase 2 | Transformer system (interface, provider-specific transformers, chain execution) | Support multiple providers with format translation |
| Phase 3 | Configuration UI (provider CRUD, model mapping UI, config persistence) | User configures without editing JSON |
| Phase 4 | Desktop integration (background proxy process, app lifecycle, localhost binding) | User installs app → proxy runs → Claude Code uses it |
| Phase 5 | Advanced features (provider model discovery, token counting, error mapping, rate limiting) | Complete feature set |

---

## Critical Pitfalls (Top 3 to Avoid)

### Pitfall 1: SSE Streaming Mismatch

**What:** Proxy fails to properly handle SSE from downstream providers. Results in corrupted streaming responses, truncated output, or complete failure.

**Why:** Different providers use incompatible SSE formats. Anthropic uses custom event schema; OpenAI-compatible uses standard `data: [json]` payloads.

**Prevention:**
- Implement robust SSE parser handling both Anthropic-style and OpenAI-style streams
- Add SSE format detection per provider
- Test streaming mode for each provider
- Set appropriate timeouts (120s+ for streaming)

**Phase:** Phase 2 (Core Proxy Middleware)

### Pitfall 2: Tool Calling Schema Transformation Incompleteness

**What:** Claude Code sends tools in Anthropic's `input_schema` format; proxy fails to transform to OpenAI's `parameters` format. Tools rejected or malformed.

**Why:** Subtle schema differences — key names differ, wrapping structures differ, enum handling differs, some providers lack schema feature support.

**Prevention:**
- Complete schema transformation layer with provider-specific adapters
- Test each tool definition format with actual model calls
- Provide fallback for limited schema support
- Log schema transformations for debugging

**Phase:** Phase 3 (Provider Adapters & Transformations)

### Pitfall 3: Authentication Credential Handling Leaks Secrets

**What:** API keys stored in plaintext, logged accidentally, or passed to wrong provider.

**Why:** Environment variables logged in debug output; config files written with keys in plaintext; routing errors send keys to wrong provider.

**Prevention:**
- Use macOS Keychain for credential storage
- Never log API keys, even in debug mode
- Validate keys only sent to correct provider
- Implement secret masking in all logging

**Phase:** Phase 1 (Project Setup & Config)

### Pitfall 4: Model Mapping Ambiguity Causes Routing Confusion

**What:** User configures routing but can't verify it's working. Response metadata shows different model than configured.

**Why:** Model identifiers vary by provider; proxy doesn't track which model actually used; model aliases create confusion.

**Prevention:**
- Log actual model used for each request
- Verify model response by checking metadata
- Clear mapping tables with explicit identifiers
- Add "passthrough mode" for testing

**Phase:** Phase 2 (Core Proxy Middleware)

---

## Roadmap Implications

### Suggested Phase Structure

1. **Phase 1: Core Proxy** — Multi-provider support, model mapping, transparent proxy, config persistence, format translation, streaming, API key management (with Keychain)
2. **Phase 2: Reliability** — SSE streaming, error handling with retry/fallback, timeout management, request logging, routing verification
3. **Phase 3: Transformations** — Tool calling schema transformation, content block handling, provider-specific adapters, rate limiting with backoff
4. **Phase 4: Configuration UI** — Desktop app with visual provider CRUD, model mapping UI, status display
5. **Phase 5: Advanced** — Context-aware routing, request optimization, thinking token parsing (defer based on user validation)

### Research Flags

- **Phase 1:** Needs validation on Keychain integration for macOS
- **Phase 2:** SSE streaming is well-documented (standard patterns); may skip research
- **Phase 3:** Provider-specific adapter quirks need phase research
- **Phase 4:** UI implementation follows standard Tauri patterns; may skip research

### Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (Tauri, Next.js, Express, Zustand) | HIGH | Benchmark data confirms performance; mature ecosystem |
| Features (table stakes) | HIGH | Consistent across all reference implementations |
| Architecture (transformer pipeline) | HIGH | Two production implementations validate pattern |
| Pitfalls (SSE, tool schemas, credentials) | MEDIUM-HIGH | Core technical pitfalls well-researched; user-facing needs validation |
| Phase ordering | MEDIUM | Reasonable progression; may adjust based on user validation |

### Gaps to Address

- **Keychain specifics** — Security patterns well-known, but macOS Keychain implementation details need phase validation
- **Provider API quirks** — Each provider has specific quirks; needs provider-by-provider testing during Phase 3
- **User friction patterns** — Configuration complexity needs UX validation in later phases

---

## Sources

| Source | Type | Confidence |
|--------|------|-------------|
| Tauri 2.x Docs | Official | HIGH |
| Next.js 15.5 Release | Official | HIGH |
| Tauri vs Electron Benchmark | Blog (Apr 2025) | HIGH |
| claude-code-router | Reference project | HIGH |
| free-claude-code | Reference project | HIGH |
| http-proxy-middleware NPM | Package docs | HIGH |
| Zustand Best Practices | YouTube/Articles | MEDIUM |
| Kong AI Gateway | Commercial | MEDIUM |
| OpenRouter docs | Provider API | HIGH |