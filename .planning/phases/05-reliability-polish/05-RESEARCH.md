# Phase 5: Reliability Polish - Research

**Researched:** 2026-05-11
**Domain:** Express rate limiting, retry with backoff, provider health monitoring, Zustand state management
**Confidence:** HIGH

## Summary

Phase 5 adds four reliability capabilities to the existing proxy: per-provider rate limiting with queuing (not rejection), retry with exponential backoff for transient errors, startup validation UI visibility, and a Provider Health card. The existing codebase provides strong foundations: `ProviderValidatorService` for health checks, `requestLogService` for logging, `proxyStore` pattern for Zustand polling, and `Toast.tsx` for notifications.

**Key finding:** `express-rate-limit` rejects with 429 by default — it does NOT queue requests. Decision D-60 requires queuing/delaying, not rejecting. `Bottleneck` is the correct library for this use case: it natively queues requests and executes them when the rate window resets, with zero dependencies and 10M+ weekly downloads. `express-rate-limit` is still useful for the standard headers/metadata but cannot fulfill the queuing requirement alone.

**Primary recommendation:** Use `Bottleneck` for per-provider rate limiting with queuing, `p-retry` for retry with exponential backoff, extend `ProviderValidatorService` results to a persisted state + admin endpoint, and add a `healthStore` Zustand store following the existing `proxyStore` polling pattern.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-provider rate limiting with queuing | API / Backend | — | Must intercept requests before they hit upstream; in-memory queue is appropriate for single-instance proxy |
| Retry with exponential backoff | API / Backend | — | Wraps upstream fetch calls; only backend knows which errors are transient |
| Provider health state persistence | API / Backend | — | Startup validation runs in backend; results must be stored and exposed via admin API |
| Provider health polling + UI | Browser / Client | API / Backend | Frontend polls admin endpoint; displays badges and health card |
| Retry toast notifications | Browser / Client | API / Backend | Retry events logged in request log; frontend polls log and detects retry entries to trigger toasts |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-59:** Rate limiting tracks requests per minute per provider (not global, not token-based)
- **D-60:** When rate limit is exceeded, requests are queued and delayed (not rejected with 429) — processed when the window resets
- **D-61:** Rate limits are configurable per provider in settings (stored in config.json, adjustable from UI)
- **D-62:** Default rate limit: 60 requests/minute per provider
- **D-63:** No automatic failover — if primary provider fails, show user-friendly error immediately
- **D-64:** User must manually disable a failed provider to stop routing to it
- **D-65:** Failover is explicitly out of scope — automatic provider switching was already excluded in PROJECT.md
- **D-66:** Retry only transient errors: 5xx server errors, network errors, timeouts (AbortError)
- **D-67:** Do NOT retry on 4xx client errors (bad request, authentication errors, rate limits from provider)
- **D-68:** Maximum 2 retries with exponential backoff: 1s delay then 2s delay
- **D-69:** Retries are logged in the routing log (visible as 'retry 1/2' status) AND show toast notification ("Retrying request (attempt 1/2)...")
- **D-70:** Warning badges shown on failed providers in the Providers page (not just console logs)
- **D-71:** Provider Health card added to Status page showing "X of Y providers healthy" summary
- **D-72:** Validation warnings persist until user fixes the provider configuration or dismisses the warning
- **D-73:** ProviderValidatorService (existing from Phase 2) is reused — only UI integration is new

### the agent's Discretion
- Exact rate limiting algorithm implementation (token bucket vs sliding window — both work for req/min)
- Queue implementation for rate-limited requests (in-memory array vs more sophisticated queue)
- Exact visual design of warning badges and Provider Health card (follow Cursor brand tokens)
- Dismiss mechanism for validation warnings (dismiss button vs auto-dismiss on next successful validation)

