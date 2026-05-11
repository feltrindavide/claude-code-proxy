# Phase 5: Reliability Polish - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase improves the proxy's robustness without adding new v1 requirements. It adds: (1) rate limiting per provider to prevent overwhelming upstream APIs, (2) retry logic with exponential backoff for transient errors, (3) UI visibility for startup validation warnings, and (4) a Provider Health card on the Status page. The proxy backend (Phase 1+2), desktop shell (Phase 3), and observability (Phase 4) are already complete — this phase makes the system more resilient.
</domain>

<decisions>
## Implementation Decisions

### Rate Limiting
- **D-59:** Rate limiting tracks requests per minute per provider (not global, not token-based)
- **D-60:** When rate limit is exceeded, requests are queued and delayed (not rejected with 429) — processed when the window resets
- **D-61:** Rate limits are configurable per provider in settings (stored in config.json, adjustable from UI)
- **D-62:** Default rate limit: 60 requests/minute per provider

### Automatic Failover
- **D-63:** No automatic failover — if primary provider fails, show user-friendly error immediately
- **D-64:** User must manually disable a failed provider to stop routing to it
- **D-65:** Failover is explicitly out of scope — automatic provider switching was already excluded in PROJECT.md ("Real-time model switching — Configuration changes require restart for reliability")

### Retry with Backoff
- **D-66:** Retry only transient errors: 5xx server errors, network errors, timeouts (AbortError)
- **D-67:** Do NOT retry on 4xx client errors (bad request, authentication errors, rate limits from provider)
- **D-68:** Maximum 2 retries with exponential backoff: 1s delay then 2s delay
- **D-69:** Retries are logged in the routing log (visible as 'retry 1/2' status) AND show toast notification ("Retrying request (attempt 1/2)...")

### Startup Validation UI
- **D-70:** Warning badges shown on failed providers in the Providers page (not just console logs)
- **D-71:** Provider Health card added to Status page showing "X of Y providers healthy" summary
- **D-72:** Validation warnings persist until user fixes the provider configuration or dismisses the warning
- **D-73:** ProviderValidatorService (existing from Phase 2) is reused — only UI integration is new

### the agent's Discretion
- Exact rate limiting algorithm implementation (token bucket vs sliding window — both work for req/min)
- Queue implementation for rate-limited requests (in-memory array vs more sophisticated queue)
- Exact visual design of warning badges and Provider Health card (follow Cursor brand tokens)
- Dismiss mechanism for validation warnings (dismiss button vs auto-dismiss on next successful validation)

