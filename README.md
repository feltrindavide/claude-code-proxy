# Claude Code Proxy

macOS menu bar app that routes Claude Code requests through optimized providers — OpenRouter, OpenCode, Ollama, or custom providers. Shows your models in Claude Code's model picker, manages API keys and routing, and works like Ollama: tray icon, popup controls, auto-start.

## Installation

1. **Download the latest release** from the [releases page](https://github.com/feltrindavide/claude-code-proxy/releases/latest)
2. **Open the `.dmg`** and drag **ClaudeCode Proxy.app** into your Applications folder
3. **First launch**: macOS may block the app because it's unsigned
   - Go to **System Settings → Privacy & Security**
   - Click **"Open Anyway"**
4. The orange icon appears in your **menu bar** 🟠

⚠️ **Note:** Make sure Claude Code is installed before using the proxy:
```bash
npm install -g @anthropic-ai/claude-code
```

## Usage

### 1. Add providers and API keys
Click the menu bar icon → **Dashboard** → **Providers**
- Add OpenRouter, OpenCode, Ollama (local), or a custom provider
- Enter your API key for each provider

### 2. Import models
Go to **Models** → click **Scan** on each provider to fetch available models, or add them manually.

### 3. Map models to tiers
**Model Mapping** → choose which provider/model to use for each Claude tier:
- **Opus** → Complex tasks (e.g. `deepseek/deepseek-v4-flash`)
- **Sonnet** → Daily use (e.g. `minimax-m2.5-free`)
- **Haiku** → Quick answers (e.g. `inclusionai/ring-2.6-1t:free`)

### 4. Use Claude Code
Open your terminal and run Claude Code as usual — the proxy handles all routing automatically.

## Features

| | |
|---|---|
| 🖥 **Menu bar app** | Tray icon, quick popup, no dock clutter |
| 🔀 **Auto-routing** | Map Opus/Sonnet/Haiku to different providers and models |
| 🎯 **Model Mapping** | Configure per-tier models with auto-save |
| 📦 **Model Library** | Scan models from providers, add/remove with one click |
| 🌓 **Light/Dark theme** | Switch between Cursor (dark) and Claude (light) themes |
| 🚀 **Auto-start** | App launches at login and manages the proxy |
| 📊 **Routing Log** | Request history with provider, model, latency |
| ⚙️ **UI configuration** | Add providers, import/export config, backup |
| 🔄 **Auto-update** | App notifies when a new version is available |
| ⌨️ **Quick popup** | Click tray icon for status, start/stop, quick mapping |

## Menu bar popup
Click the tray icon to open the popup with:
- **Proxy status** and Start/Stop button
- **Editable Model Mapping** with auto-save
- **Dashboard** and **Settings** buttons

Right-click → menu with **Dashboard** and **Quit** (stops proxy and exits).

## Development

```bash
# Clone the repo
git clone https://github.com/feltrindavide/claude-code-proxy.git
cd claude-code-proxy

# Install dependencies
npm install

# Dev mode (proxy + web only)
npm run dev

# Dev mode (proxy + web + Tauri app)
npm run dev:app

# Build for distribution (.dmg)
npm run tauri build
```

## Stack

| Component | Technology |
|---|---|
| **Proxy backend** | Express.js + TypeScript |
| **Frontend** | Next.js 15 + Tailwind CSS + Zustand |
| **Desktop app** | Tauri 2.x (Rust) |
| **Font** | JetBrains Mono |
| **Providers** | OpenRouter, OpenCode, Ollama, Custom |

## Requirements

- **macOS 12+** (Apple Silicon or Intel)
- **Node.js 18+** (for the Express proxy)
- **Claude Code CLI** (to use Claude Code)

## License

MIT
