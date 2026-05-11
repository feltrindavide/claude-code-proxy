# Phase 5: Reliability Polish - Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 14 (7 new, 7 modified)
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/proxy/src/services/rateLimiter.ts` | service | request-response | `packages/proxy/src/services/requestLog.ts` | role-match |
| `packages/proxy/src/services/retryHandler.ts` | service | request-response | `packages/proxy/src/services/provider-validator.ts` | role-match |
| `packages/proxy/src/services/validationStore.ts` | service | file-I/O | `packages/proxy/src/services/requestLog.ts` | exact |
| `packages/proxy/src/middleware/rateLimitMiddleware.ts` | middleware | request-response | `packages/proxy/src/middleware/requestLogger.ts` | exact |
| `apps/web/src/stores/healthStore.ts` | store | request-response | `apps/web/src/stores/proxyStore.ts` | exact |
| `apps/web/src/components/WarningBadge.tsx` | component | request-response | `apps/web/src/components/StatusDot.tsx` + ProviderList badge (line 117) | role-match |
| `apps/web/src/components/ProviderHealthCard.tsx` | component | request-response | `apps/web/src/components/StatusCard.tsx` | exact |
| `packages/proxy/src/proxy.ts` | handler | request-response | itself (modified) | — |
| `packages/proxy/src/routes/admin.ts` | routes | request-response | itself (modified) | — |
| `packages/proxy/src/services/requestLog.ts` | service | file-I/O | itself (modified) | — |
| `packages/proxy/src/index.ts` | entry | request-response | itself (modified) | — |
| `apps/web/src/components/ProviderList.tsx` | component | request-response | itself (modified) | — |
| `apps/web/src/components/StatusPage.tsx` | component | request-response | itself (modified) | — |
| `apps/web/src/lib/api.ts` | api-client | request-response | itself (modified) | — |

## Pattern Assignments

### `packages/proxy/src/services/rateLimiter.ts` (service, request-response) — NEW

**Analog:** `packages/proxy/src/services/requestLog.ts` (singleton service pattern) + `packages/proxy/src/services/config.ts` (atomic write pattern for persistence)

**Imports pattern** (from requestLog.ts lines 10-13):
```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import os from 'os';
import Bottleneck from 'bottleneck';
```

**Singleton pattern** (from requestLog.ts lines 118-119):
```typescript
// Singleton instance
export const rateLimiterService = new RateLimiterService();
```

**Core Bottleneck Group pattern** (from RESEARCH.md code example):
```typescript
export class RateLimiterService {
  private group: Bottleneck.Group;
  private config: Map<string, number> = new Map();

  constructor() {
    this.group = new Bottleneck.Group({
      maxConcurrent: 1,
      minTime: 0,
    });
  }

  configureProvider(providerName: string, rpm?: number): void {
    const limit = rpm ?? DEFAULT_RPM;
    this.config.set(providerName, limit);
    const limiter = this.group.key(providerName);
    limiter.updateSettings({
      reservoir: limit,
      reservoirRefreshAmount: limit,
      reservoirRefreshInterval: 60 * 1000,
      maxConcurrent: 1,
      minTime: Math.floor(60_000 / limit),
    });
  }

  async schedule<T>(providerName: string, fn: () => Promise<T>): Promise<T> {
    if (!this.config.has(providerName)) {
      this.configureProvider(providerName, DEFAULT_RPM);
    }
    return this.group.key(providerName).schedule(fn);
  }

  removeProvider(providerName: string): void {
    this.group.deleteKey(providerName);
    this.config.delete(providerName);
  }

