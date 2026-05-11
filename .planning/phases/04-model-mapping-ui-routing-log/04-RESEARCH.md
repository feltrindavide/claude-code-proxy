# Phase 4: Model Mapping UI & Routing Log - Research

**Researched:** 2026-05-10
**Domain:** Express middleware logging, JSON file ring buffer, Tauri file I/O, React sortable tables, JSON diff UI
**Confidence:** HIGH

## Summary

This phase adds two capabilities to the existing desktop app: (1) config export/import as JSON with merge/replace, diff preview, and auto-backup, and (2) a request routing log showing the last 50 requests with full details. The proxy backend (Phase 1+2) and desktop shell (Phase 3) are already complete.

**Primary recommendation:** Use Express middleware with `on-finished` for request/response logging, a JSON file ring buffer with atomic writes (same pattern as ConfigService), Tauri `@tauri-apps/plugin-dialog` for file picker, `jsondiffpatch` for diff preview, and a hand-built sortable table (no heavy dependency) following the existing manual Tailwind component pattern.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Request logging middleware | API / Backend | — | Express intercepts requests before proxy handler |
| Ring buffer persistence | API / Backend | — | JSON file written by Express, read by frontend |
| Config export (download) | Frontend (SSR) | Browser | Browser download triggered from webview |
| Config import (file picker) | Frontend (SSR) | Tauri native | Tauri dialog plugin for native file picker |
| Diff preview UI | Browser / Client | — | Pure React component comparing two JSON objects |
| Routing log table | Browser / Client | — | Sortable/filterable table in Next.js page |
| Auto-refresh polling | Browser / Client | API / Backend | Zustand store with setInterval (existing pattern) |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-44:** Request logs stored as JSON file on disk at `~/.claude-code-proxy/request-log.json`
- **D-45:** Each log entry captures full request details: timestamp, claudeTier, providerName, targetModel, status, durationMs, request body (truncated), response body (truncated), headers
- **D-46:** Logging implemented as Express middleware — centralized capture point before/after proxy handler
- **D-47:** Fixed 50-entry ring buffer — when 51st entry arrives, oldest is dropped
- **D-48:** Large request/response bodies truncated to keep log file manageable (exact truncation limit at agent's discretion)
- **D-49:** Export triggers browser download of config.json file
- **D-50:** Export scope includes: providers (with masked keys), routes (model mappings), proxy settings (port, auto-start). Excludes: actual API keys, request logs, runtime state
- **D-51:** Import presents user with choice: merge with existing config OR replace entire config
- **D-52:** Import validation is strict — parse JSON, validate against config schema, show specific field errors. Block import until valid
- **D-53:** Import safety: diff preview before apply + auto-backup of current config before changes are applied
- **D-54:** Routing log displayed as sortable table with columns: Timestamp, Claude Tier, Provider, Model, Status, Duration
- **D-55:** Filtering by provider, model tier (opus/sonnet/haiku), and status (success/error)
- **D-56:** Routing Log is a new 5th sidebar nav item (between Model Mapping and Settings)
- **D-57:** Auto-refresh via polling every 5-10 seconds (consistent with existing health polling pattern)
- **D-58:** Sidebar navigation expanded from 4 to 5 items: Status, Providers, Model Mapping, Routing Log, Settings

### the agent's Discretion
- Exact truncation limit for request/response bodies in log entries
- Specific column widths and sort defaults for the routing log table
- Import file picker UI pattern (native file dialog vs drag-and-drop)
- Backup file naming convention and retention policy

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `on-finished` | 2.4.1 | Execute callback when HTTP response finishes | Already a transitive dependency of Express; standard for request/response lifecycle hooks [VERIFIED: npm registry] |
| `jsondiffpatch` | 0.7.3 | Diff & patch JavaScript objects | 5.3k GitHub stars, ESM-only, browser + server support, built-in HTML formatter for visual diff [VERIFIED: npm registry, CITED: github.com/benjamine/jsondiffpatch] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tauri-apps/plugin-dialog` | 2.7.1 | Native file open/save dialogs | Import file picker — native macOS dialog with JSON filter |
| `@tauri-apps/plugin-fs` | 2.5.1 | File system operations from Tauri | Auto-backup: write config backup to disk before import |
| `lucide-react` | ^0.469.0 (existing) | Icons for nav, status badges | Already installed — use `ListChecks` or `ScrollText` for Routing Log icon |

**Installation:**
```bash
# Proxy package
cd packages/proxy && npm install on-finished

# Web package
cd apps/web && npm install jsondiffpatch @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```

**Version verification:** All versions confirmed via `npm view` on 2026-05-10.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jsondiffpatch` | `deep-object-diff` (1.1.9) | Simpler API but no visual HTML formatter, no patch/reverse — jsondiffpatch is more complete |
| `jsondiffpatch` | `fast-json-patch` (3.1.1) | RFC 6902 compliant but heavier, focused on JSON Patch ops not visual diff |
| Tauri dialog plugin | Browser `<input type="file">` | Works for import but no native macOS feel; dialog plugin gives proper file picker with filters |
| `on-finished` | `res.on('finish')` native event | `on-finished` handles edge cases (errors, early close) that raw events miss |

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri Desktop App                        │
│                                                                 │
│  ┌──────────────────────┐    ┌───────────────────────────────┐  │
│  │   Next.js Frontend    │    │        Express Proxy           │  │
│  │   (localhost:3000)    │    │       (localhost:3456)         │  │
│  │                       │    │                                │  │
│  │  ┌─────────────────┐  │    │  ┌──────────────────────────┐  │  │
│  │  │ Routing Log Page │◄─┼────┼──│ GET /admin/logs          │  │  │
│  │  │ (polling 5-10s)  │  │    │  │ Returns ring buffer      │  │  │
│  │  └─────────────────┘  │    │  └──────────────────────────┘  │  │
│  │                       │    │                                │  │
│  │  ┌─────────────────┐  │    │  ┌──────────────────────────┐  │  │
│  │  │ Export/Import UI │◄─┼────┼──│ GET /admin/config/export │  │  │
│  │  │ (dialog+diff)    │  │    │  │ PUT /admin/config/import │  │  │
│  │  └─────────────────┘  │    │  └──────────────────────────┘  │  │
│  │                       │    │                                │  │
│  │  ┌─────────────────┐  │    │  ┌──────────────────────────┐  │  │
│  │  │ Sidebar (5 items)│  │    │  │ Logging Middleware       │  │  │
│  │  │ + Routing Log nav│  │    │  │ (before proxy handler)   │  │  │
│  │  └─────────────────┘  │    │  └────────────┬─────────────┘  │  │
│  └──────────────────────┘    │               │                │  │
│                              │               ▼                │  │
│                              │  ┌──────────────────────────┐  │  │
│                              │  │ handleProxyRequest        │  │  │
│                              │  │ (SSE streaming)           │  │  │
│                              │  └──────────────────────────┘  │  │
│                              │                                │  │
│                              └────────────────┬───────────────┘  │
│                                               │                  │
└───────────────────────────────────────────────┼──────────────────┘
                                                │
                      ┌─────────────────────────▼────────────────┐
                      │          File System                      │
                      │                                           │
                      │  ~/.claude-code-proxy/                    │
                      │  ├── config.json                          │
                      │  ├── request-log.json  (50-entry ring)    │
                      │  └── config-backup-YYYY-MM-DD-HH-mm.json  │
                      └───────────────────────────────────────────┘
```

### Recommended Project Structure
```
packages/proxy/src/
├── middleware/
│   └── requestLogger.ts       # NEW: Express middleware for request/response logging
├── services/
│   ├── config.ts              # EXTEND: add export/import methods
│   └── requestLog.ts          # NEW: ring buffer service for request-log.json
├── routes/
│   └── admin.ts               # EXTEND: add /logs, /config/export, /config/import endpoints
└── types/
    └── index.ts               # EXTEND: add RequestLogEntry type

apps/web/src/
├── app/
│   └── logs/
│       └── page.tsx           # NEW: Routing Log page
├── components/
│   ├── RoutingLogTable.tsx    # NEW: Sortable/filterable table
│   ├── ConfigExportImport.tsx # NEW: Export/Import UI with diff preview
│   └── JsonDiffViewer.tsx     # NEW: Side-by-side JSON diff display
├── lib/
│   └── api.ts                 # EXTEND: add fetchLogs, exportConfig, importConfig
├── stores/
│   └── logStore.ts            # NEW: Zustand store with polling for request logs
└── components/
    └── SidebarNav.tsx         # EXTEND: add Routing Log nav item (5th)
```

### Pattern 1: Express Request/Response Logging Middleware

**What:** Middleware that captures request body, timing, and response metadata for every `/v1/messages` request. Uses `on-finished` to hook into response completion without blocking SSE streams.

**When to use:** For any Express route where you need to log both request and response details, especially for streaming responses where the body is written incrementally.

**Key insight for SSE:** The proxy handler uses `for await...of` to stream SSE events via `res.write()`. You CANNOT capture the full response body by intercepting `res.write` — the stream is already flowing to the client. Instead, log the response metadata (status code, duration, error state) and a truncated sample of the first N bytes of the response.

```typescript
// Source: CITED: github.com/jshttp/on-finished + Express 5 patterns
import onFinished from 'on-finished';
import type { Request, Response, NextFunction } from 'express';

export function createRequestLogger(logService: RequestLogService) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only log /v1/messages requests
    if (req.path !== '/v1/messages' || req.method !== 'POST') {
      return next();
    }

    const startTime = Date.now();
    const requestBody = req.body;

    // Capture response status when finished
    onFinished(res, (err) => {
      const durationMs = Date.now() - startTime;
      logService.addEntry({
        timestamp: new Date().toISOString(),
        claudeTier: requestBody?.model || 'unknown',
        providerName: 'pending', // resolved by proxy handler
        targetModel: 'pending',
        status: err ? 'error' : (res.statusCode >= 400 ? 'error' : 'success'),
        durationMs,
        requestBody: truncateBody(requestBody),
        responsePreview: '', // SSE streams can't be fully captured
        statusCode: res.statusCode,
      });
    });

    next();
  };
}
```

**Important limitation:** For SSE streaming responses, the full response body cannot be captured by middleware because `res.write()` streams directly to the client. The logging middleware should record: request body (truncated), start time, and use `on-finished` for status/duration. The proxy handler itself should enrich the log entry with provider name, target model, and a response preview after the stream completes.

### Pattern 2: JSON File Ring Buffer

**What:** A fixed-size array persisted to a JSON file. When the array exceeds 50 entries, the oldest is dropped. Uses the same atomic write pattern as ConfigService (temp file + rename).

```typescript
// Source: [CITED: existing packages/proxy/src/services/config.ts atomic write pattern]
const MAX_ENTRIES = 50;
const LOG_FILE = join(os.homedir(), '.claude-code-proxy', 'request-log.json');