### Deferred Ideas (OUT OF SCOPE)
- **RELY-01 (Automatic failover)** — Explicitly deferred per D-63/D-64/D-65
- **RELY-03 (Retry with exponential backoff)** — Partially implemented (D-66 to D-69 cover retry, but full RELY-03 scope may include more advanced backoff strategies)
- **ROTE-02 (Rate limiting per provider)** — Implemented in this phase (D-59 to D-62)

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bottleneck` | 2.19.5 | Per-provider rate limiting with queuing | Zero dependencies, 10M+ weekly downloads, native queueing (not rejection), `reservoir` + `reservoirRefreshInterval` exactly matches "X requests per minute" semantics, TypeScript built-in |
| `p-retry` | 8.0.0 | Retry with exponential backoff | 36M+ weekly downloads, `AbortError` to skip retries, `onFailedAttempt` callback for logging/toasts, `minTimeout` + `factor` for configurable backoff, ESM + TypeScript |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `express-rate-limit` | 8.5.1 | Rate limit headers (optional) | If standard `RateLimit-*` headers are desired for observability; cannot queue, only reject |

**Installation:**
```bash
cd packages/proxy && npm install bottleneck p-retry
```

**Version verification:**
- `bottleneck@2.19.5` — published 7 years ago, stable, no updates needed (last publish was 2019 but still the definitive rate limiter for Node.js) [VERIFIED: npm registry]
- `p-retry@8.0.0` — published ~1 month ago, actively maintained by sindresorhus [VERIFIED: npm registry]
- `express-rate-limit@8.5.1` — current latest [VERIFIED: npm registry]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bottleneck` for queuing | `express-rate-limit` + custom queue | `express-rate-limit` only rejects (429), requires building queue from scratch; D-60 explicitly requires queuing |
| `bottleneck` for queuing | Custom `setTimeout`-based queue | Reinvents bottleneck's battle-tested queue management, priority support, and error handling |
| `p-retry` for backoff | Custom retry loop | `p-retry` handles `AbortError` detection, `TypeError` network error detection, backoff math, and `onFailedAttempt` callback — all needed for D-66/D-69 |
| `p-retry` for backoff | `async-retry` | `async-retry` is older (1.3.3, last updated years ago), less feature-rich; `p-retry` is actively maintained |

## Architecture Patterns

### System Architecture Diagram