  getRateLimit(providerName: string): number {
    return this.config.get(providerName) ?? DEFAULT_RPM;
  }
}
```

**Persistence pattern** (from config.ts lines 112-131 — atomic write for rate limit config):
```typescript
// Follow ConfigService atomic write pattern for persisting rate limit config
private persist(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
  }
  const tempPath = `${this.configPath}.tmp`;
  const content = JSON.stringify(this.config, null, 2);
  writeFileSync(tempPath, content, { mode: 0o600 });
  renameSync(tempPath, this.configPath);
}
```

---

### `packages/proxy/src/services/retryHandler.ts` (service, request-response) — NEW

**Analog:** `packages/proxy/src/services/provider-validator.ts` (async service with error handling) + RESEARCH.md p-retry pattern

**Imports pattern** (from provider-validator.ts lines 11-14):
```typescript
import pRetry, { AbortError } from 'p-retry';
import { requestLogService } from './requestLog.js';
```

**Core retry wrapper pattern** (from RESEARCH.md code example):
```typescript
export function isTransientError(error: unknown): boolean {
  if (error instanceof AbortError) return false;
  if (error instanceof TypeError) return true; // network error
  if (error instanceof Error && error.message.includes('AbortError')) return true;
  return false;
}

export async function fetchWithRetry(
  fn: (attemptNumber: number) => Promise<Response>,
  onRetry: (attempt: number) => void,
): Promise<Response> {
  return pRetry(
    async (attemptNumber) => {
      const response = await fn(attemptNumber);

      // D-67: Do NOT retry 4xx
      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text().catch(() => '');
        throw new AbortError(
          `Provider returned ${response.status}: ${errorText}`,
        );
      }

      // 5xx: throw to trigger retry (D-66)
      if (!response.ok) {
        throw new Error(`Provider returned ${response.status}`);
      }

      return response;
    },
    {
      retries: 2,          // D-68: max 2 retries
      minTimeout: 1000,    // D-68: 1s first delay
      factor: 2,           // D-68: 1s → 2s
      randomize: false,
      onFailedAttempt: (error) => {
        if (!(error instanceof AbortError)) {
          onRetry(error.attemptNumber); // D-69: log + toast
        }
      },
    },
  );
}
```

---

### `packages/proxy/src/services/validationStore.ts` (service, file-I/O) — NEW

**Analog:** `packages/proxy/src/services/requestLog.ts` (exact match — file persistence with atomic writes, load on startup)

**Imports pattern** (from requestLog.ts lines 10-13):
```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import os from 'os';
import type { ValidationResult } from '../adapters/interface.js';
```

**Core persistence pattern** (from requestLog.ts lines 30-116 — copy the entire class structure):
```typescript
const VALIDATION_FILE = join(os.homedir(), '.claude-code-proxy', 'validation-results.json');

export class ValidationStoreService {
  private results: Map<string, ValidationResult & { timestamp: string }> = new Map();
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || VALIDATION_FILE;
  }

  load(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const content = readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      this.results = new Map(Object.entries(data));
    } catch (error) {
      console.error('[ValidationStore] Error loading:', error);
    }
  }

  setResults(results: Map<string, ValidationResult & { timestamp: string }>): void {
    this.results = results;
    this.persist();
  }

  getResults(): Record<string, ValidationResult & { timestamp: string }> {
    return Object.fromEntries(this.results);
  }

  private persist(): void {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    }
    const tempPath = `${this.filePath}.tmp`;
    const content = JSON.stringify(Object.fromEntries(this.results), null, 2);
    writeFileSync(tempPath, content, { mode: 0o600 });
    renameSync(tempPath, this.filePath);
  }
}