export class RequestLogService {
  private entries: RequestLogEntry[] = [];

  load(): RequestLogEntry[] {
    try {
      if (!existsSync(LOG_FILE)) return [];
      const content = readFileSync(LOG_FILE, 'utf-8');
      this.entries = JSON.parse(content);
      return this.entries;
    } catch {
      return [];
    }
  }

  addEntry(entry: RequestLogEntry): void {
    this.entries.push(entry);
    // Ring buffer: drop oldest when exceeding max
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.save();
  }

  getAll(): RequestLogEntry[] {
    return [...this.entries]; // Return copy
  }

  private save(): void {
    // Atomic write: same pattern as ConfigService
    const tempPath = `${LOG_FILE}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
    require('fs').renameSync(tempPath, LOG_FILE);
  }
}
```

### Pattern 3: Tauri File Download from WebView

**What:** Triggering a file download from a Tauri webview. Since the proxy runs on localhost, the simplest approach is to fetch the config from the proxy API and trigger a browser download via a Blob URL.

**Approach:** No Tauri plugin needed for export. The frontend fetches `GET /admin/config/export`, creates a Blob, and triggers download via `<a>` element with `download` attribute. This works in Tauri webviews.

```typescript
// Source: [ASSUMED] — standard browser download pattern, works in Tauri webviews
async function exportConfig() {
  const response = await fetch('http://localhost:3456/admin/config/export');
  const data = await response.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'claude-code-proxy-config.json';
  a.click();
  URL.revokeObjectURL(url);
}
```

**For import:** Use `@tauri-apps/plugin-dialog` `open()` to pick a JSON file, then `@tauri-apps/plugin-fs` `readTextFile()` to read it, or fall back to `<input type="file">` if the dialog plugin isn't configured.

### Pattern 4: Hand-Built Sortable Table (No Heavy Dependency)

**What:** A lightweight sortable/filterable table using React state and Tailwind classes. No external table library needed — the project already uses manual Tailwind components (no shadcn).

```typescript
// Source: [ASSUMED] — standard React pattern for sortable tables
type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
  key: keyof LogEntry;
  direction: SortDirection;
}

function RoutingLogTable({ entries }: { entries: LogEntry[] }) {
  const [sort, setSort] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filtered = entries.filter(e =>
    (filterProvider === 'all' || e.providerName === filterProvider) &&
    (filterTier === 'all' || e.claudeTier === filterTier) &&
    (filterStatus === 'all' || e.status === filterStatus)
  );

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sort.key];
    const bVal = b[sort.key];
    if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // ...render table with cursor brand tokens
}
```

### Pattern 5: JSON Diff Preview with jsondiffpatch

**What:** Side-by-side visual diff of two JSON configs using `jsondiffpatch`'s built-in HTML formatter.

```typescript
// Source: CITED: github.com/benjamine/jsondiffpatch
import * as jsondiffpatch from 'jsondiffpatch';
import * as htmlFormatter from 'jsondiffpatch/formatters/html';

function JsonDiffViewer({ current, incoming }: { current: object; incoming: object }) {
  const delta = jsondiffpatch.diff(current, incoming);
  const html = htmlFormatter.format(delta, current);

  return (
    <div
      className="jsondiffpatch-wrapper"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

**Note:** jsondiffpatch ships CSS for its HTML formatter. The planner should either inline the CSS or use a Tailwind-compatible styling approach to match the Cursor brand. The CSS is small (~2KB) and can be imported directly.

### Anti-Patterns to Avoid

- **Intercepting SSE stream body in middleware:** Do NOT try to capture the full SSE response by wrapping `res.write()`. The stream is already flowing to the client; intercepting it will cause buffering issues and break streaming. Log metadata only, and let the proxy handler enrich with provider/model info.
- **Using `res.body` or `res._body`:** Express responses don't have a body property. The response is written incrementally via `res.write()` and `res.end()`.
- **Sync file writes for ring buffer:** Don't use synchronous writes without the temp+rename pattern — a crash mid-write corrupts the log file.
- **Heavy table libraries:** Don't add `@tanstack/react-table` or similar for a single 50-row table. The overhead isn't justified.
- **Storing API keys in export:** Per D-50, export must mask keys. Use the same masking pattern as `GET /admin/providers` (show `••••` or last 4 chars).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON diff/patch | Custom recursive diff algorithm | `jsondiffpatch` | Handles arrays with object matching, reverse deltas, text diffs for long strings, multiple output formats |
| File open dialog | Custom file picker UI | `@tauri-apps/plugin-dialog` | Native macOS dialog, proper file filters, user expects native behavior |
| Request lifecycle tracking | Custom `res.on('finish')` listeners | `on-finished` | Handles edge cases: errors, early close, already-finished responses |
| Atomic file writes | Direct `writeFileSync` | Temp file + `renameSync` (existing ConfigService pattern) | Crash-safe: rename is atomic on POSIX, prevents partial writes |

**Key insight:** The project already has proven patterns for atomic writes (ConfigService), polling (proxyStore), and modal dialogs (Modal.tsx). Reuse these rather than introducing new patterns.

## Common Pitfalls

### Pitfall 1: SSE Response Body Cannot Be Captured by Middleware
**What goes wrong:** Attempting to capture the full SSE response body in middleware by wrapping `res.write()` causes the stream to buffer, breaking real-time streaming to the client.
**Why it happens:** SSE streams are designed to flow directly to the client. Any interception point that accumulates data will buffer it.
**How to avoid:** Log request body (truncated), start time, and use `on-finished` for status/duration. The proxy handler (`proxy.ts`) should enrich the log entry with provider name, target model, and a response preview after the stream completes.
**Warning signs:** Streaming responses become delayed or chunked; client receives data in bursts instead of real-time.

### Pitfall 2: Ring Buffer Concurrent Write Race
**What goes wrong:** If two requests finish simultaneously, both read the log file, both append, both write — one entry is lost.
**Why it happens:** Node.js is single-threaded, but async operations can interleave. Two `addEntry()` calls can both `load()` the same state before either `save()`.
**How to avoid:** Use an in-memory array as the source of truth. `addEntry()` pushes to the in-memory array (synchronous, no race), then debounces the file write (e.g., batch writes every 1s or write synchronously on each entry — for 50 entries max, sync write is acceptable).
**Warning signs:** Log entries missing, duplicate entries, or corrupted JSON in the file.

### Pitfall 3: Tauri Dialog Plugin Not Configured
**What goes wrong:** Importing `@tauri-apps/plugin-dialog` without adding it to `src-tauri/Cargo.toml` and `capabilities/default.json` causes runtime errors.
**Why it happens:** Tauri v2 requires explicit plugin registration in both Rust and capabilities.
**How to avoid:** Add `tauri-plugin-dialog = "2"` to `Cargo.toml`, register with `.plugin(tauri_plugin_dialog::init())` in `lib.rs`, and add `"dialog:allow-open"` to capabilities.
**Warning signs:** `TypeError: window.__TAURI__.dialog.open is not a function` at runtime.

### Pitfall 4: jsondiffpatch CSS Conflicts with Tailwind
**What goes wrong:** jsondiffpatch's HTML formatter CSS uses class names that may conflict with Tailwind's preflight or custom styles.
**Why it happens:** jsondiffpatch CSS defines styles for `.jsondiffpatch-*` classes that may interact unexpectedly with Tailwind's reset.
**How to avoid:** Import jsondiffpatch CSS in a scoped way, or use Tailwind's `@layer` to ensure proper cascade. Test the visual diff output against the Cursor brand colors.
**Warning signs:** Diff colors clash with Cursor brand, or diff table layout breaks.

### Pitfall 5: Export Includes Actual API Keys
**What goes wrong:** Export endpoint returns the full config including Keychain keyIds, which a malicious export file could expose.
**Why it happens:** `GET /admin/config` returns the raw config from ConfigService, which includes `keyId` values.
**How to avoid:** Create a dedicated `GET /admin/config/export` endpoint that returns providers with masked keys (same pattern as `GET /admin/providers`), routes, and settings — but never actual keys or keyIds.
**Warning signs:** Exported JSON contains `keyId` values that could be used to look up keys in Keychain.

## Code Examples

### Express Logging Middleware (inserted before proxy handler)
```typescript
// Source: CITED: github.com/jshttp/on-finished
// File: packages/proxy/src/middleware/requestLogger.ts
import onFinished from 'on-finished';
import type { Request, Response, NextFunction } from 'express';
import { requestLogService } from '../services/requestLog.js';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  const startTime = Date.now();
  const requestModel = req.body?.model || 'unknown';

  onFinished(res, (err) => {
    const durationMs = Date.now() - startTime;
    requestLogService.addEntry({
      timestamp: new Date().toISOString(),
      requestModel,
      status: err ? 'error' : (res.statusCode >= 400 ? 'error' : 'success'),
      durationMs,
      statusCode: res.statusCode,
      // providerName and targetModel enriched by proxy handler
    });
  });

  next();
}
```

### Ring Buffer Service
```typescript
// File: packages/proxy/src/services/requestLog.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import os from 'os';

const LOG_DIR = join(os.homedir(), '.claude-code-proxy');
const LOG_FILE = join(LOG_DIR, 'request-log.json');
const MAX_ENTRIES = 50;

export interface RequestLogEntry {
  timestamp: string;
  requestModel: string;
  claudeTier?: 'opus' | 'sonnet' | 'haiku';
  providerName?: string;
  targetModel?: string;
  status: 'success' | 'error';
  durationMs: number;
  statusCode: number;
  requestBodyPreview?: string;  // truncated
  responsePreview?: string;     // truncated
}

export class RequestLogService {
  private entries: RequestLogEntry[] = [];

