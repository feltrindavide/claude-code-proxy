# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Codex Proxy — macOS menu bar app that routes Codex HTTP requests through optimized LLM providers. Express proxy (port 3456) intercepts `/v1/messages` calls, resolves routes by Codex tier (Opus/Sonnet/Haiku), transforms requests to provider format, and streams responses back as Anthropic SSE. Next.js dashboard (port 3457) for management. Tauri 2 wrapper for tray icon and desktop integration.

## Architecture

```
Codex CLI ──POST /v1/messages──▶ Express Proxy (:3456)
                                         │
                                         ├─ ProviderService ── route resolution
                                         ├─ Adapters ── request/response transform
                                         ├─ ContextRegistry ── token tracking
                                         ├─ Keychain ── API key storage
                                         └─ HTTPS :8743 ── Codex Desktop support
                                              │
                                        Next.js Dashboard (:3457)
                                              │
                                        Tauri 2 (tray icon, menu bar)
```

**Key packages:**
- `packages/proxy/src/` — Core proxy: Express server, provider adapters (OpenRouter, OpenCode, Ollama, Gemini, DeepSeek, Anthropic, Custom), middleware, services (config, provider, context-registry, keychain, token-counter, session-tracker, sse-transformer, retryHandler)
- `apps/web/src/` — Next.js 15 app router, Zustand stores, Tailwind CSS
- `src-tauri/src/` — Rust Tauri 2 app (tray menu, proxy child process lifecycle, optional autostart)
- `packages/cli/` — CLI setup tool (Commander)

**Data flow:** Every POST to `/v1/messages` → model name parsed → `ProviderService.resolveModelRoute()` for tier-based routing or `resolveCustomModel()` for exact/partial match → adapter transforms Anthropic body to provider format → `fetchWithRetry()` → adapter transforms SSE response back → token inflation adjustment → streamed to Codex. Session tracking persists to `~/.Codex/Codex-proxy/data/sessions.json`.

**Config directory:** `~/.Codex/Codex-proxy/` — `config.json` (providers, routes, context), `data/` (request log, sessions, secrets), `logs/`, `scripts/`, `config-backup/`.

## Development Commands

```bash
# Start proxy + web dashboard (concurrent dev servers)
npm run dev

# Add Tauri desktop app to the above
npm run dev:app

# Build web frontend only (Next.js static export)
npm run build

# Run proxy unit tests (vitest, in packages/proxy)
npm run test -w packages/proxy
# or: cd packages/proxy && npm run test:run

# Run E2E tests (Playwright)
npm run test:e2e
npm run test:e2e:smoke    # @smoke tagged tests only

# Build Tauri production .dmg
npm run tauri build

# Initial setup (config, keychain, plugins)
npm run setup
```

## Key Patterns

- **Provider adapters** in `packages/proxy/src/adapters/` implement the `ProviderAdapter` interface (transformRequest, transformResponse, validate). One file per provider type.
- **Session tracking** via `extractSessionId()` from `body.metadata.user_id`. Per-session model, token usage, inflation factor persisted to disk.
- **Token inflation** adjusts Codex's context display when the upstream model has a different context window than the reference Codex tier.
- **Subagent model tag**: `<CCR-SUBAGENT-MODEL>model</CCR-SUBAGENT-MODEL>` in system prompt overrides the routed model for subagent tasks.
- **Model mapping**: routes are tier-based (`Codex-opus-*` → opus) with optional custom model name matching (exact then partial substring).
- **Config validation**: providers are validated on startup (warnings only, doesn't block). Results stored in `validationStoreService` for UI display.
- **Error handling**: upstream errors are returned as valid Anthropic-formatted text responses (not error events), so Codex always gets a parsable response.
