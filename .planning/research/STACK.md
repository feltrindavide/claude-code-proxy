# Technology Stack

**Project:** Claude Code Proxy — macOS desktop app that routes Claude Code through various AI providers (OpenRouter, OpenCode, Ollama, Custom)

**Researched:** May 10, 2026

## Recommended Stack

### Desktop Wrapper: Tauri 2.x

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| Tauri | 2.x (latest stable) | Desktop app wrapper | **Best choice for this project.** Benchmarks show ~58% less memory, ~96% smaller bundle vs Electron. Native macOS WebView (WKWebView) means smaller footprint. Rust backend is ideal for proxy server performance. |
| create-tauri-app | 2.x | Scaffolding | `npm create tauri-app@latest` with React/TypeScript template |

**Why Tauri over Electron:**
- **Memory:** ~58% less RAM usage in benchmarks
- **Bundle size:** ~96% smaller (5MB vs 150MB+ for comparable apps)
- **Security:** Smaller attack surface, no bundled Node.js
- **macOS native:** Uses system WebView (WKWebView), not bundled Chromium
- **Performance:** Rust backend excels at HTTP proxy operations (non-blocking I/O)

**Why NOT Electron:**
- Ships full Chromium + Node.js runtime (bloated)
- Higher memory footprint (bad for developer tools)
- Security concerns from larger attack surface
- Slower cold startup (~3.2s vs ~1.4s for Tauri)

---

### Frontend: Next.js 15 + React 19

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| Next.js | 15.x (latest stable) | React framework | App Router with Server Components by default. Turbopack now stable for fast builds. |
| React | 19.x | UI library | Stable as of Next.js 15.1. Use `useActionState` (not deprecated `useFormState`). |
| TypeScript | 5.x | Type safety | Required for maintainability |
| Tailwind CSS | 3.x | Styling | Matches Cursor design system tokens. Use with `tailwind-merge` and `clsx`. |

**Installation:**
```bash
npx create-next-app@latest claudecode-proxy --typescript --tailwind --eslint
cd claudecode-proxy
npm install @tauri-apps/api@latest
```

**Project Structure (App Router):**
```
/app
  ├── layout.tsx         # Root layout
  ├── page.tsx           # Home (configuration UI)
  ├── providers/         # Zustand store provider
  └── components/        # UI components
    ├── ProviderCard.tsx
    ├── ModelMapper.tsx
    └── StatusIndicator.tsx
```

---

### Backend: Express.js + HTTP Proxy Middleware

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| Express | 4.x | HTTP server | Lightweight, well-established. Runs in Tauri sidecar or as Node.js server within Electron. |
| http-proxy-middleware | 3.x | Request routing | **Primary choice.** Supports dynamic target routing, request/response transformation, WebSocket. Powers the model routing logic. |
| node-http-proxy | 1.x (alt) | Lower-level proxy | Alternative if more control needed |

**Proxy Architecture:**

The app needs two layers:
1. **Frontend (Next.js)**: Configuration UI for mapping models
2. **Proxy Server**: HTTP server that intercepts Claude Code requests and routes to providers

For Tauri, run proxy as:
- **Rust command via Tauri plugin** (recommended for performance)
- **Node.js sidecar process** (simpler, matches reference projects)

**Proxy Configuration Example:**
```typescript
// lib/proxy.ts
import { createProxyMiddleware } from 'http-proxy-middleware';

export function createRouterProxy(
  getTarget: (req: Request) => string
) {
  return createProxyMiddleware({
    router: async (req) => {
      const target = await routeRequest(req);
      return target;
    },
    changeOrigin: true,
    pathRewrite: (path) => path, // Preserve path
    onProxyReq: (proxyReq, req) => {
      // Transform request (add API keys, modify headers)
      proxyReq.setHeader('Authorization', `Bearer ${getApiKey(req)}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      // Transform response if needed
    },
  });
}
```

---

### State Management: Zustand

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| Zustand | 5.x | Global state | **Best choice for configuration state.** Minimal boilerplate, no providers needed, TypeScript-first. ~1.7KB gzipped. |
| zustand/persist | (included) | Persistence | Persist config to localStorage or Tauri filesystem |

**Why Zustand over Redux:**
- **Simplicity:** No providers, no boilerplate
- **Performance:** Selective subscriptions prevent unnecessary re-renders
- **Bundle size:** ~1.7KB vs ~12KB for Redux Toolkit
- **DX:** Closer to React patterns, easier onboarding

**Why NOT Context API:**
- Re-renders ALL consumers when ANY value changes
- Configuration app has multiple related values (providers, routes, API keys)
- Zustand's selectors solve this elegantly

**Store Example:**
```typescript
// stores/configStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Provider {
  name: string;
  apiBaseUrl: string;
  apiKey: string;
  models: string[];
}

interface RouteMapping {
  claudeModel: string; // opus, sonnet, haiku
  provider: string;
  model: string;
}