  load(): RequestLogEntry[] {
    try {
      if (!existsSync(LOG_FILE)) return [];
      this.entries = JSON.parse(readFileSync(LOG_FILE, 'utf-8'));
      return this.entries;
    } catch {
      return [];
    }
  }

  addEntry(entry: RequestLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.persist();
  }

  getAll(): RequestLogEntry[] {
    return [...this.entries];
  }

  private persist(): void {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    }
    const tempPath = `${LOG_FILE}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
    renameSync(tempPath, LOG_FILE);
  }
}

export const requestLogService = new RequestLogService();
```

### Zustand Store with Polling (following proxyStore pattern)
```typescript
// File: apps/web/src/stores/logStore.ts
import { create } from 'zustand';
import { fetchLogs } from '@/lib/api';

interface LogState {
  entries: RequestLogEntry[];
  isLoading: boolean;
  lastRefresh: Date | null;
  fetchLogs: () => Promise<void>;
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  isLoading: false,
  lastRefresh: null,

  fetchLogs: async () => {
    set({ isLoading: true });
    try {
      const entries = await fetchLogs();
      set({ entries, isLoading: false, lastRefresh: new Date() });
    } catch {
      set({ isLoading: false });
    }
  },
}));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `morgan` for request logging | Custom middleware with `on-finished` | Always for custom logging needs | Morgan is great for access logs but doesn't capture request bodies or integrate with custom storage |
| Full-response body logging | Metadata-only + truncated preview | SSE streaming era | Full body logging breaks streaming; truncated preview is the pragmatic approach |
| Heavy table libraries (react-table) | Hand-built with React state + Tailwind | Lightweight app trend | For 50 rows, a custom table is simpler and matches the project's no-shadcn philosophy |
| `react-json-diff` | `jsondiffpatch` with HTML formatter | jsondiffpatch 0.6+ ESM support | jsondiffpatch is more actively maintained, has better array diffing, and ships visual formatter |

**Deprecated/outdated:**
- `res.on('end')` for response completion: Use `on-finished` instead — it handles errors and early closes that `end` doesn't catch.
- `body-parser` package: Express 4.16+ has built-in `express.json()` — already used in this project.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Blob URL download works in Tauri webview | Pattern 3: Tauri File Download | If Tauri webview blocks Blob downloads, need Tauri fs plugin to write file and trigger open |
| A2 | `on-finished` fires after SSE stream fully sent to client | Pattern 1: Express Logging | If it fires before stream completes, duration will be inaccurate |
| A3 | jsondiffpatch HTML formatter CSS can be used without conflicts | Pattern 5: JSON Diff | May need CSS isolation or custom styling to match Cursor brand |
| A4 | Sync file write per log entry is acceptable performance | Pitfall 2: Ring Buffer | At high request rates, could cause I/O bottleneck — but 50-entry max means writes are small |

## Open Questions

1. **Response body capture for SSE streams**
   - What we know: SSE streams via `res.write()` in a `for await...of` loop. The full body cannot be captured by middleware without breaking streaming.
   - What's unclear: Whether the proxy handler can collect a preview (first N events) without affecting stream performance.
   - Recommendation: Log request body + metadata in middleware. Enrich with provider/model info in the proxy handler after route resolution. Skip response body for now — the request body + status + duration is sufficient for debugging.

2. **Truncation limit for request bodies**
   - What we know: D-48 says "at agent's discretion."
   - What's unclear: What's a reasonable limit that preserves debugging value without bloating the log file.
   - Recommendation: Truncate request body to 2KB (stringified JSON). This captures system prompts and key parameters while keeping the 50-entry log under ~100KB total.

3. **Backup file naming and retention**
   - What we know: D-53 requires auto-backup before import changes.
   - What's unclear: How many backups to keep and naming convention.
   - Recommendation: Name backups `config-backup-YYYY-MM-DD-HH-mm-ss.json`. Keep only the most recent backup (overwrite on each import). This is a single-user desktop app — extensive backup retention isn't needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Express proxy, logging middleware | ✓ | v22+ (per project) | — |
| Tauri dialog plugin | Import file picker | ✗ (not installed) | — | Use `<input type="file">` as fallback |
| Tauri fs plugin | Auto-backup file write | ✗ (not installed) | — | Proxy backend handles backup via HTTP endpoint |
| `on-finished` | Request logging middleware | ✗ (not installed) | — | Already a transitive dep of Express, just needs explicit install |
| `jsondiffpatch` | Diff preview UI | ✗ (not installed) | — | Hand-built diff display (more work) |

**Missing dependencies with fallback:**
- `@tauri-apps/plugin-dialog` — fallback to `<input type="file">` for import (works but less native feel)
- `@tauri-apps/plugin-fs` — fallback to proxy backend handling the backup (add `POST /admin/config/backup` endpoint)

**Note:** The Tauri capabilities file (`src-tauri/capabilities/default.json`) currently only has shell permissions. Adding dialog/fs requires updating both `Cargo.toml`, `lib.rs`, and the capabilities file.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 (existing in proxy package) |
| Config file | `packages/proxy/vitest.config.ts` (existing) |
| Quick run command | `npm run test:run --workspace=packages/proxy` |
| Full suite command | `npm run test:run --workspace=packages/proxy` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-04 | Export config as JSON (masked keys) | unit | `vitest run -t "export"` | ❌ Wave 0 |
| MAP-04 | Import config with merge strategy | unit | `vitest run -t "import merge"` | ❌ Wave 0 |
| MAP-04 | Import config with replace strategy | unit | `vitest run -t "import replace"` | ❌ Wave 0 |
| MAP-04 | Import validation rejects invalid JSON | unit | `vitest run -t "import validation"` | ❌ Wave 0 |
| MAP-04 | Auto-backup before import | unit | `vitest run -t "backup"` | ❌ Wave 0 |
| UI-06 | Request log returns last 50 entries | unit | `vitest run -t "ring buffer"` | ❌ Wave 0 |
| UI-06 | Ring buffer drops oldest at 51 | unit | `vitest run -t "ring buffer overflow"` | ❌ Wave 0 |
| UI-06 | Log entry captures required fields | unit | `vitest run -t "log entry"` | ❌ Wave 0 |
| UI-06 | Logging middleware doesn't block SSE | integration | `vitest run -t "middleware sse"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:run --workspace=packages/proxy -- --run`
- **Per wave merge:** `npm run test:run --workspace=packages/proxy`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/proxy/src/services/__tests__/requestLog.test.ts` — covers ring buffer (UI-06)
- [ ] `packages/proxy/src/middleware/__tests__/requestLogger.test.ts` — covers middleware doesn't block (UI-06)
- [ ] `packages/proxy/src/routes/__tests__/admin.exportImport.test.ts` — covers export/import (MAP-04)
- [ ] `packages/proxy/src/services/__tests__/config.exportImport.test.ts` — covers ConfigService extensions (MAP-04)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — no user auth in this phase |
| V3 Session Management | no | N/A |
| V4 Access Control | no | Localhost-only API |
| V5 Input Validation | yes | zod schemas (existing proxyConfigSchema) for import validation |
| V6 Cryptography | no | No new crypto requirements |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage in export | Information Disclosure | Mask keys in export endpoint (D-50), never include keyId or actual keys |
| Malicious config import (injection) | Tampering | Strict zod validation against proxyConfigSchema before applying import (D-52) |
| Log file unauthorized access | Information Disclosure | File permissions 0o600 (same as config.json), stored in user's home directory |
| Path traversal in import file name | Tampering | Validate file extension is `.json`, use Tauri dialog (not user-typed path) |

## Sources

### Primary (HIGH confidence)
- [Context7: /expressjs/express] — Express middleware patterns, error handling, response methods
- [Context7: /tauri-apps/tauri-docs] — Tauri v2 dialog plugin API (`open`, `save`), file dialog filters
- [CITED: github.com/jshttp/on-finished] — `on-finished` API for HTTP request/response lifecycle hooks (v2.4.1)
- [CITED: github.com/benjamine/jsondiffpatch] — jsondiffpatch diff/patch API, HTML formatter, visual diff (v0.7.3)
- [VERIFIED: npm registry] — All package versions confirmed via `npm view` on 2026-05-10
- [VERIFIED: codebase] — Existing ConfigService atomic write pattern, proxyStore polling pattern, Modal/Toast/Button components

### Secondary (MEDIUM confidence)
- [ASSUMED] — Blob URL download works in Tauri webview (standard browser API, should work but not explicitly tested in this project)
- [ASSUMED] — jsondiffpatch CSS can be integrated with Tailwind without major conflicts (common pattern, but needs testing)

### Tertiary (LOW confidence)
- None — all critical claims verified or cited

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via npm registry and Context7
- Architecture: HIGH — patterns verified against existing codebase and official docs
- Pitfalls: HIGH — based on Express/SSE behavior verified via on-finished docs and codebase analysis
- Tauri integration: MEDIUM — dialog plugin API verified, but Blob download in Tauri webview is assumed

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (30 days — stable dependencies)
