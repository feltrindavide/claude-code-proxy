# Feature Landscape

**Domain:** AI Proxy / Model Routing Application
**Researched:** 2026-05-10
**Confidence:** HIGH

## Executive Summary

AI proxy applications sit between Claude Code (or similar AI clients) and upstream providers, enabling model substitution, cost optimization, and provider flexibility. The core value proposition is **transparency** — users get different models without changing their behavior.

Research across Kong AI Gateway, ibl.ai, Sealos, ProxyGuard, SmolRouter, OpenRouter, and the reference projects (claude-code-router, free-claude-code) reveals:

- **Table stakes:** Multi-provider support, model mapping, format translation, streaming, error handling
- **Differentiators:** Context-aware routing, request optimization, thinking/tool parsing, visual UI
- **Anti-features:** Built-in inference, real-time switching without restart, web-only config

---

## Table Stakes

Features users expect. Missing = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Multi-Provider Support** | Users want flexibility to choose providers (OpenRouter, OpenCode, Ollama, Custom) | Medium | Reference implementations support 4-6 providers; extensibility matters |
| **Model Mapping** | Map Claude tiers (Opus/Sonnet/Haiku) to provider-specific models | Low | Core use case; per-tier routing is the standard pattern |
| **Transparent Proxy** | Claude Code must work unchanged — no user behavior changes | Low | Expose Anthropic-compatible `/v1/messages`, `/v1/models`, `/v1/messages/count_tokens` |
| **Configuration Persistence** | Settings must survive restart | Low | JSON config file or equivalent; user won't reconfigure each session |
| **Format Translation** | Convert between Anthropic Messages and OpenAI Chat formats | Medium | NIM and some providers need OpenAI format; OpenRouter uses Anthropic Messages |
| **Streaming Responses** | Claude Code expects SSE streaming | Medium | SSE event translation from provider format to Claude format |
| **Basic Error Handling** | Handle 5xx, rate limits, timeouts gracefully | Medium | Retry logic, fallback to secondary model/provider |
| **API Key Management** | Securely store and use provider API keys | Low | Environment variables or config file; some support Keychain (wbern fork) |

### Dependencies

```
Model Mapping → Transparent Proxy → Format Translation → Streaming
                                  → Error Handling
Configuration Persistence → API Key Management
```

---

## Differentiators

Features that set products apart. Not expected, but valued. These are where competitive advantage lives.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Context-Aware Routing** | Route based on token count (e.g., long context > 32K/60K tokens) | Medium | claude-code-router uses `tiktoken` for real-time counting; triggers separate router |
| **Task-Specific Routing** | Different models for background, thinking, web search, images | Medium-High | Supported by claude-code-router (default, background, think, longContext, webSearch, image) |
| **Request Optimization** | Intercept trivial requests locally (quota probes, title gen, suggestions) | Low-Medium | free-claude-code intercepts 5 categories; saves quota on rate-limited providers (NIM 40 req/min) |
| **Thinking Token Parsing** | Convert `<thinking>` tags or `reasoning_content` to native Claude blocks | Medium | Critical for DeepSeek R1, Kimi K2.5; enables proper UI display |
| **Heuristic Tool Parser** | Convert text-output tool calls to structured JSON | Medium | Open-source models often output malformed tool calls; free-claude-code has parser |
| **Subagent Control** | Prevent runaway background subagents (force `run_in_background=false`) | Low | free-claude-code intercepts Task tool; critical for rate-limited free tiers |
| **Advanced Rate Limiting** | Rolling-window throttle + exponential backoff + concurrency cap | Medium | Proactive + reactive; NIM's 40 req/min requires careful management |
| **Provider Preferences** | OpenRouter-specific: prefer specific providers, exclude others, sort by price/latency | Medium | OpenRouter supports `provider` object with `order`, `ignore`, `sort` options |
| **Custom Router Scripts** | User-defined routing logic beyond built-in scenarios | High | claude-code-router supports `CUSTOM_ROUTER_PATH` for advanced rules |
| **Visual Configuration UI** | Desktop app UI for provider/model configuration vs. editing JSON | Medium | Cursor-style design per PROJECT.md; differentiates from CLI tools |
| **CLI Model Management** | `ccr model` command to list/switch models without config editing | Low | claude-code-router has this; adds convenience |
| **GitHub Actions Integration** | Run Claude Code in CI with router | Medium | Trigger via environment variable; useful for automation |
| **Remote Control (Discord/Telegram)** | Control coding agent via chat interfaces | High | free-claude-code supports this; out of scope for v1 per PROJECT.md |

