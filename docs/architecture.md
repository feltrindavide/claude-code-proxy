# Architecture Overview

Claude Code Proxy routes Claude Code requests through configured AI providers (OpenRouter, OpenCode, Ollama, Custom) without modifying Claude Code behavior.

## System Components

### Express Proxy (port 3456)

The core proxy server built with Express.js. It receives requests from Claude Code CLI (via `ANTHROPIC_BASE_URL`), transforms them to the target provider's API format, and streams responses back.

- **Location:** `packages/proxy/src/`
- **Port:** 3456 (configurable)
- **Key modules:** Provider registry, SSE transformers, admin API routes

### Next.js Admin UI (port 3000)

A web-based management interface for configuring providers, model mappings, viewing routing logs, and managing settings.

- **Location:** `apps/web/src/`
- **Port:** 3000
- **Stack:** Next.js 15 + React 19 + Tailwind CSS
- **Features:** Provider management, model mapping, routing log, config export/import

### Tauri Desktop Wrapper

Packages the proxy and admin UI into a native macOS desktop application with system tray integration, auto-update support, and native Keychain access.

- **Location:** `src-tauri/`
- **Stack:** Tauri 2.x + Rust
- **Features:** Proxy lifecycle management, system tray, auto-updater

### macOS Keychain (API Key Storage)

Secure storage for provider API keys. Keys are never written to config files or logs.

- **Service name:** `claude-code-proxy`
- **Library:** keytar
- **Account names:** Provider keyId values

## Data Flow

```
Claude Code CLI
    │
    │ ANTHROPIC_BASE_URL=http://localhost:3456
    ▼
Express Proxy (localhost:3456)
    │
    │ Routes request based on model tier mapping
    ▼
Configured Provider
    ├── OpenRouter (https://openrouter.ai/api/v1)
    ├── OpenCode (https://api.opencode.ai/v1)
    ├── Ollama (http://localhost:11434)
    └── Custom (any OpenAI-compatible endpoint)
```

1. Claude Code sends requests to `ANTHROPIC_BASE_URL` (localhost:3456)
2. Proxy determines target provider based on model tier (opus/sonnet/haiku)
3. Request is transformed to the provider's API format
4. Response is streamed back to Claude Code in Anthropic-compatible SSE format
5. Admin UI manages providers and routes via `/admin` API endpoints

## Configuration

### Config File

- **Location:** `~/.claude-code-proxy/config.json`
- **Format:** JSON with `providers[]` and `routes[]` arrays
- **Write mode:** 0o600 (owner read/write only)
- **Write pattern:** Atomic (temp file + rename)

### API Keys

- **Storage:** macOS Keychain (service: `claude-code-proxy`)
- **Account:** Provider keyId (e.g., `openrouter`, `opencode`)
- **Never stored in:** config files, logs, or environment variables

### Shell Environment

- **Variable:** `ANTHROPIC_BASE_URL=http://localhost:3456`
- **Written to:** Shell profile file (`.zshenv`, `.bashrc`, or fish config)
- **Detection:** Based on `$SHELL` environment variable

## Model Routing

Default mappings route Claude model tiers to specific providers:

| Claude Tier | Provider   | Target Model                                  |
|-------------|------------|-----------------------------------------------|
| opus        | opencode   | qwen3.6                                       |
| sonnet      | openrouter | mimo-v2-flash                                 |
| haiku       | opencode   | nvidia/nemotron-3-super-120b-a12b:free        |

These mappings are configurable via the Admin UI or `/admin/routes` API.

## Security Model

- API keys stored exclusively in macOS Keychain
- Config file stores only `keyId` (account name), never actual keys
- Admin API masks key identifiers in responses
- Setup script sanitizes API key patterns in error messages
- All config writes use atomic file operations