interface ConfigState {
  providers: Provider[];
  routes: RouteMapping[];
  activeProvider: string | null;
  addProvider: (provider: Provider) => void;
  setRoute: (mapping: RouteMapping) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      providers: [],
      routes: [],
      activeProvider: null,
      addProvider: (provider) =>
        set((state) => ({ providers: [...state.providers, provider] })),
      setRoute: (mapping) =>
        set((state) => {
          const existing = state.routes.findIndex(
            (r) => r.claudeModel === mapping.claudeModel
          );
          if (existing >= 0) {
            const newRoutes = [...state.routes];
            newRoutes[existing] = mapping;
            return { routes: newRoutes };
          }
          return { routes: [...state.routes, mapping] };
        }),
    }),
    { name: 'claude-proxy-config' }
  )
);
```

---

### Data Storage

| Technology | Purpose | Why |
|-----------|---------|-----|
| JSON config file | Provider/Route storage | Human-readable, easy to edit, matches reference project format |
| Tauri FS API | File system access | Read/write config to `~/.claude-code-proxy/config.json` |

**Config Location:** `~/.claude-code-proxy/config.json` (follows CLI conventions)

---

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwind-merge | 2.x | Class merging | Always with Tailwind — `cn(clsx, tailwindMerge)` |
| clsx | 2.x | Conditional classes | Component variant handling |
| lucide-react | latest | Icons | macOS-native-feeling icons |
| react-hook-form | 7.x | Form handling | Provider configuration forms |
| zod | 3.x | Validation | Schema validation for API keys, URLs |
| @tanstack/react-query | 5.x | Data fetching | If async provider list fetching needed |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Desktop wrapper | Tauri 2.x | Electron 30+ | Electron ships Chromium (150MB+), higher RAM. OK for complex apps but not needed here. |
| Backend server | Express + http-proxy-middleware | Fastify + custom proxy | Express ecosystem matches reference (claude-code-router uses Bun/Express). http-proxy-middleware handles the heavy lifting. |
| State management | Zustand | Redux Toolkit | Redux is overkill for config-only state. Zustand is simpler, smaller. |
| HTTP client (frontend) | fetch (built-in) | Axios | No need for Axios in modern Next.js. fetch is native, works with React Server Components. |
| Validation | Zod | Yup | Zod has better TypeScript inference, smaller bundle. |

---

## What NOT to Use and Why

| Library/Pattern | Why Avoid | Recommendation |
|-----------------|-----------|----------------|
| **Redux (without RTK)** | Overkill for configuration state, heavy boilerplate | Use Zustand |
| **Context API for config** | Re-renders all consumers on any change | Zustand selectors |
| **classnames + styled-components** | Tailwind handles this | Use tailwind-merge + clsx |
| **React Query for local config** | Over-engineering for local state | Zustand persist |
| **Cron** (for scheduling) | Not needed | Focus on routing, not scheduling |
| **SQLite/Prisma** | Config is JSON, not relational | JSON file storage |
| **Electron (if you prefer JS ecosystem)** | Larger bundle, more RAM | Tauri is more efficient |
| **Webpack** (manual) | Next.js has Turbopack | Use Turbopack in dev |

---

## Architecture Pattern

```
┌─────────────────────────────────────────────────────┐
│                    Tauri App                        │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │   Next.js Frontend  │  │   Proxy Server      │  │
│  │   (React UI)         │  │   (Express +        │  │
│  │                     │  │   http-proxy)       │  │
│  │   - Provider config │  │                     │  │
│  │   - Route mapping   │  │   - Intercept calls │  │
│  │   - Status display  │  │   - Route to AI     │  │
│  └─────────────────────┘  │   - Transform req/  │  │
│           │               │        resp          │  │
│           └───────────────┴──────────────────────┘  │
│                         │                            │
│                    localhost                        │
│                   (127.0.0.1:3456)                  │
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

---

## Installation Commands

```bash
# 1. Create Tauri app with Next.js
npm create tauri-app@latest claudecode-proxy -- --template react-ts

# 2. Install frontend dependencies
cd claudecode-proxy
npm install next@latest react@latest react-dom@latest
npm install -D tailwindcss postcss autoprefixer @types/node

# 3. Install Tauri and state management
npm install @tauri-apps/api@latest
npm install zustand

# 4. Install proxy dependencies
npm install express http-proxy-middleware cors dotenv

# 5. Install UI utilities
npm install lucide-react clsx tailwind-merge
npm install react-hook-form zod @hookform/resolvers
```

---

## Version Verification

| Technology | Verified Version | Source |
|------------|------------------|--------|
| Tauri | 2.x (latest stable) | Context7 /tauri-apps/tauri-docs |
| Next.js | 15.x (15.5 as of Aug 2025) | Official blog, Context7 |
| React | 19.x (stable in 15.1) | Next.js official docs |
| http-proxy-middleware | 3.0.5 | NPM registry |
| Zustand | 5.x | NPM registry |
| Express | 4.x | NPM registry |

---

## Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| Desktop wrapper (Tauri) | HIGH | Benchmark data from multiple 2025 articles confirms performance advantages. Native macOS support via WKWebView. |
| Frontend (Next.js 15 + React 19) | HIGH | Official Next.js 15.5 release (Aug 2025) stable. React 19 stable since Dec 2024. |
| Proxy middleware | HIGH | http-proxy-middleware is mature (11k+ stars), supports dynamic routing needed for model mapping. |
| State management | HIGH | Zustand is established pattern, widely recommended in 2025 comparisons. |
| Architecture | MEDIUM | Combining Tauri + Express proxy needs careful integration. Reference projects (claude-code-router) use similar patterns. |

---

## Sources

- [Tauri 2.x Docs](https://tauri.app/start/) — HIGH confidence
- [Next.js 15.5 Release](https://nextjs.org/blog/next-15-5) — HIGH confidence
- [Tauri vs Electron Benchmark](https://gethopp.app/blog/tauri-vs-electron) — HIGH confidence (Apr 2025)
- [Zustand Best Practices](https://www.youtube.com/watch?v=6tEQ1nJZ51w) — MEDIUM confidence
- [http-proxy-middleware NPM](https://www.npmjs.com/package/http-proxy-middleware) — HIGH confidence
- [React State Management 2025](https://www.meerako.com/blogs/react-state-management-zustand-vs-redux-vs-context-2025) — MEDIUM confidence