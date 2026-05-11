# Claude Code Proxy

Proxy che instrada le richieste di Claude Code attraverso provider ottimizzati (OpenRouter, OpenCode, Ollama, Custom). Con app macOS menu bar inclusa.

## Features

- 🔀 **Routing automatico** — Mappa Opus/Sonnet/Haiku a provider e modelli diversi
- 🎯 **Model Mapping** — Configura quale modello usare per ogni tier
- 🖥 **macOS Menu Bar App** — Popup compatto con status, mapping rapido, start/stop
- 🌓 **Tema chiaro/scuro** — Scegli tra tema Cursor (dark) e Claude (light)
- 🔄 **Auto-aggiornamento** — Via GitHub Releases
- 🚀 **Avvio automatico** — Si avvia al login e gestisce il proxy
- 📊 **Routing Log** — Storico delle richieste con provider, modello, latenza
- 📦 **Model Library** — Gestisci modelli per provider, scan da API

## Installazione

Scarica il DMG dall'[ultima release](https://github.com/feltrindavide/claude-code-proxy/releases/latest).

Oppure da terminale:
```bash
git clone https://github.com/feltrindavide/claude-code-proxy.git
cd claude-code-proxy
npm install
npm run dev:app
```

## Come usare

1. **Aggiungi provider** con le tue API key (Provider → Add Provider)
2. **Importa modelli** (Models → Scan) o aggiungili manualmente
3. **Configura il mapping** (Model Mapping → scegli provider/modello per tier)
4. **Usa Claude Code** — punta al proxy con `ANTHROPIC_BASE_URL=http://localhost:3456`

## Sviluppo

```bash
npm run dev        # Solo proxy + web UI
npm run dev:app    # Proxy + web UI + app Tauri
npm run tauri build  # Build DMG
```

## Stack

- **Backend:** Express.js + TypeScript + tsup
- **Frontend:** Next.js 15 + Tailwind CSS + Zustand
- **Desktop:** Tauri 2.x (Rust) + System Tray
- **Font:** JetBrains Mono