export const validationStoreService = new ValidationStoreService();
```

---

### `packages/proxy/src/middleware/rateLimitMiddleware.ts` (middleware, request-response) — NEW

**Analog:** `packages/proxy/src/middleware/requestLogger.ts` (exact match — Express middleware pattern)

**Imports pattern** (from requestLogger.ts lines 10-12):
```typescript
import type { Request, Response, NextFunction } from 'express';
import { rateLimiterService } from '../services/rateLimiter.js';
```

**Middleware structure** (from requestLogger.ts lines 18-54):
```typescript
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Guard: only apply to POST /v1/messages
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  // Resolve provider name from request body model → route resolution
  const body = req.body || {};
  const modelName = body.model || 'claude-opus-4-20250514';
  const resolution = providerService.resolveModelRoute(modelName);
  const providerName = resolution?.provider.name || 'unknown';

  // Schedule through Bottleneck limiter (queues, doesn't reject)
  rateLimiterService.schedule(providerName, () => {
    return new Promise<void>((resolve, reject) => {
      // Store resolve/reject on req for proxy handler to call
      (req as any)._rateLimitResolve = resolve;
      (req as any)._rateLimitReject = reject;
      next();
    });
  }).catch((err) => {
    console.error('[RateLimit] Queue error:', err);
    res.status(500).json({ error: 'Rate limiter error' });
  });
}
```

---

### `apps/web/src/stores/healthStore.ts` (store, request-response) — NEW

**Analog:** `apps/web/src/stores/proxyStore.ts` (exact match — Zustand store with polling pattern)

**Imports pattern** (from proxyStore.ts lines 1-2):
```typescript
import { create } from 'zustand';
import { fetchValidationResults, dismissWarning } from '@/lib/api';
```

**Zustand store pattern** (from proxyStore.ts lines 4-94 — follow the same interface + create structure):
```typescript
interface HealthState {
  validationResults: Record<string, { valid: boolean; error?: string; timestamp: string }>;
  dismissedWarnings: string[];
  isLoading: boolean;
  pollValidation: () => Promise<void>;
  dismissWarning: (providerName: string) => void;
  isProviderHealthy: (providerName: string) => boolean;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  validationResults: {},
  dismissedWarnings: [],
  isLoading: false,

  pollValidation: async () => {
    set({ isLoading: true });
    try {
      const results = await fetchValidationResults();
      set({ validationResults: results, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
    }
  },

  dismissWarning: (providerName: string) => {
    set((state) => ({
      dismissedWarnings: [...state.dismissedWarnings, providerName],
    }));
  },

  isProviderHealthy: (providerName: string) => {
    const { validationResults, dismissedWarnings } = get();
    if (dismissedWarnings.includes(providerName)) return true;
    const result = validationResults[providerName];
    return !result || result.valid;
  },
}));
```

**Polling pattern** (from StatusPage.tsx lines 23-28 — use in component, not store):
```typescript
useEffect(() => {
  pollValidation();
  const interval = setInterval(pollValidation, 5000);
  return () => clearInterval(interval);
}, [pollValidation]);
```

---

### `apps/web/src/components/WarningBadge.tsx` (component, request-response) — NEW

**Analog:** `apps/web/src/components/StatusDot.tsx` (small state-driven component) + ProviderList badge-pill pattern (line 117)

**Badge-pill pattern** (from ProviderList.tsx line 117-119):
```tsx
<span className="bg-surface-strong text-ink text-[11px] font-semibold uppercase tracking-[0.88px] rounded-pill px-[10px] py-xxs">
  {p.enabled ? 'Enabled' : 'Disabled'}
</span>
```

**Warning badge component** (from RESEARCH.md code example + DESIGN.md semantic-error):
```tsx
import { AlertTriangle } from 'lucide-react';

interface WarningBadgeProps {
  message: string;
}

export function WarningBadge({ message }: WarningBadgeProps) {
  return (
    <span className="inline-flex items-center gap-xxs bg-semantic-error/10 text-semantic-error text-[11px] font-semibold uppercase tracking-[0.88px] rounded-pill px-[10px] py-xxs">
      <AlertTriangle className="w-3 h-3" />
      {message}
    </span>
  );
}
```

---

### `apps/web/src/components/ProviderHealthCard.tsx` (component, request-response) — NEW

**Analog:** `apps/web/src/components/StatusCard.tsx` (exact match — metric card component)

**StatusCard pattern** (from StatusCard.tsx lines 1-21):
```tsx
import { LucideIcon } from 'lucide-react';

interface StatusCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
}

export function StatusCard({ label, value, icon: Icon }: StatusCardProps) {
  return (
    <div className="bg-surface-card rounded-lg border border-hairline p-md">
      <div className="flex items-center gap-xxs mb-xs">
        {Icon && <Icon className="w-3 h-3 text-muted" />}
        <span className="text-[11px] font-semibold uppercase tracking-[0.88px] text-muted">
          {label}
        </span>
      </div>
      <p className="font-heading text-[18px] font-semibold text-ink">{value}</p>
    </div>
  );
}
```

**ProviderHealthCard** — follows StatusCard structure but with health-specific content:
```tsx
import { Shield } from 'lucide-react';
import { StatusCard } from './StatusCard';

