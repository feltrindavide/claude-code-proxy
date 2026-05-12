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
| **Custom** | Your URL | OpenAI or Anthropic |

### 2. Map models
Go to **Model Mapping** → select provider/model per Claude tier (Opus/Sonnet/Haiku)

### 3. Use Claude Code
The proxy handles routing automatically. Check for updates in **Settings → About → Check for Updates**.

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
| **Providers** | OpenRouter, OpenCode Zen/Go, Ollama, Custom |

## Requirements

- macOS 12+ (Apple Silicon or Intel)
- Node.js 18+
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`

## License

MIT
