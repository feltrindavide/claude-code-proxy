# Phase 04: Model Mapping UI & Routing Log - Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/proxy/src/middleware/requestLogger.ts` | middleware | request-response | `packages/proxy/src/routes/admin.ts` (error handling pattern) | role-match |
| `packages/proxy/src/services/requestLog.ts` | service | file-I/O | `packages/proxy/src/services/config.ts` | exact |
| `packages/proxy/src/types/index.ts` | types | — | itself (extend) | — |
| `packages/proxy/src/services/config.ts` | service | file-I/O | itself (extend) | — |
| `packages/proxy/src/routes/admin.ts` | route | request-response | itself (extend) | — |
| `packages/proxy/src/index.ts` | entry | request-response | itself (extend) | — |
| `packages/proxy/tests/services/requestLog.test.ts` | test | — | `packages/proxy/vitest.config.ts` (config) | role-match |
| `packages/proxy/tests/middleware/requestLogger.test.ts` | test | — | `packages/proxy/vitest.config.ts` (config) | role-match |
| `packages/proxy/tests/routes/admin.exportImport.test.ts` | test | — | `packages/proxy/vitest.config.ts` (config) | role-match |
| `packages/proxy/tests/services/config.exportImport.test.ts` | test | — | `packages/proxy/vitest.config.ts` (config) | role-match |
| `apps/web/src/app/logs/page.tsx` | page (Next.js) | request-response | `apps/web/src/app/providers/page.tsx` | exact |
| `apps/web/src/components/RoutingLogTable.tsx` | component | CRUD | `apps/web/src/components/ProviderList.tsx` | role-match |
| `apps/web/src/components/ConfigExportImport.tsx` | component | request-response | `apps/web/src/components/ProviderForm.tsx` | role-match |
| `apps/web/src/components/JsonDiffViewer.tsx` | component | transform | `apps/web/src/components/Modal.tsx` (structure pattern) | partial |
| `apps/web/src/lib/api.ts` | utility (API client) | request-response | itself (extend) | — |
| `apps/web/src/stores/logStore.ts` | store (Zustand) | request-response (polling) | `apps/web/src/stores/proxyStore.ts` | exact |
| `apps/web/src/components/SidebarNav.tsx` | component (nav) | request-response | itself (extend) | — |

## Pattern Assignments

### `packages/proxy/src/middleware/requestLogger.ts` (middleware, request-response)

**Analog:** Express middleware pattern from `packages/proxy/src/index.ts` lines 22-24 + `packages/proxy/src/routes/admin.ts` error handling pattern

**Imports pattern** (copy from `packages/proxy/src/routes/admin.ts` lines 16-21):
```typescript
import type { Request, Response, NextFunction } from 'express';
import onFinished from 'on-finished';
import { requestLogService } from '../services/requestLog.js';
```

**Core middleware pattern** (adapt from `packages/proxy/src/index.ts` line 122 where proxy handler is mounted):
```typescript
// Insert BEFORE the proxy handler in index.ts:
// app.post('/v1/messages', express.json(), requestLoggerMiddleware, handleProxyRequest);

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only log /v1/messages POST requests
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  const startTime = Date.now();
  const requestModel = req.body?.model || 'unknown';

  // Capture response status when finished (handles SSE streams correctly)
  onFinished(res, (err) => {
    const durationMs = Date.now() - startTime;
    requestLogService.addEntry({
      timestamp: new Date().toISOString(),
      requestModel,
      status: err ? 'error' : (res.statusCode >= 400 ? 'error' : 'success'),
      durationMs,
      statusCode: res.statusCode,
      // providerName and targetModel will be enriched by proxy handler
    });
  });

  next();
}
```

**Wiring in index.ts** (modify `packages/proxy/src/index.ts` line 122):
```typescript
// Change from:
// app.post('/v1/messages', express.json(), handleProxyRequest);
// To:
import { requestLoggerMiddleware } from './middleware/requestLogger.js';
app.post('/v1/messages', express.json(), requestLoggerMiddleware, handleProxyRequest);
```

---

### `packages/proxy/src/services/requestLog.ts` (service, file-I/O)

**Analog:** `packages/proxy/src/services/config.ts` — EXACT match for atomic write pattern, directory creation, file permissions

