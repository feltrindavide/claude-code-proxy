# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

- **Install dependencies**: `npm install` (run in the root directory)
- **Start full application**: `npm run dev` – starts both proxy backend and frontend concurrently
- **Start proxy server only**: `cd proxy && npm start` – starts the OpenRouter proxy backend
- **Start frontend only**: `cd dashboard && npm run dev` – starts the Vite frontend dev server
- **Build for production**: `npm run build` – compiles TypeScript and bundles with Vite (frontend only)
- **Run ESLint**: `npm run lint` – lints the entire codebase
- **Preview built app**: `npm run preview` – serves the production build locally
- **Start electron app**: `npm run electron:dev` – launches the desktop application
- **Build electron app**: `npm run electron:build` – builds the desktop application for distribution

## High‑Level Architecture

The application consists of two main components that now communicate properly:

### Frontend (React + TypeScript)
Located under `dashboard/src/`.
- `App.tsx` – top‑level component managing UI state (chat interface, proxy status, selected model, settings modal) and making actual HTTP requests to the proxy backend
- `Settings.tsx` – modal for configuring the model mapping (OPUS/SONNET/HAIKU → OpenRouter model names); persists data in `localStorage`
- `LogViewer.tsx` – component that displays proxy logs (currently shows mock logs, to be connected to real logging endpoint)
- `main.tsx` – React entry point
- State is immutable; updates use the spread operator per the project’s coding‑style rules
- Styling: CSS imported in `App.css`; additional styling follows standard Vite conventions

### Backend Proxy (Node.js/TypeScript)
Located under `proxy/`.
- `server.ts` – Express server that proxies requests to OpenRouter API
- `config.ts` – Handles loading configuration from user's home directory
- `cert/` – Directory for SSL certificates (for HTTPS support)
- `package.json` – Defines dependencies and startup scripts
- The proxy forwards requests from the frontend to OpenRouter with model mapping capabilities
- Uses axios for HTTP requests to OpenRouter API
- Falls back to HTTP if HTTPS certificates are not found

## Communication Flow

1. **Frontend → Backend**: The React app in `App.tsx` makes POST requests to `http://localhost:8080/proxy` with:
   ```json
   {
     "model": "opus", // or "sonnet" or "haiku" (internal identifiers)
     "messages": [{"role": "user", "content": "user message"}]
   }
   ```

2. **Backend Mapping**: The proxy in `proxy/server.ts` looks up the internal model identifier in the mapping loaded from `~/Library/Application Support/ClaudeProxy/config.json`

3. **Backend → OpenRouter**: The proxy forwards the request to OpenRouter with the mapped model name (e.g., "qwen/qwen3.6-plus" for "opus")

4. **OpenRouter → Backend → Frontend**: The response flows back through the same path to the frontend UI

## Project Structure Overview

```
claude-proxy/
├── CLAUDE.md               # This guidance file
├── package.json            # Root package with concurrent start script
├── dashboard/              # React/Vite application (frontend)
│   ├── package.json        # Frontend scripts and dependencies
│   ├── vite.config.ts      # Vite configuration
│   ├── src/
│   │   ├── App.tsx         # Main UI component with chat and proxy communication
│   │   ├── Settings.tsx    # Settings modal for model mapping configuration
│   │   ├── LogViewer.tsx   # Log display component
│   │   ├── main.tsx        # React entry point
│   │   ├── App.css         # Global styles
│   │   ├── index.css       # Global styles
│   │   └── components/     # Reusable UI components
│   ├── public/             # Static assets
│   └── tsconfig*.json      # TypeScript configurations
├── proxy/                  # Node.js/TypeScript proxy backend
│   ├── package.json        # Backend scripts and dependencies
│   ├── server.ts           # Express proxy server
│   ├── config.ts           # Configuration loader
│   └── cert/               # SSL certificates for HTTPS
├── docs/                   # Documentation files
│   └── STYLE_GUIDE.md      # Coding style guidelines
├── scripts/                # Utility scripts
└── .claude/                # Claude Code configuration
    └── settings.local.json # Local settings overrides
```

## Development Guidelines

1. **Full Stack Development**: Use `npm run dev` from the root directory to start both frontend and backend concurrently using concurrently package

2. **Independent Development**: 
   - Backend: Work in `proxy/` directory, use `npm start` or `npm run dev` (with ts-node-dev)
   - Frontend: Work in `dashboard/` directory, use `npm run dev`

3. **Configuration Setup**: Before running, ensure the config file exists:
   ```json
   {
     "apiKey": "your-openrouter-api-key",
     "modelMapping": {
       "opus": "qwen/qwen3.6-plus",
       "sonnet": "openai/gpt-oss-120b:free",
       "haiku": "z-ai/glm-4.5-air:free"
     }
   }
   ```
   Location: `~/Library/Application Support/ClaudeProxy/config.json`

4. **Model Selection**: The frontend UI allows switching between opus, sonnet, and haiku models, which are mapped to the corresponding OpenRouter models in the config

5. **Building**: The frontend uses Vite for bundling. TypeScript is compiled via `tsc -b` before production builds.

## Metaswarm Orchestration

This project uses Metaswarm for agent orchestration and task automation:

- **Setup**: Run `/metaswarm:setup` to configure the project with Metaswarm
- **Start tasks**: Use `/start-task` to begin working on orchestrated tasks
- **Status**: Check setup state with `/metaswarm:status`
- **Prime knowledge**: Use `/prime` to load relevant context before starting work

Metaswarm provides skills for:
- Task decomposition and parallel execution
- Agent coordination (architect, coder, reviewer, etc.)
- External tool integration (Codex, Gemini)
- Visual review and testing automation
- Git hooks and CI pipeline setup
- BEADS knowledge management

Future contributors should focus on:
- Enhancing the chat UI with features like message streaming, error boundaries, and loading states
- Implementing real logging in the backend and connecting LogViewer to actual log endpoints
- Adding comprehensive tests using Playwright (`e2e-runner` skill) for both frontend and backend
- Improving error handling and edge case management in the proxy
- Adding authentication and rate limiting capabilities to the proxy
- Implementing conversation history persistence