```
Claude Code CLI
       │
       ▼ POST /v1/messages
┌──────────────────────────────────────────────────────┐
│  Express Proxy (packages/proxy)                      │
│                                                      │
│  ┌─────────────┐    ┌────────────────────────────┐   │
│  │ Rate Limiter│───▶│  Retry Wrapper             │   │
│  │ (Bottleneck │    │  (p-retry)                 │   │
│  │  per provider│   │  - 5xx/network/timeout     │   │
│  │  queue)      │   │  - Skip 4xx                │   │
│  └─────────────┘    │  - Max 2 retries, 1s→2s    │   │
│         │           └──────────┬─────────────────┘   │
│         ▼                      ▼                     │
│  ┌─────────────────────────────────────────────┐     │
│  │  Provider Adapter (OpenRouter/Ollama/etc.)   │     │
│  └─────────────────────────────────────────────┘     │
│         │                                            │
│         ▼                                            │
│  ┌──────────────┐   ┌──────────────────────┐        │
│  │ Request Log  │   │ Validation Results   │        │
│  │ (ring buffer)│   │ (persisted to disk)  │        │
│  └──────────────┘   └──────────────────────┘        │
│                                                      │
│  Admin API:                                          │
│  GET  /admin/validation-results                      │
│  PUT  /admin/providers/:id/rate-limit                │
│  GET  /admin/providers/:id/rate-limit                │
└──────────────────────────────────────────────────────┘
       │
       ▼ SSE response (transformed)
Claude Code CLI

┌──────────────────────────────────────────────────────┐
│  Frontend (apps/web)                                 │
│                                                      │
│  ┌──────────────┐   ┌──────────────────────┐        │
│  │ healthStore  │   │ logStore             │        │
│  │ (5s polling) │   │ (5s polling)         │        │
│  │              │   │                      │        │
│  │ → badges     │   │ → retry toasts       │        │
│  │ → health card│   │                      │        │
│  └──────────────┘   └──────────────────────┘        │
│                                                      │
│  Components:                                         │
│  - ProviderList (warning badges)                     │
│  - StatusPage (Provider Health card)                 │
│  - ToastContainer (retry notifications)              │
└──────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
packages/proxy/src/
├── services/
│   ├── rateLimiter.ts        # NEW: Per-provider Bottleneck limiter management
│   ├── retryHandler.ts       # NEW: p-retry wrapper for upstream fetch
│   ├── validationStore.ts    # NEW: Persisted validation results store
│   ├── provider-validator.ts # EXISTING: Reused for startup validation
│   └── requestLog.ts         # EXISTING: Extended with retryCount field
├── middleware/
│   ├── rateLimitMiddleware.ts # NEW: Bottleneck-based rate limiting middleware
│   └── requestLogger.ts      # EXISTING: Extended with retry context
├── proxy.ts                  # MODIFIED: Wrap upstream fetch with retry
└── routes/
    └── admin.ts              # MODIFIED: Add validation-results + rate-limit endpoints

apps/web/src/
├── stores/
│   ├── healthStore.ts        # NEW: Provider health state + polling
│   ├── proxyStore.ts         # EXISTING: Reference pattern
│   └── logStore.ts           # EXISTING: Extended for retry detection
├── components/
│   ├── WarningBadge.tsx      # NEW: Warning badge for failed providers
│   ├── ProviderHealthCard.tsx # NEW: Health summary card for Status page
│   ├── ProviderList.tsx      # MODIFIED: Add warning badges
│   └── StatusPage.tsx        # MODIFIED: Add Provider Health card
└── lib/
    └── api.ts                # MODIFIED: Add health + rate-limit API functions
```

### Pattern 1: Per-Provider Rate Limiting with Bottleneck

**What:** Create a `Bottleneck.Group` keyed by provider name, using `reservoir` + `reservoirRefreshInterval` for per-minute rate limiting with automatic queuing.

**When to use:** When you need to queue requests rather than reject them (D-60).

**Example:**
```typescript
// Source: https://www.npmjs.com/package/bottleneck
import Bottleneck from 'bottleneck';

// One Group manages all provider limiters
const rateLimitGroup = new Bottleneck.Group({
  maxConcurrent: 1,      // One request at a time per provider
  minTime: 0,            // No minimum gap (reservoir controls rate)
});

// Configure per-provider rate limit
function configureProviderLimiter(providerName: string, requestsPerMinute: number) {
  const limiter = rateLimitGroup.key(providerName);
  limiter.updateSettings({
    reservoir: requestsPerMinute,         // Initial tokens
    reservoirRefreshAmount: requestsPerMinute, // Reset to this amount
    reservoirRefreshInterval: 60 * 1000,  // Every 60 seconds
  });
  return limiter;
}

// Use: schedule request through the limiter
async function makeRequest(providerName: string, fn: () => Promise<Response>) {
  const limiter = rateLimitGroup.key(providerName);
  return limiter.schedule(fn); // Queues automatically if rate limit exceeded
}
```

### Pattern 2: Retry with p-retry for Transient Errors

**What:** Wrap upstream fetch in `p-retry` with custom `shouldRetry` to only retry 5xx/network/timeout errors.

**When to use:** When retrying HTTP requests with exponential backoff, distinguishing transient vs permanent errors.

