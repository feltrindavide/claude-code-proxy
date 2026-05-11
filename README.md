# Claude Code Proxy

Proxy macOS menubar app che instrada le richieste di Claude Code attraverso provider ottimizzati — OpenRouter, OpenCode, Ollama, o provider custom. Mostra i tuoi modelli nel picker di Claude Code, gestisce API key e routing, e funziona come Ollama: icona nella barra, popup per controlli, avvio automatico.

<p align="center">
  <img src="docs/screenshot.png" alt="Claude Code Proxy" width="600">
</p>

## Installazione

1. **Scarica l'ultima versione** dalla [pagina delle release](https://github.com/feltrindavide/claude-code-proxy/releases/latest)
2. **Apri il `.dmg`** e trascina **ClaudeCode Proxy.app** nella cartella Applicazioni
3. **Primo avvio**: macOS potrebbe bloccare l'app perché non firmata
   - Vai in **Impostazioni di Sistema → Privacy e Sicurezza**
   - Clicca **"Apri comunque"**
4. L'icona appare nella **barra in alto** 🟠

⚠️ **Importante:** Prima di usare l'app, assicurati di avere Claude Code installato:
```bash
npm install -g @anthropic-ai/claude-code
```

## Come usare

### 1. Configura provider e API key
Clicca l'icona nella barra → **Dashboard** → **Providers**
- Aggiungi OpenRouter, OpenCode, Ollama (locale) o un provider custom
- Inserisci la tua API key per ogni provider

### 2. Importa modelli
**Models** → **Scan** su ogni provider per importare automaticamente i modelli disponibili, oppure aggiungili manualmente.

### 3. Mappa i modelli
**Model Mapping** → scegli quale provider/modello usare per ogni tier Claude:
- **Opus** → Compiti complessi (es. `deepseek/deepseek-v4-flash`)
- **Sonnet** → Uso quotidiano (es. `minimax-m2.5-free`)
- **Haiku** → Risposte veloci (es. `inclusionai/ring-2.6-1t:free`)

### 4. Usa Claude Code
Apri il terminale e usa Claude Code normalmente — il proxy gestisce tutto il routing in automatico.

## Funzionalità

| | |
|---|---|
| 🖥 **Menubar app** | Icona nella barra, popup per controlli rapidi, nessun ingombro nel dock |
| 🔀 **Routing automatico** | Mappa Opus/Sonnet/Haiku a provider e modelli diversi |
| 🎯 **Model Mapping** | Configura quale modello usare per ogni tier con auto-save |
| 📦 **Model Library** | Scan modelli da provider, aggiungi/rimuovi con un click |
| 🌓 **Tema chiaro/scuro** | Passa da tema Cursor (dark) a Claude (light) dalla sidebar |
| 🚀 **Avvio automatico** | L'app parte al login e gestisce il proxy |
| 📊 **Routing Log** | Storico richieste con provider, modello, latenza |
| ⚙️ **Configurazione via UI** | Aggiungi provider, importa configurazioni, export backup |
| 🔄 **Auto-aggiornamento** | L'app notifica quando una nuova versione è disponibile |
| ⌨️ **Popup rapido** | Clicca l'icona per status, stop/start proxy, cambio mapping |

## Popup menubar
Un click sull'icona mostra il popup con:
- **Stato proxy** e pulsante Start/Stop
- **Model Mapping** editabile con auto-save
- Pulsanti per **Dashboard** e **Settings**

Click destro → menu con **Dashboard** e **Quit** (arresta proxy ed esce).

## Sviluppo

```bash
# Clona il repo
git clone https://github.com/feltrindavide/claude-code-proxy.git
cd claude-code-proxy

# Installa dipendenze
npm install

# Avvia in sviluppo (proxy + web)
npm run dev

# Avvia tutto (proxy + web + app Tauri)
npm run dev:app

# Build per distribuzione (.dmg)
npm run tauri build
```

## Stack

| Componente | Tecnologia |
|---|---|
| **Backend proxy** | Express.js + TypeScript |
| **Frontend** | Next.js 15 + Tailwind CSS + Zustand |
| **Desktop app** | Tauri 2.x (Rust) |
| **Font** | JetBrains Mono |
| **Provider** | OpenRouter, OpenCode, Ollama, Custom |

## Requisiti

- **macOS 12+** (Apple Silicon o Intel)
- **Node.js 18+** (per il proxy Express)
- **Claude Code CLI** (per usare Claude Code)

## Licenza

MIT