interface ProviderHealthCardProps {
  healthyCount: number;
  totalCount: number;
}

export function ProviderHealthCard({ healthyCount, totalCount }: ProviderHealthCardProps) {
  return (
    <StatusCard
      label="Provider Health"
      value={`${healthyCount} of ${totalCount}`}
      icon={Shield}
    />
  );
}
```

---

### `packages/proxy/src/proxy.ts` (handler, request-response) — MODIFIED

**Analog:** itself — wrap the upstream fetch (lines 104-116) with retry logic

**Current upstream fetch** (lines 100-116):
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), adapter.timeouts.streaming);

try {
  const upstreamResponse = await fetch(
    `${resolution.provider.baseUrl}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(providerBody),
      signal: controller.signal,
    },
  );
```

**Wrap with p-retry** — replace the direct `fetch` call with `fetchWithRetry` from retryHandler.ts. The `onRetry` callback should set `req._retryAttempt` for the request logger.

---

### `packages/proxy/src/routes/admin.ts` (routes, request-response) — MODIFIED

**Analog:** itself — add new endpoints following existing route pattern

**Route pattern** (from admin.ts lines 46-54 — GET endpoint with try/catch):
```typescript
router.get('/endpoint', (req, res) => {
  try {
    const data = service.getData();
    res.json(data);
  } catch (error) {
    console.error('[Admin] Error:', error);
    res.status(500).json({ error: 'Failed to load' });
  }
});
```

**New endpoints to add:**
- `GET /admin/validation-results` — return persisted validation results
- `PUT /admin/providers/:id/rate-limit` — update per-provider rate limit
- `GET /admin/providers/:id/rate-limit` — get per-provider rate limit

**Validation schema pattern** (from admin.ts lines 27-34):
```typescript
const rateLimitSchema = z.object({
  requestsPerMinute: z.number().int().min(1).max(1000),
});
```

---

### `packages/proxy/src/services/requestLog.ts` (service, file-I/O) — MODIFIED

**Analog:** itself — extend `RequestLogEntry` type with `retryCount` field

**Current type** (from types/index.ts lines 49-60):
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
  requestBodyPreview?: string;
  responsePreview?: string;
}
```

**Add field:** `retryCount?: number` — set when a request is retried (D-69)

---

### `packages/proxy/src/index.ts` (entry, request-response) — MODIFIED

**Analog:** itself — insert rate limiter middleware before proxy handler

**Current proxy mount** (line 125):
```typescript
app.post('/v1/messages', express.json(), requestLoggerMiddleware, handleProxyRequest);
```

**New pattern:** Insert rate limiter middleware after requestLoggerMiddleware:
```typescript
app.post('/v1/messages', express.json(), requestLoggerMiddleware, rateLimitMiddleware, handleProxyRequest);
```

**Startup pattern** (from index.ts lines 146-165): Load validation store and rate limiter config during `loadConfigOnStartup()`.

---

### `apps/web/src/components/ProviderList.tsx` (component, request-response) — MODIFIED

**Analog:** itself — add warning badge next to the enabled/disabled badge

**Badge insertion point** (lines 112-119):
```tsx
<div className="flex items-center gap-md">
  <div>
    <p className="font-heading text-[18px] text-ink">{p.name}</p>
    <p className="text-small text-muted font-mono">{p.baseUrl}</p>
  </div>
  <span className="bg-surface-strong text-ink text-[11px] font-semibold uppercase tracking-[0.88px] rounded-pill px-[10px] py-xxs">
    {p.enabled ? 'Enabled' : 'Disabled'}
  </span>
  {/* Add WarningBadge here if provider has validation failure */}
</div>
```

**Integration:** Import `useHealthStore` and check `!isProviderHealthy(p.name)` to conditionally render `<WarningBadge message={validationResults[p.name].error} />`.

---

### `apps/web/src/components/StatusPage.tsx` (component, request-response) — MODIFIED

**Analog:** itself — add 5th StatusCard for Provider Health