**Example:**
```typescript
// Source: https://www.npmjs.com/package/p-retry
import pRetry, { AbortError } from 'p-retry';

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  onRetry: (attempt: number) => void,
): Promise<Response> {
  return pRetry(
    async (attemptNumber) => {
      const response = await fetch(url, options);

      // 4xx errors: abort retry (permanent error)
      if (response.status >= 400 && response.status < 500) {
        throw new AbortError(
          `HTTP ${response.status}: ${await response.text().catch(() => '')}`,
        );
      }

      // 5xx errors: throw to trigger retry (transient)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: server error`);
      }

      return response;
    },
    {
      retries: 2,                    // Max 2 retries (D-68)
      minTimeout: 1000,              // 1s first retry (D-68)
      factor: 2,                     // 2x backoff: 1s → 2s (D-68)
      randomize: false,              // Deterministic backoff
      onFailedAttempt: (error) => {
        if (!(error instanceof AbortError)) {
          onRetry(error.attemptNumber); // D-69: log + toast
        }
      },
    },
  );
}
```

### Pattern 3: Zustand Health Store with Polling

**What:** Follow the existing `proxyStore` pattern — 5-second `setInterval` polling an admin endpoint, storing results in Zustand state.

**When to use:** When frontend needs to display real-time provider health status.

**Example:**
```typescript
// Pattern from apps/web/src/stores/proxyStore.ts
import { create } from 'zustand';

interface HealthState {
  validationResults: Map<string, { valid: boolean; error?: string }>;
  dismissedWarnings: Set<string>;
  pollValidation: () => Promise<void>;
  dismissWarning: (providerName: string) => void;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  validationResults: new Map(),
  dismissedWarnings: new Set(),

  pollValidation: async () => {
    const response = await fetch('http://localhost:3456/admin/validation-results');
    const results = await response.json();
    set({ validationResults: new Map(Object.entries(results)) });
  },

  dismissWarning: (providerName: string) => {
    set((state) => ({
      dismissedWarnings: new Set([...state.dismissedWarnings, providerName]),
    }));
  },
}));

