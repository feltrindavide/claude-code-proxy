---
phase: "02-sse-streaming-integration"
plan: 03
subsystem: proxy-validation-integration
tags: [provider-validation, custom-proxy, sse-streaming, admin-routes, startup-validation]
dependency:
  requires: [02-01, 02-02]
  provides: [PROV-03, PROX-05, INTG-03]
  affects: [proxy-handler, admin-validation, startup-flow]
tech-stack:
  added: []
  removed: [http-proxy-middleware passthrough]
  patterns: [provider-validation, custom-proxy-handler, sse-streaming, abort-controller-timeout, error-sanitization]
key-files:
  created:
    - packages/proxy/src/services/provider-validator.ts
  modified:
    - packages/proxy/src/types/index.ts
    - packages/proxy/src/proxy.ts
    - packages/proxy/src/routes/admin.ts
    - packages/proxy/src/index.ts
    - packages/proxy/tests/proxy/proxy.test.ts
decisions:
  - "LLMProvider extended with optional providerType field for adapter resolution"
  - "AdapterConfig type added for future extensibility"
  - "Validation on save logs warning but doesn't block response (user may fix later)"
  - "Startup validation runs async but doesn't block server start on failures"
  - "http-proxy-middleware import fully removed from proxy.ts (no longer needed)"
  - "Test updated to reference handleProxyRequest instead of createProxyHandler"
metrics:
  duration: "~15min"
  completed: "2026-05-10T21:05:00Z"
  tasks_completed: 3
  files_created: 1
  files_modified: 5
---

# Phase 2 Plan 03: Provider Validation + Custom Proxy Handler + Integration Summary

**One-liner:** ProviderValidatorService with validate-on-save and validate-on-startup, custom SSE streaming proxy handler replacing http-proxy-middleware passthrough, and full integration wiring — completing the transformation pipeline where Claude Code works transparently through the proxy (INTG-03) with provider connectivity validation (PROV-03).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | ProviderValidatorService + extend types | `cf81ab5` | provider-validator.ts (new), types/index.ts |
| 2 | Replace http-proxy-middleware with custom SSE handler | `18f1b9b` | proxy.ts |
| 3 | Wire validation into admin routes and startup | `c298ac2` | admin.ts, index.ts, proxy.test.ts |

## ProviderValidatorService

- `validateProvider(name, baseUrl)` — looks up adapter by name, retrieves API key from Keychain, calls adapter.validate()
- `validateAllProviders()` — iterates all enabled providers, validates each, logs warnings for failures, returns Map<string, ValidationResult>
- Singleton exported as `providerValidatorService`

## Custom Proxy Handler (handleProxyRequest)

Complete request flow:
1. Parse model from request body
2. Resolve route via ProviderService → emit error if no route
3. Get API key from Keychain → emit error if missing
4. Select adapter via getOrCreateAdapter (providerType fallback to provider name)
5. Transform request body (Anthropic → provider format)
6. Fetch upstream with AbortController timeout (120s streaming)
7. Set SSE response headers (text/event-stream, no-cache, keep-alive, X-Accel-Buffering: no)
8. Stream transformed SSE response via adapter.transformResponse()
9. Catch errors → emitAnthropicError() with sanitized message

## Error Handling (emitAnthropicError)

- Logs full error internally via console.error
- Sanitizes message via getUserFacingErrorMessage() (removes sk-* patterns)
- Emits Anthropic-format error SSE event: `event: error\ndata: {type: 'error', error: {type: 'api_error', message: '...'}}`

## Admin Routes Extended

- `POST /admin/providers/:id/validate` — validates single provider connectivity, returns ValidationResult
- `POST /admin/providers` — now validates on save, includes validation result in response, logs warning on failure (doesn't block)
- Provider registration now stores `providerType` from request body for adapter resolution

## Startup Validation

- `loadConfigOnStartup()` is now async
- After loading providers and routes, calls `validateAllProviders()`
- Logs warnings for each failed provider
- Doesn't block server startup on validation failures

## Types Extended

- `LLMProvider.providerType?: string` — optional adapter type field
- `AdapterConfig` — new interface for future extensibility (providerType + optional timeouts)

## Decisions Made

1. **providerType optional on LLMProvider** — allows gradual migration; falls back to provider name for adapter lookup
2. **Validation doesn't block on save** — user can save provider with connectivity issues and fix later
3. **Startup validation is fire-and-warn** — server starts even if providers are unreachable
4. **http-proxy-middleware fully removed** — no longer needed since custom handler handles all routing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test referenced removed createProxyHandler**
- **Found during:** npm run test:run after Task 3
- **Issue:** tests/proxy/proxy.test.ts imported createProxyHandler which no longer exists
- **Fix:** Updated import to handleProxyRequest and updated test description
- **Files modified:** packages/proxy/tests/proxy/proxy.test.ts
- **Commit:** `c298ac2`

## Known Stubs

None — all functionality implemented per plan requirements.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: info-disclosure | proxy.ts emitAnthropicError | Full error logged internally but sanitized via getUserFacingErrorMessage() — removes sk-* patterns, never exposes API keys (T-02-10 mitigated) |
| threat_flag: tampering | proxy.ts handleProxyRequest | Uses resolution.provider.baseUrl from ProviderService registry (not from client request body) — prevents client from redirecting to arbitrary URLs (T-02-11 mitigated) |
| threat_flag: dos | proxy.ts handleProxyRequest | AbortController with per-adapter timeout (120s streaming), clearTimeout in both success and error paths (T-02-12 mitigated) |
| threat_flag: spoofing | admin.ts POST /providers/:id/validate | Validates against registered provider in ProviderService — cannot validate arbitrary URLs; API key retrieved from Keychain (T-02-13 mitigated) |
| threat_flag: info-disclosure | admin.ts validation response | ValidationResult returns {valid, error?, models?} — no API keys or sensitive connection details exposed (T-02-14 mitigated) |

## Verification

- TypeScript compiles without errors (0 errors across all files)
- All 29 tests pass (5 test files)
- ProviderValidatorService validates individual providers and all providers on startup
- Admin API has POST /admin/providers/:id/validate endpoint
- POST /admin/providers validates on save (logs warning on failure, doesn't block)
- proxy.ts uses custom handleProxyRequest instead of http-proxy-middleware passthrough
- handleProxyRequest resolves adapter, transforms request, streams transformed SSE, handles errors
- emitAnthropicError produces Anthropic-compatible error SSE events
- loadConfigOnStartup() calls validateAllProviders() with warning logs
- index.ts routes /v1/messages to handleProxyRequest with express.json() middleware

## Self-Check: PASSED

All created files verified:
- `packages/proxy/src/services/provider-validator.ts` ✓

All modified files verified:
- `packages/proxy/src/types/index.ts` ✓
- `packages/proxy/src/proxy.ts` ✓
- `packages/proxy/src/routes/admin.ts` ✓
- `packages/proxy/src/index.ts` ✓
- `packages/proxy/tests/proxy/proxy.test.ts` ✓

All commits verified:
- `cf81ab5` ✓
- `18f1b9b` ✓
- `c298ac2` ✓