### Dependencies

```
Context-Aware Routing → Token Counting → Request Optimization
Task-Specific Routing → Custom Router Scripts
Thinking Token Parsing → Heuristic Tool Parser
Advanced Rate Limiting → Subagent Control
```

---

## Anti-Features

Features to explicitly **NOT** build. Explicitly exclude or defer.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Real-Time Model Switching** | Complexity high; config change + restart is acceptable pattern | Document that config changes require restart; acceptable tradeoff |
| **Built-in Local Inference** | Pass-through proxy; not an inference engine | Rely on Ollama/LM Studio/llama.cpp for local models |
| **Web-Based Config Panel** | PROJECT.md specifies native macOS app | Build native Tauri/Electron UI |
| **Mobile Support** | Out of scope per PROJECT.md | Focus on macOS desktop only |
| **Built-in Model Caching** | Complexity beyond pass-through proxy; better handled at provider or separate layer | Let providers handle caching; focus on routing |
| **Multi-Tenant / Organization** | Single-user local app; not enterprise gateway | Keep scope to individual developer |
| **Cost Analytics Dashboard** | Nice-to-have; adds complexity not required for v1 | Defer to future milestone |

---

## MVP Recommendation

Prioritize in this order:

### Phase 1 (Core Proxy)

1. **Multi-Provider Support** — OpenRouter, OpenCode, Ollama, Custom (extensible)
2. **Model Mapping** — Per-tier routing (Opus → X, Sonnet → Y, Haiku → Z)
3. **Transparent Proxy** — Anthropic-compatible endpoints
4. **Configuration Persistence** — JSON config file
5. **Format Translation** — Anthropic ↔ OpenAI where needed
6. **Streaming** — SSE support

### Phase 2 (Reliability)

7. **Basic Error Handling** — Retry, fallback
8. **Advanced Rate Limiting** — Rolling window, backoff
9. **Thinking Token Parsing** — For OpenRouter models that support it

### Phase 3 (Polish)

10. **Visual Configuration UI** — Desktop app interface
11. **Context-Aware Routing** — Token threshold for long context
12. **Request Optimization** — Trivial request interception

### Defer to Future

- Custom router scripts (Phase 4+)
- Task-specific routing beyond context awareness (Phase 4+)
- Discord/Telegram remote control (explicitly out of scope per PROJECT.md)
- GitHub Actions integration (nice-to-have, not core)

---

## Feature Dependencies Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INTERFACE (Desktop App)                │
├─────────────────────────────────────────────────────────────────┤
│  CLI Management  │  Visual Config  │  Status Display           │
├─────────────────────────────────────────────────────────────────┤
│                     CONFIGURATION PERSISTENCE                    │
│              (JSON file with provider + model mapping)           │
├─────────────────────────────────────────────────────────────────┤
│                     PROXY SERVER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Routing    │  │  Translation  │  │  Streaming   │        │
│  │   Engine     │  │    Layer      │  │    Handler   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│         │                 │                 │                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Context    │  │   Request    │  │   Error      │        │
│  │   Detector   │  │  Optimizer    │  │  Handler     │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
├─────────────────────────────────────────────────────────────────┤
│                     PROVIDER ADAPTERS                           │
│   OpenRouter  │  OpenCode  │  Ollama  │  Custom (extensible)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Sources

| Source | Type | Confidence | Relevance |
|--------|------|------------|-----------|
| musistudio/claude-code-router | Reference project | HIGH | Core feature set, routing patterns |
| free-claude-code | Reference project | HIGH | Implementation details, request optimization |
| Kong AI Proxy Advanced | Commercial gateway | MEDIUM | Enterprise patterns (load balancing, circuit breakers) |
| ibl.ai Model Router | Commercial router | MEDIUM | Task classification, cost optimization |
| Sealos AI Proxy | Commercial gateway | MEDIUM | Caching, rate limiting patterns |
| OpenRouter docs | Provider API | HIGH | Provider preferences, routing options |
| SmolRouter | Open source | MEDIUM | Lightweight patterns, SQLite metrics |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Table stakes | HIGH | Consistent across all researched implementations |
| Differentiators | HIGH | Reference projects validated; commercial products confirm |
| Anti-features | HIGH | Based on explicit PROJECT.md constraints and complexity analysis |
| Phase ordering | MEDIUM | Reasonable progression; may adjust based on user validation |