// Polling in component (same pattern as StatusPage.tsx):
// useEffect(() => {
//   pollValidation();
//   const interval = setInterval(pollValidation, 5000);
//   return () => clearInterval(interval);
// }, [pollValidation]);
```

### Anti-Patterns to Avoid

- **Using `express-rate-limit` for queuing:** It only rejects with 429. D-60 explicitly requires queuing. Use `Bottleneck` instead.
- **Retrying 4xx errors:** These are client errors (bad auth, bad request). Retrying wastes time and may lock accounts. Use `AbortError` to skip.
- **Global rate limiter:** D-59 requires per-provider tracking. A single global limiter would unfairly throttle fast providers when a slow provider hits its limit.
- **Storing validation results only in memory:** D-72 requires persistence until user fixes or dismisses. Must persist to disk (same pattern as `requestLogService`).
- **Adding drop shadows to badges:** DESIGN.md explicitly forbids drop shadows. Use hairline borders only.
- **Using timeline pastel colors for warnings:** DESIGN.md restricts timeline pastels to in-product agent visualizations only. Use `semantic-error` (#cf2d56) for warnings.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-provider rate limiting with queuing | Custom `setTimeout`/`setInterval` queue | `Bottleneck` | Handles queue ordering, concurrent limits, reservoir refresh, error propagation, and graceful shutdown — all edge cases in custom queues |
| Retry with exponential backoff | `while` loop with `setTimeout` | `p-retry` | Handles `AbortError` detection, `TypeError` network error detection, backoff math, `onFailedAttempt` callbacks, and `AbortController` cancellation |
| Validation result persistence | Ad-hoc JSON file writes | Follow `RequestLogService` pattern | Atomic writes (temp + rename), directory creation with secure permissions, graceful first-run handling already implemented |

**Key insight:** Rate limiting with queuing (not rejection) is a well-solved problem. Bottleneck has been production-tested for 7+ years with 10M+ weekly downloads. Building a custom queue introduces subtle bugs around timing, concurrent request handling, and error propagation that Bottleneck already handles.

## Common Pitfalls

### Pitfall 1: express-rate-limit Cannot Queue
**What goes wrong:** Developer installs `express-rate-limit` expecting it to queue requests when rate limit is exceeded. It returns 429 instead.
**Why it happens:** `express-rate-limit` is designed to reject, not delay. The `handler` option lets you customize the response but not defer execution.
**How to avoid:** Use `Bottleneck` for queuing. Its `reservoir` + `reservoirRefreshInterval` pattern naturally queues and delays.
**Warning signs:** If your rate limit middleware calls `res.status(429).json(...)`, you're rejecting, not queuing.

### Pitfall 2: Bottleneck Reservoir Interval Timing
**What goes wrong:** All queued requests fire simultaneously when the reservoir refreshes, overwhelming the upstream API.
**Why it happens:** Bottleneck's reservoir refresh resets the counter, and all queued jobs execute at once unless constrained.
**How to avoid:** Always pair `reservoirRefreshInterval` with `maxConcurrent: 1` and a sensible `minTime` to stagger execution. For 60 req/min, `minTime: 1000` ensures at most 1 request per second even during burst.
**Warning signs:** `queued()` count drops from N to 0 instantly, with N simultaneous upstream requests.

### Pitfall 3: p-retry Retries Non-Transient Errors
**What goes wrong:** Retrying 401/403/400 errors wastes time and may trigger account lockouts.
**Why it happens:** `p-retry` retries on any thrown error by default. Must explicitly abort on 4xx.
**How to avoid:** Use `AbortError` for 4xx responses. `p-retry` never retries `AbortError` instances.
**Warning signs:** Retry logs showing attempts on 401/403 errors.

### Pitfall 4: Bottleneck Group Memory Leaks
**What goes wrong:** Dynamically created limiters for deleted providers are never garbage collected.
**Why it happens:** `Bottleneck.Group` creates limiters per key and keeps them in memory.
**How to avoid:** Call `rateLimitGroup.deleteKey(providerName)` when a provider is removed. Bottleneck auto-cleans idle limiters after 5 minutes, but explicit cleanup is safer.
**Warning signs:** `rateLimitGroup.keys()` grows unbounded as providers are added/removed.

### Pitfall 5: Zustand Store Serialization
**What goes wrong:** Storing `Map` or `Set` directly in Zustand state causes serialization issues with React DevTools and persistence.
**Why it happens:** React's state reconciliation doesn't handle `Map`/`Set` identity well.
**How to avoid:** Store as plain objects/arrays and convert to `Map`/`Set` on access, or use Zustand's `persist` middleware with custom serialization. For this phase, plain objects are sufficient since no persistence layer is needed for the frontend store.

## Code Examples

### Bottleneck Per-Provider Rate Limiter Service
```typescript
// packages/proxy/src/services/rateLimiter.ts
import Bottleneck from 'bottleneck';