**Card grid** (lines 88-109):
```tsx
<div className="grid grid-cols-2 gap-md mb-lg">
  <StatusCard label="Port" value={port?.toString() || '—'} icon={Network} />
  <StatusCard label="Version" value={version || '—'} icon={GitCommit} />
  <StatusCard label="Uptime" value={uptimeDisplay} icon={Clock} />
  <StatusCard label="Providers" value={providerCount.toString()} icon={Server} />
  {/* Add ProviderHealthCard here as 5th card */}
</div>
```

**Polling pattern** (lines 18-28) — add `useHealthStore` polling alongside existing `checkHealth` polling.

---

### `apps/web/src/lib/api.ts` (api-client, request-response) — MODIFIED

**Analog:** itself — add new API functions following existing pattern

**API function pattern** (from api.ts lines 68-82):
```typescript
export async function fetchProviders(): Promise<Array<...>> {
  const response = await fetch(`${PROXY_API_BASE}/admin/providers`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Failed to fetch providers');
  return response.json();
}
```

**New functions to add:**
- `fetchValidationResults()` — GET `/admin/validation-results`
- `setRateLimit(providerId, rpm)` — PUT `/admin/providers/:id/rate-limit`
- `getRateLimit(providerId)` — GET `/admin/providers/:id/rate-limit`

---

## Shared Patterns

### Singleton Service Pattern
**Source:** `packages/proxy/src/services/requestLog.ts` (lines 118-119), `packages/proxy/src/services/config.ts` (lines 237-238)
**Apply to:** `rateLimiter.ts`, `retryHandler.ts`, `validationStore.ts`
```typescript
// Singleton instance
export const serviceName = new ServiceClass();
```

### Atomic Write Pattern
**Source:** `packages/proxy/src/services/config.ts` (lines 119-131), `packages/proxy/src/services/requestLog.ts` (lines 104-115)
**Apply to:** `validationStore.ts`, `rateLimiter.ts` (for config persistence)
```typescript
if (!existsSync(DIR)) {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
}
const tempPath = `${filePath}.tmp`;
writeFileSync(tempPath, content, { mode: 0o600 });
renameSync(tempPath, filePath);
```

### Express Route Error Handling
**Source:** `packages/proxy/src/routes/admin.ts` (lines 46-54, 60-78)
**Apply to:** All new admin routes (validation-results, rate-limit)
```typescript
router.get('/endpoint', (req, res) => {
  try {
    const data = service.getData();
    res.json(data);
  } catch (error) {
    console.error('[Admin] Error:', error);
    res.status(500).json({ error: 'Failed to load' });
  }
});
```

### Zustand Store Pattern
**Source:** `apps/web/src/stores/proxyStore.ts` (lines 1-94)
**Apply to:** `healthStore.ts`
```typescript
import { create } from 'zustand';

interface State { /* ... */ }

export const useStore = create<State>((set, get) => ({
  // initial state
  // actions using set/get
}));
```

### Toast Notification Pattern
**Source:** `apps/web/src/components/Toast.tsx` (lines 30-39)
**Apply to:** Retry toast notifications (D-69)
```typescript
const { toast } = useToast();
toast('Retrying request (attempt 1/2)...', 'warning'); // may need to add 'warning' type
```

### Cursor Brand Badge-Pill Pattern
**Source:** `apps/web/src/components/ProviderList.tsx` (line 117-119)
**Apply to:** `WarningBadge.tsx`
```tsx
<span className="text-[11px] font-semibold uppercase tracking-[0.88px] rounded-pill px-[10px] py-xxs">
```

### Polling Pattern (5s interval)
**Source:** `apps/web/src/components/StatusPage.tsx` (lines 23-28)
**Apply to:** `healthStore.ts` polling in StatusPage
```typescript
useEffect(() => {
  pollFunction();
  const interval = setInterval(pollFunction, 5000);
  return () => clearInterval(interval);
}, [pollFunction]);
```

## No Analog Found

All files have close analogs in the existing codebase. No files require RESEARCH.md patterns as primary reference.

## Metadata

**Analog search scope:** `packages/proxy/src/`, `apps/web/src/`
**Files scanned:** 18
**Pattern extraction date:** 2026-05-11
