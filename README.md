# Claude Code Proxy

macOS menu bar app that routes Claude Code requests through optimized providers — OpenRouter, OpenCode (Zen/Go), Ollama, or custom providers. Manages API keys, model mappings, and auto-routes requests. Tray icon, popup controls, auto-start.

## Installation

1. **Download** from the [releases page](https://github.com/feltrindavide/claude-code-proxy/releases/latest)
2. **Open the `.dmg`** and drag into Applications
3. **First launch**: macOS may block unsigned apps. Go to **System Settings → Privacy & Security** → **Open Anyway**
4. Orange icon 🟠 appears in your menu bar

## Quick Start

### 1. Add providers
Click tray icon → **Dashboard** → **Providers** → **Add Provider**

Choose a type:
| Type | Base URL | API Format |
|------|----------|------------|
| **OpenRouter** | `https://openrouter.ai/api` | Anthropic native |
| **OpenCode Zen** | `https://opencode.ai/zen` | Anthropic native |
| **OpenCode Go** | `https://opencode.ai/zen/go` | Anthropic native |
| **Ollama** | `http://localhost:11434` | Anthropic native |
| **Google Gemini** | `https://generativelanguage.googleapis.com` | OpenAI (`/v1beta/chat/completions`) |
| **Anthropic** | `https://api.anthropic.com` | Anthropic native |
| **DeepSeek** | `https://api.deepseek.com` | OpenAI (`/v1/chat/completions`) |
| **Custom** | Your URL | OpenAI or Anthropic |

### 2. Map models
Go to **Model Mapping** → select provider/model per Claude tier (Opus/Sonnet/Haiku)

### 3. Use Claude Code
The proxy handles routing automatically. Check for updates in **Settings → About → Check for Updates**.

> 💡 In Claude Code, type `/proxy-context` to see which model was used last and how much of the context window was consumed. This skill is auto-installed when the app starts.

### 4. (Optional) Use with Claude Desktop
The proxy also works with the Claude Desktop app (chat + cowork). After installing, run this once:

```bash
curl -X POST http://localhost:3456/admin/setup-desktop
```

This will:
1. Add `api.anthropic.com → 127.0.0.1` to `/etc/hosts`
2. Generate and trust a self-signed TLS certificate for `api.anthropic.com`
3. Redirect port 443 → 8743 via `pf` (macOS packet filter)
4. Start an HTTPS server on port 8743

Then fully quit and reopen Claude Desktop. All requests (chat, cowork, code) will be routed through the proxy.

## Features

| | |
|---|---|
| 🖥 **Menu bar app** | Tray icon, quick popup, no dock clutter |
| 🔀 **Auto-routing** | Map Opus/Sonnet/Haiku to different providers |
| 🎯 **Model Mapping** | Configure per-tier models with auto-save |
| 🚀 **Auto-start** | App launches at login, manages the proxy |
| 📊 **Routing Log** | Request history with provider, model, latency |
| 🔄 **Update check** | Dashboard → Settings → Check for Updates |
| 🎨 **Provider types** | OpenRouter, OpenCode Zen/Go, Ollama, Custom |
| ⚙️ **Custom API format** | Choose OpenAI or Anthropic format for custom providers |
| ⌨️ **Quick popup** | Click tray icon for status, start/stop, quick mapping |
| 📐 **Per-session context tracking** | Each Claude Code session has independent model, tokens, and context tracking. Session-aware status line reads `session_id` from stdin. |
| 🧠 **Smart token limits** | Auto-boosts small `max_tokens` for reasoning models, clamps to model limits |
| 🎯 **Accurate token counting** | tiktoken (cl100k_base) instead of chars/4 for precise context metrics |
| 🧠 **Thinking filter** | Per-tier control over thinking blocks: passthrough, strip, transform, or auto-detect |
| ⚡ **Fast path** | Short-circuits trivially-answerable requests without upstream API calls |
| 💾 **Response cache** | Caches identical non-streaming requests (configurable TTL, max 50 entries) |
| 🔍 **Local discovery** | Auto-discovers local providers (Ollama) with auto-scanned model contexts |
| 🔧 **Tool arg repair** | Auto-fixes malformed JSON in tool call arguments (single quotes, trailing commas, unquoted keys) |
| 🏷️ **Subagent model tag** | `<CCR-SUBAGENT-MODEL>` in system prompt to route subagents to a different model |
| 🔍 **`/proxy-context`** | Type `/proxy-context` in Claude Code to see current model and context usage |
| 📟 **Per-session status line** | Auto-installed bold context bar with model, folder, context %, per-session |
| 🔄 **Auto-compact hook** | Suggests compacting when context exceeds configurable threshold (default 70%) |
| 🚀 **Partial model matching** | Type `glm-4.5-air` instead of `z-ai/glm-4.5-air:free` — proxy finds the closest match |
| 🗂️ **Structured directory** | `~/.claude/claude-code-proxy/` with `data/`, `logs/`, `scripts/`, `config-backup/` |

## Menu bar popup

Left-click tray icon → popup with proxy status, Start/Stop, model mapping.
Right-click → **Dashboard** (opens browser) or **Quit**.

## Development

```bash
git clone https://github.com/feltrindavide/claude-code-proxy.git
cd claude-code-proxy
npm install

npm run dev          # proxy + web only
npm run dev:app      # proxy + web + Tauri app
npm run tauri build  # Build .dmg
```

## Stack

| Component | Technology |
|---|---|
| **Proxy** | Express.js (TypeScript) |
| **Frontend** | Next.js 15, Tailwind CSS, Zustand |
| **Desktop** | Tauri 2.x (Rust) |
| **Providers** | OpenRouter, OpenCode Zen/Go, Ollama, Google Gemini, Anthropic, DeepSeek, Custom |

## Requirements

- macOS 12+ (Apple Silicon or Intel)
- Node.js 20+
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- `ANTHROPIC_BASE_URL` must be set to `http://localhost:3456` (auto-configured by setup)

## Environment

The proxy automatically sets `ANTHROPIC_BASE_URL=http://localhost:3456`. Claude Code sends all requests to the proxy, which routes them through configured providers.

The `~/.claude/claude-code-proxy/` directory contains:
```
config.json              — providers, routes, auto-compact threshold
proxy-context.json       — model context windows and max output limits (editable in Settings)
models.sh                — env vars for Claude Code model picker
scripts/
  context-status.js      — per-session context bar (auto-installed)
  auto-compact-hook.js   — PostToolUse hook for context alerts
data/
  sessions.json          — per-session token usage tracking
  secrets.json           — API keys (macOS Keychain fallback)
  request-log.json       — request history
  rate-limits.json       — rate limit state
  validation-results.json — provider validation state
logs/
  startup.log            — proxy startup log
config-backup/           — automatic config backups
```

## License

MIT