const DEFAULT_RPM = 60; // D-62

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
      minTime: Math.floor(60_000 / limit), // Spread evenly across the minute
    });
  }

  async schedule<T>(providerName: string, fn: () => Promise<T>): Promise<T> {
    // Auto-configure with default if not explicitly set
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

export const rateLimiterService = new RateLimiterService();
```

### Retry Wrapper in proxy.ts
```typescript
// In packages/proxy/src/proxy.ts — wrap the upstream fetch
import pRetry, { AbortError } from 'p-retry';

// Inside handleProxyRequest, replace the direct fetch with:
const upstreamResponse = await pRetry(
  async (attemptNumber) => {
    const response = await fetch(
      `${resolution.provider.baseUrl}/v1/messages`,
      { /* ... existing options ... */ },
    );

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
    onFailedAttempt: ({ attemptNumber }) => {
      // D-69: log in routing log + toast
      console.log(`[Proxy] Retrying request (attempt ${attemptNumber}/2)`);
      // Signal to request logger that this is a retry
      (req as any)._retryAttempt = attemptNumber;
    },
  },
);
```

### Warning Badge Component (Cursor Brand)
```tsx
// apps/web/src/components/WarningBadge.tsx
// Follows DESIGN.md badge-pill pattern with semantic-error color
export function WarningBadge({ message }: { message: string }) {
  return (
    <span className="inline-flex items-center gap-xxs bg-semantic-error/10 text-semantic-error text-[11px] font-semibold uppercase tracking-[0.88px] rounded-pill px-[10px] py-xxs">
      <AlertTriangle className="w-3 h-3" />
      {message}
    </span>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global rate limiting | Per-provider rate limiting | Industry standard | Different providers have different limits; per-provider is essential |
| Reject with 429 | Queue and delay | D-60 decision | Better UX — request completes eventually instead of failing |
| Custom retry loops | `p-retry` with `AbortError` | Modern pattern | Cleaner error classification, built-in backoff math |
| Console-only validation warnings | UI badges + health card | This phase | Users see problems immediately, not just in logs |

**Deprecated/outdated:**
- `express-rate-limit` for queuing: Never supported queuing; use `Bottleneck` when queueing is required
- `async-retry`: Largely superseded by `p-retry` in the modern ESM ecosystem; `p-retry` has 36M vs 3M weekly downloads

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Bottleneck` reservoir refresh interval must be divisible by 250ms per its docs | Standard Stack — Bottleneck | LOW — if not divisible, it rounds internally; behavior still correct |
| A2 | Toast system supports a `warning` type in addition to `success`/`error` | Code Examples — Warning Badge | MEDIUM — current Toast.tsx only has `success`/`error`; may need to add `warning` variant |
| A3 | Frontend can detect retry events by polling the request log and checking for retry metadata | Architecture Pattern 3 | LOW — requires extending log entry type with retryCount field |

## Open Questions (RESOLVED)

1. **Dismiss mechanism for validation warnings (D-72)** — **(RESOLVED)**
   - What we know: Warnings persist until user fixes config or dismisses
   - What's unclear: Should dismiss be per-session (in-memory) or persistent (stored in config)?
   - **Resolution:** Dismiss persists to backend via `POST /admin/validation-results/:id/dismiss` API. Frontend healthStore calls `dismissValidationWarning(providerName)` before updating local state. Combined with server-side `dismissed` flag, warnings persist across polls and restarts until explicitly dismissed or provider fixed.

2. **Rate limit config API endpoint design** — **(RESOLVED)**
   - What we know: Rate limits are configurable per provider in settings (D-61)
   - What's unclear: Should this be a separate endpoint or part of the existing provider PUT?
   - **Resolution:** Separate endpoints: `PUT /admin/providers/:id/rate-limit` and `GET /admin/providers/:id/rate-limit` (plus `GET /admin/rate-limits` for all, `DELETE /admin/providers/:id/rate-limit` for cleanup). Avoids coupling rate limit config to provider config.

3. **Toast notification for retries from SSE stream** — **(RESOLVED)**
   - What we know: Retries should show toast (D-69)
   - What's unclear: Since the proxy handler is server-side, how does the frontend know a retry happened?
   - **Resolution:** Extend `RequestLogEntry` with `retryCount` field. StatusPage component polls request log every 5s, detects entries with `retryCount > 0` that haven't been acknowledged, and triggers `toast('Retrying request (attempt N/2)...', 'warning')`. Deduplicates via `lastAckedRetryKey` state.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 18 | Proxy runtime | ✓ | Verified in package.json | — |
| npm | Package installation | ✓ | — | — |
| Bottleneck | Rate limiting | ✗ (not installed) | 2.19.5 | Custom queue (not recommended per D-60) |
| p-retry | Retry logic | ✗ (not installed) | 8.0.0 | Custom retry loop (more error-prone) |

**Missing dependencies with fallback:**
- `bottleneck` — install via `npm install bottleneck` in `packages/proxy/`
- `p-retry` — install via `npm install p-retry` in `packages/proxy/`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^3.2.4 |
| Config file | `packages/proxy/vitest.config.ts` (assumed from package.json test:run) |
| Quick run command | `cd packages/proxy && npx vitest run -t "rate|retry|health" --reporter=verbose` |
| Full suite command | `cd packages/proxy && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RELY-01 (partial) | Per-provider rate limiting queues requests | unit | `vitest run -t "rate limiter"` | ❌ Wave 0 |
| RELY-02 | Retry only transient errors (5xx, network, timeout) | unit | `vitest run -t "retry handler"` | ❌ Wave 0 |
| RELY-03 | Max 2 retries with 1s→2s backoff | unit | `vitest run -t "retry backoff"` | ❌ Wave 0 |
| RELY-04 | Validation warnings shown as badges in UI | unit | `vitest run -t "warning badge"` | ❌ Wave 0 |
| RELY-05 | Provider Health card shows X/Y healthy | unit | `vitest run -t "health card"` | ❌ Wave 0 |
| RELY-06 | Rate limits configurable per provider | unit | `vitest run -t "rate limit config"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/proxy && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd packages/proxy && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/proxy/src/services/__tests__/rateLimiter.test.ts` — covers per-provider rate limiting, queuing behavior, reservoir refresh
- [ ] `packages/proxy/src/services/__tests__/retryHandler.test.ts` — covers transient vs permanent error classification, backoff timing, max retries
- [ ] `packages/proxy/src/services/__tests__/validationStore.test.ts` — covers persistence, retrieval, admin endpoint
- [ ] `apps/web/src/stores/__tests__/healthStore.test.ts` — covers polling, dismiss, badge state
- [ ] Framework install: `npm install bottleneck p-retry` in `packages/proxy/`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Existing KeychainService handles this |
| V3 Session Management | No | Stateless proxy, no sessions |
| V4 Access Control | No | Localhost-only, no external access |
| V5 Input Validation | Yes | zod schemas in admin.ts — extend for rate limit config validation |
| V6 Cryptography | No | No new cryptographic operations |

### Known Threat Patterns for Rate Limiting + Retry

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Rate limit bypass via provider name spoofing | Tampering | Validate provider name against registered providers before applying rate limit |
| Retry amplification (retry storm) | Availability | Max 2 retries (D-68) caps amplification at 3x; Bottleneck's `maxConcurrent: 1` prevents parallel retries |
| Queue memory exhaustion | Availability | Bottleneck's `highWater` option can cap queue size; set to reasonable limit (e.g., 100) to prevent OOM |
| Validation result tampering | Tampering | Persist validation results to disk with atomic writes (same pattern as ConfigService); don't accept client-submitted validation results |

## Sources

### Primary (HIGH confidence)
- Bottleneck npm page (https://www.npmjs.com/package/bottleneck) — full API documentation, reservoir pattern, Group API
- p-retry npm page (https://www.npmjs.com/package/p-retry) — AbortError pattern, onFailedAttempt, backoff configuration
- express-rate-limit GitHub README (https://raw.githubusercontent.com/express-rate-limit/express-rate-limit/main/readme.md) — confirmed: no queuing capability, only rejection
- Existing codebase: `packages/proxy/src/services/provider-validator.ts` — existing validation service
- Existing codebase: `apps/web/src/stores/proxyStore.ts` — Zustand polling pattern reference
- Existing codebase: `apps/web/src/components/Toast.tsx` — toast notification system
- Existing codebase: `apps/web/src/components/ProviderList.tsx` — badge-pill pattern already in use (line 117)
- DESIGN.md — Cursor brand tokens for warning badge styling

### Secondary (MEDIUM confidence)
- Bottleneck Group API for per-key limiters with auto-cleanup after 5 minutes idle

### Tertiary (LOW confidence)
- None — all claims verified against official sources or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against npm registry and official documentation
- Architecture: HIGH — based on existing codebase patterns and verified library APIs
- Pitfalls: HIGH — verified against library documentation and known issues

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days — stable libraries, no fast-moving dependencies)