### Folded Todos
None — no todos were folded into this phase's scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design
- `DESIGN.md` — Cursor brand design system (warm cream canvas, Cursor Orange #f54e00, JetBrains Mono)

### Phase 3+4 Context (carry-forward decisions)
- `.planning/phases/03-desktop-ui-shell/03-CONTEXT.md` — D-29 through D-43 (Tauri shell, sidebar nav, status indicator, Keychain integration, provider form)
- `.planning/phases/04-model-mapping-ui-routing-log/04-CONTEXT.md` — D-44 through D-58 (request logging, export/import, routing log)

### Phase 1+2 Context (backend)
- `.planning/phases/01-core-proxy-server/01-CONTEXT.md` — D-01 through D-14 (proxy model, port, config, Keychain, model mapping)
- `.planning/phases/02-sse-streaming-integration/02-CONTEXT.md` — D-15 through D-28 (adapters, SSE, validation, errors)

### Project
- `.planning/PROJECT.md` — Core value, constraints, model mappings, out-of-scope (real-time switching excluded)
- `.planning/REQUIREMENTS.md` — Phase 5 has no new v1 requirements; v2 reliability requirements (RELY-01, ROTE-02, RELY-03) are deferred
- `.planning/ROADMAP.md` — Phase 5 goal and success criteria

### Existing Code (Phase 1-4 deliverables)
- `packages/proxy/src/services/provider-validator.ts` — Existing ProviderValidatorService (validate on save + startup)
- `packages/proxy/src/adapters/interface.ts` — ProviderAdapter interface with timeout config
- `packages/proxy/src/proxy.ts` — Proxy handler with AbortController and timeout per request
- `packages/proxy/src/services/requestLog.ts` — RequestLogService with ring buffer (Phase 4)
- `packages/proxy/src/types/index.ts` — Type definitions including RouteResolution (extended with claudeTier in Phase 4)
- `apps/web/src/components/StatusPage.tsx` — Status page with metric cards (add Provider Health card)
- `apps/web/src/components/ProviderList.tsx` — Provider list with edit/delete (add warning badges)
- `apps/web/src/stores/proxyStore.ts` — Zustand store pattern (reference for new stores)
- `apps/web/src/lib/api.ts` — API client (add rate limit config functions)
- `apps/web/src/components/Toast.tsx` — Toast notification system (reuse for retry notifications)

### Reference Implementations
- `reference/claude-code-router/` — TypeScript Node.js monorepo
- `reference/free-claude-code/` — Python proxy with provider abstraction

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`packages/proxy/src/services/provider-validator.ts`** — Existing validation service, validates on save and startup, logs warnings. Reuse for Phase 5 UI integration.
- **`packages/proxy/src/adapters/interface.ts`** — ProviderAdapter interface with `timeouts` property. Add rate limit config here.
- **`packages/proxy/src/proxy.ts`** — Proxy handler with AbortController. Add retry logic wrapper around the upstream request.
- **`packages/proxy/src/services/requestLog.ts`** — RequestLogService with ring buffer. Extend log entry to include retry count.
- **`apps/web/src/components/Toast.tsx`** — Toast notification system. Reuse for retry notifications.
- **`apps/web/src/components/StatusPage.tsx`** — Status page with 4 metric cards. Add 5th card for Provider Health.
- **`apps/web/src/components/ProviderList.tsx`** — Provider list. Add warning badge component for failed validation.

### Established Patterns
- **Atomic writes**: ConfigService uses temp file + rename — reuse for rate limit config persistence
- **Zustand polling**: proxyStore and logStore use 5s setInterval — pattern for provider health polling
- **Admin API**: Express router at `/admin/*` with JSON responses — add rate limit config endpoints here
- **Cursor brand**: Tailwind tokens for colors, typography, spacing — all new UI components use these tokens
- **Error handling**: SSE transformer converts errors to user-friendly messages — extend for retry-aware messages

### Integration Points
- **Rate limiter**: New middleware inserted before proxy handler in `packages/proxy/src/index.ts`
- **Retry wrapper**: Wrap upstream request in `packages/proxy/src/proxy.ts` handleProxyRequest function
- **Startup validation UI**: Frontend fetches validation results from new admin endpoint on app load
- **Provider Health card**: New component on StatusPage, reads from validation results store
- **Warning badges**: New component on ProviderList, reads per-provider validation status

</code_context>

<specifics>
## Specific Ideas

- User wants both routing log entries AND toast notifications for retries — dual visibility
- User wants warning badges on Providers page AND health summary on Status page — comprehensive visibility
- No automatic failover — user prefers explicit control over provider routing
- Rate limits should be per-provider and configurable — different providers have different limits
- Queue rate-limited requests rather than rejecting — better user experience
</specifics>

<deferred>
## Deferred Ideas

- **RELY-01 (Automatic failover)** — Explicitly deferred per D-63/D-64/D-65. User prefers manual control.
- **RELY-03 (Retry with exponential backoff)** — Partially implemented (D-66 to D-69 cover retry, but full RELY-03 scope may include more advanced backoff strategies).
- **ROTE-02 (Rate limiting per provider)** — Implemented in this phase (D-59 to D-62).

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 05-reliability-polish*
*Context gathered: 2026-05-10*