**Imports pattern** (copy from `config.ts` lines 10-14):
```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import os from 'os';
```

**Directory + file path pattern** (copy from `config.ts` lines 17-18):
```typescript
const LOG_DIR = join(os.homedir(), '.claude-code-proxy');
const LOG_FILE = join(LOG_DIR, 'request-log.json');
const MAX_ENTRIES = 50;
```

**Load pattern** (copy from `config.ts` lines 86-106, simplified — no zod validation needed for internal log):
```typescript
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
```

**Atomic save pattern** (copy from `config.ts` lines 112-132):
```typescript
private persist(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
  }
  const tempPath = `${LOG_FILE}.tmp`;
  writeFileSync(tempPath, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
  renameSync(tempPath, LOG_FILE);
}
```

**Ring buffer logic** (new — no existing analog, but follows same in-memory + persist pattern):
```typescript
addEntry(entry: RequestLogEntry): void {
  this.entries.push(entry);
  if (this.entries.length > MAX_ENTRIES) {
    this.entries = this.entries.slice(-MAX_ENTRIES);
  }
  this.persist();
}

getAll(): RequestLogEntry[] {
  return [...this.entries]; // Return copy, not reference
}
```

---

### `packages/proxy/src/types/index.ts` (types, extend)

**Analog:** itself — add `RequestLogEntry` interface after existing types (line 41)

**New type to add:**
```typescript
export interface RequestLogEntry {
  timestamp: string;
  requestModel: string;
  claudeTier?: ClaudeTier;
  providerName?: string;
  targetModel?: string;
  status: 'success' | 'error';
  durationMs: number;
  statusCode: number;
  requestBodyPreview?: string;  // truncated to ~2KB
  responsePreview?: string;     // truncated preview
}
```

---

### `packages/proxy/src/services/config.ts` (service, file-I/O — extend)

**Analog:** itself — add `exportConfig()` and `importConfig()` methods

**Export pattern** (mask keys, follow `admin.ts` lines 83-106 key masking pattern):
```typescript
// Add to ConfigService class:
exportConfig(): object {
  const config = this.load();
  // Mask keys per D-50 — same pattern as admin.ts GET /admin/providers
  const maskedProviders = config.providers.map((p) => ({
    ...p,
    keyId: '••••', // Never expose actual keyId
  }));
  return {
    providers: maskedProviders,
    routes: config.routes,
    settings: { port: 3456 }, // Include proxy settings
  };
}
```

**Import pattern** (validate with zod, follow `config.ts` lines 112-117 validation):
```typescript
importConfig(data: unknown, strategy: 'merge' | 'replace'): AppConfig {
  const result = proxyConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid config: ${result.error.errors.map(e => e.message).join(', ')}`);
  }
  if (strategy === 'merge') {
    const current = this.load();
    return {
      providers: [...current.providers, ...result.data.providers],
      routes: [...result.data.routes], // Incoming routes replace current
    };
  }
  return result.data;
}
```

**Backup pattern** (use same atomic write as `save()`):
```typescript
createBackup(): void {
  const config = this.load();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(CONFIG_DIR, `config-backup-${timestamp}.json`);
  writeFileSync(backupPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}
```

---

### `packages/proxy/src/routes/admin.ts` (route, request-response — extend)

**Analog:** itself — add new endpoints following existing route pattern

**Route pattern** (copy from `admin.ts` lines 45-53 for GET, 59-77 for PUT):
```typescript
/**
 * GET /admin/logs
 * Return last 50 request log entries
 */
router.get('/logs', (req, res) => {
  try {
    const entries = requestLogService.getAll();
    res.json(entries);
  } catch (error) {
    console.error('[Admin] Error loading request logs:', error);
    res.status(500).json({ error: 'Failed to load request logs' });
  }
});

/**
 * GET /admin/config/export
 * Return config with masked keys (D-50)
 */
router.get('/config/export', (req, res) => {
  try {
    const exported = configService.exportConfig();
    res.json(exported);
  } catch (error) {
    console.error('[Admin] Error exporting config:', error);
    res.status(500).json({ error: 'Failed to export config' });
  }
});

/**
 * POST /admin/config/import
 * Import config with merge/replace strategy, auto-backup, diff
 */
router.post('/config/import', async (req, res) => {
  try {
    const { data, strategy } = req.body;
    if (!data || !strategy || !['merge', 'replace'].includes(strategy)) {
      return res.status(400).json({ error: 'data and strategy (merge|replace) are required' });
    }

    // Auto-backup current config before changes
    configService.createBackup();

    const imported = configService.importConfig(data, strategy as 'merge' | 'replace');
    configService.save(imported);
    providerService.reload(imported.providers || [], imported.routes || []);

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error importing config:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to import config' });
  }
});

/**
 * GET /admin/config/diff
 * Return diff between current config and incoming config
 */
router.post('/config/diff', (req, res) => {
  try {
    const { data } = req.body;
    const current = configService.load();
    // Return both for frontend diffing
    res.json({ current, incoming: data });
  } catch (error) {
    console.error('[Admin] Error generating diff:', error);
    res.status(500).json({ error: 'Failed to generate diff' });
  }
});
```

**New imports to add at top of file** (copy pattern from lines 16-21):
```typescript
import { requestLogService } from '../services/requestLog.js';
```

---

### `packages/proxy/src/index.ts` (entry, request-response — extend)

**Analog:** itself — wire logging middleware and load request log on startup

**Modification at line 122** (add middleware before proxy handler):
```typescript
import { requestLoggerMiddleware } from './middleware/requestLogger.js';
import { requestLogService } from './services/requestLog.js';

// Line 122: Change from:
// app.post('/v1/messages', express.json(), handleProxyRequest);
// To:
app.post('/v1/messages', express.json(), requestLoggerMiddleware, handleProxyRequest);
```

**Load request log in `loadConfigOnStartup()`** (add after line 140):
```typescript
// Load request log ring buffer from disk
requestLogService.load();
```

---

### `packages/proxy/tests/services/requestLog.test.ts` (test)

**Analog:** No existing tests in codebase. Use `vitest.config.ts` pattern.

**Test config pattern** (from `packages/proxy/vitest.config.ts` lines 1-13):
```typescript
// vitest.config.ts uses: include: ['tests/**/*.test.ts']
// Tests go in packages/proxy/tests/ directory (not src/__tests__)
```

**Test structure pattern** (vitest globals enabled per config line 5):
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RequestLogService } from '../../src/services/requestLog.js';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';

describe('RequestLogService', () => {
  const testDir = join(os.homedir(), '.claude-code-proxy-test');
  const testFile = join(testDir, 'request-log-test.json');

  beforeEach(() => {
    // Clean up test file before each test
    if (existsSync(testFile)) rmSync(testFile);
  });

  afterEach(() => {
    if (existsSync(testFile)) rmSync(testFile);
  });

  it('should return empty array when file does not exist', () => {
    const service = new RequestLogService(testFile);
    expect(service.getAll()).toEqual([]);
  });

  it('should add entry and persist to file', () => {
    // ...
  });

  it('should drop oldest entry when exceeding 50 (ring buffer)', () => {
    // ...
  });
});
```

---

### `apps/web/src/app/logs/page.tsx` (page, Next.js)

**Analog:** `apps/web/src/app/providers/page.tsx` — EXACT match for page structure

**Page pattern** (copy from `providers/page.tsx` lines 1-10):
```typescript
'use client';
import { RoutingLogTable } from '@/components/RoutingLogTable';

export default function LogsPage() {
  return (
    <div>
      <RoutingLogTable />
    </div>
  );
}
```

---

### `apps/web/src/components/RoutingLogTable.tsx` (component, CRUD)

**Analog:** `apps/web/src/components/ProviderList.tsx` — table/list pattern with Tailwind

**Imports pattern** (follow project convention from existing components):
```typescript
'use client';
import { useState, useEffect } from 'react';
import { useLogStore } from '@/stores/logStore';
import { ArrowUp, ArrowDown, Filter } from 'lucide-react';
```

**Sortable table pattern** (hand-built, no heavy library — follows project's manual Tailwind approach):
```typescript
type SortDirection = 'asc' | 'desc' | null;
type SortKey = 'timestamp' | 'claudeTier' | 'providerName' | 'requestModel' | 'status' | 'durationMs';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export function RoutingLogTable() {
  const { entries, isLoading, lastRefresh, fetchLogs } = useLogStore();
  const [sort, setSort] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterTier, setFilterTier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Effect for initial fetch + polling (follow proxyStore pattern)
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // 5s polling per D-57
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // Filter + sort logic
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

  // Cursor brand table rendering (follow ProviderList.tsx Tailwind patterns)
  return (
    <div>
      <h1 className="font-display text-[22px] text-ink mb-lg">Routing Log</h1>
      {/* Filter controls */}
      {/* Table with cursor brand tokens */}
    </div>
  );
}
```

---

### `apps/web/src/components/ConfigExportImport.tsx` (component, request-response)

**Analog:** `apps/web/src/components/ProviderForm.tsx` — form with validation, API calls, Toast feedback

**Imports pattern** (follow component conventions):
```typescript
'use client';
import { useState } from 'react';
import { exportConfig, importConfig, fetchDiff } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { JsonDiffViewer } from '@/components/JsonDiffViewer';
import { Button } from '@/components/ui/Button';
import { Download, Upload, AlertCircle } from 'lucide-react';
```

**Export pattern** (browser Blob download — from RESEARCH.md Pattern 3):
```typescript
const handleExport = async () => {
  try {
    const data = await exportConfig();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'claude-code-proxy-config.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Configuration exported successfully', 'success');
  } catch {
    toast('Failed to export configuration', 'error');
  }
};
```

**Import pattern** (file picker → validate → diff preview → merge/replace):
```typescript
const handleImport = async (file: File) => {
  try {
    const text = await file.text();
    const incoming = JSON.parse(text);
    // Show diff preview in modal
    setDiffData({ current: await fetchDiff(), incoming });
    setShowDiffModal(true);
  } catch {
    toast('Invalid JSON file', 'error');
  }
};
```

---

### `apps/web/src/components/JsonDiffViewer.tsx` (component, transform)

**Analog:** `apps/web/src/components/Modal.tsx` — component structure pattern

**Component structure pattern** (copy from `Modal.tsx` lines 1-10 for interface + props):
```typescript
'use client';
import { useMemo } from 'react';
import * as jsondiffpatch from 'jsondiffpatch';
import 'jsondiffpatch/dist/formatters-styles/annotated.css';
import 'jsondiffpatch/dist/formatters-styles/html.css';

interface JsonDiffViewerProps {
  current: object;
  incoming: object;
}

export function JsonDiffViewer({ current, incoming }: JsonDiffViewerProps) {
  const html = useMemo(() => {
    const delta = jsondiffpatch.diff(current, incoming);
    if (!delta) return '<p>No differences</p>';
    return jsondiffpatch.formatters.html.format(delta, current);
  }, [current, incoming]);

  return (
    <div
      className="jsondiffpatch-wrapper"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

---

### `apps/web/src/lib/api.ts` (utility, request-response — extend)

**Analog:** itself — add new API functions following existing pattern

**API function pattern** (copy from `api.ts` lines 5-29 for fetch pattern):
```typescript
export async function fetchLogs(): Promise<Array<{
  timestamp: string;
  requestModel: string;
  claudeTier?: string;
  providerName?: string;
  targetModel?: string;
  status: 'success' | 'error';
  durationMs: number;
  statusCode: number;
}>> {
  const response = await fetch(`${PROXY_API_BASE}/admin/logs`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch request logs');
  return response.json();
}

export async function exportConfig(): Promise<object> {
  const response = await fetch(`${PROXY_API_BASE}/admin/config/export`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to export config');
  return response.json();
}

export async function importConfig(data: object, strategy: 'merge' | 'replace'): Promise<{ success: boolean }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/config/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, strategy }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to import config');
  }
  return response.json();
}

export async function fetchDiff(incoming: object): Promise<{ current: object; incoming: object }> {
  const response = await fetch(`${PROXY_API_BASE}/admin/config/diff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: incoming }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to generate diff');
  return response.json();
}
```

---

### `apps/web/src/stores/logStore.ts` (store, Zustand — polling)

**Analog:** `apps/web/src/stores/proxyStore.ts` — EXACT match for polling pattern

**Store pattern** (copy from `proxyStore.ts` lines 1-94):
```typescript
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

---

### `apps/web/src/components/SidebarNav.tsx` (component, nav — extend)

**Analog:** itself — add 5th nav item

**Modification** (add to `navItems` array at line 6-11):
```typescript
// Current (lines 6-11):
const navItems = [
  { label: 'Status', href: '/', icon: Activity },
  { label: 'Providers', href: '/providers', icon: Server },
  { label: 'Model Mapping', href: '/mapping', icon: Route },
  { label: 'Settings', href: '/settings', icon: Settings },
];

// Change to (add ScrollText icon import at line 3):
import { Activity, Server, Route, Settings, ScrollText } from 'lucide-react';

const navItems = [
  { label: 'Status', href: '/', icon: Activity },
  { label: 'Providers', href: '/providers', icon: Server },
  { label: 'Model Mapping', href: '/mapping', icon: Route },
  { label: 'Routing Log', href: '/logs', icon: ScrollText },  // NEW — between Mapping and Settings
  { label: 'Settings', href: '/settings', icon: Settings },
];
```

## Shared Patterns

### Error Handling (All Backend Files)
**Source:** `packages/proxy/src/routes/admin.ts` lines 49-52, 73-76, 102-105
**Apply to:** `requestLogger.ts`, `requestLog.ts`, `admin.ts` (new endpoints), `config.ts` (new methods)
```typescript
try {
  // ... operation
} catch (error) {
  console.error('[Admin] Error doing X:', error);
  res.status(500).json({ error: 'Failed to do X' });
}
```

### Atomic File Write (All File-I/O Services)
**Source:** `packages/proxy/src/services/config.ts` lines 119-131
**Apply to:** `requestLog.ts`, `config.ts` (backup method)
```typescript
if (!existsSync(this.configDir)) {
  mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
}
const tempPath = `${this.configPath}.tmp`;
const content = JSON.stringify(data, null, 2);
writeFileSync(tempPath, content, { mode: 0o600 });
const fs = require('fs');
fs.renameSync(tempPath, this.configPath);
```

### Zustand Polling Pattern (All Frontend Stores)
**Source:** `apps/web/src/stores/proxyStore.ts` lines 30-55
**Apply to:** `logStore.ts`
```typescript
// In component useEffect (NOT in store):
useEffect(() => {
  fetchLogs();
  const interval = setInterval(fetchLogs, 5000);
  return () => clearInterval(interval);
}, [fetchLogs]);
```

### Cursor Brand Tokens (All Frontend Components)
**Source:** `apps/web/src/components/ui/Button.tsx` lines 11-14, `apps/web/src/components/SidebarNav.tsx` lines 26-31
**Apply to:** `RoutingLogTable.tsx`, `ConfigExportImport.tsx`, `JsonDiffViewer.tsx`
```
Colors: bg-primary (#f54e00), text-ink, bg-surface-card, border-hairline, bg-canvas-soft
Typography: font-display, text-sm, text-body
Spacing: px-md, py-xs, mb-lg, gap-xs
Focus: focus-ring
```

### API Client Pattern (All Frontend API Functions)
**Source:** `apps/web/src/lib/api.ts` lines 5-29
**Apply to:** New `fetchLogs`, `exportConfig`, `importConfig`, `fetchDiff` functions
```typescript
const response = await fetch(`${PROXY_API_BASE}/admin/...`, {
  signal: AbortSignal.timeout(5000), // or appropriate timeout
});
if (!response.ok) throw new Error('Failed to ...');
return response.json();
```

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/proxy/tests/services/requestLog.test.ts` | test | — | No existing test files in codebase yet |
| `packages/proxy/tests/middleware/requestLogger.test.ts` | test | — | No existing test files in codebase yet |
| `packages/proxy/tests/routes/admin.exportImport.test.ts` | test | — | No existing test files in codebase yet |
| `packages/proxy/tests/services/config.exportImport.test.ts` | test | — | No existing test files in codebase yet |
| `apps/web/src/components/JsonDiffViewer.tsx` | component | transform | No existing JSON diff component |
| `apps/web/src/components/ConfigExportImport.tsx` | component | request-response | No existing export/import UI component |

## Metadata

**Analog search scope:** `packages/proxy/src/`, `apps/web/src/`
**Files scanned:** 26
**Pattern extraction date:** 2026-05-10
