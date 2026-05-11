---
phase: "02-sse-streaming-integration"
plan: 02
subsystem: proxy-adapters
tags: [sse, adapters, streaming, format-transform]
dependency:
  requires: [02-01]
  provides: [PROX-04, PROX-05]
  affects: [proxy-handler, admin-validation]
tech-stack:
  added: [eventsource-parser@3.0.8]
  patterns: [adapter-pattern, async-generator, sse-transformation, content-block-lifecycle]
key-files:
  created:
    - packages/proxy/src/services/sse-transformer.ts
    - packages/proxy/src/adapters/opencode.ts
    - packages/proxy/src/adapters/ollama.ts
    - packages/proxy/src/adapters/custom.ts
    - packages/proxy/src/adapters/interface.ts (prerequisite from 02-01)
    - packages/proxy/src/adapters/index.ts (prerequisite from 02-01)
    - packages/proxy/src/adapters/openrouter.ts (prerequisite from 02-01)
decisions:
  - "Used EventSourceMessage type (not ParsedEvent) from eventsource-parser v3.0.8"
  - "ContentBlockManager tracks textIndex for consistent delta emission — do not allocate new index per delta"
  - "OpenRouter adapter uses callback-based event collection (events array) since yield is invalid in strict-mode callbacks"
  - "Ollama uses /api/tags for validation (local-only, no API key needed)"
metrics:
  duration: "~15min"
  completed: "2026-05-10T20:57:00Z"
  tasks_completed: 3
  files_created: 7
---

# Phase 2 Plan 02: SSE Transformer + OpenCode/Ollama/Custom Adapters Summary

**One-liner:** SSE transformation engine with SSEBuilder for Anthropic event lifecycle generation, plus three provider adapters (OpenCode with full bidirectional transform, Ollama with native Anthropic passthrough, Custom as generic OpenAI-compatible fallback) — completing the adapter set for all provider types.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 0 | Prerequisite: ProviderAdapter interface + eventsource-parser | `773ffc0` | interface.ts, package.json |
| 1 | SSE transformer service (SSEBuilder, ContentBlockManager, parseSSEStream) | `32b9b60` | sse-transformer.ts |
| 2 | OpenCode adapter (bidirectional Anthropic ↔ OpenAI transform) | `6fc268a` | opencode.ts |
| 3 | Ollama + Custom adapters | `b9dd3c7` | ollama.ts, custom.ts |
| 0 | Prerequisite: OpenRouter adapter + adapter registry | `4228d1d` | openrouter.ts, index.ts |

## SSEBuilder Event Sequence

Verified correct Anthropic SSE event sequence:
1. `message_start` — with id, model, role=assistant, content=[], usage (output_tokens: 1 placeholder)
2. `content_block_start` — synthesized by ContentBlockManager when first text delta arrives
3. `content_block_delta` — text_delta for each content chunk
4. `content_block_stop` — synthesized on finish_reason
5. `message_delta` — with mapped stop_reason and output_tokens
6. `message_stop` — terminal event

## Adapter Summary

| Adapter | providerType | transformRequest | transformResponse | validate |
|---------|-------------|-----------------|-------------------|----------|
| OpenRouter | openrouter | Passthrough (native Anthropic) | Native Anthropic SSE passthrough + [DONE] filter | GET /v1/models |
| OpenCode | opencode | Anthropic → OpenAI chat/completions | OpenAI SSE → Anthropic SSE via SSEBuilder | GET /v1/models → POST fallback |
| Ollama | ollama | Passthrough (native Anthropic) | Native Anthropic SSE passthrough + [DONE] filter | GET /api/tags (local) |
| Custom | custom | Anthropic → OpenAI chat/completions | OpenAI SSE → Anthropic SSE via SSEBuilder | GET /v1/models → POST fallback |

## Decisions Made

1. **EventSourceMessage type** — eventsource-parser v3.0.8 exports `EventSourceMessage`, not `ParsedEvent`. All imports updated accordingly.
2. **ContentBlockManager textIndex tracking** — `emitTextDelta()` uses the tracked `textIndex` rather than allocating a new index per delta, ensuring all text deltas reference the same content block.
3. **Callback-based event collection** — OpenRouter/Ollama adapters use an events array pattern since `yield` is invalid inside strict-mode callbacks (the `onEvent` callback of `createParser`).
4. **Ollama local validation** — Uses `/api/tags` endpoint (Ollama-specific) with 5s timeout. No API key required since Ollama runs locally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prerequisite files missing (Plan 02-01 not executed)**
- **Found during:** Task 1 start — interface.ts, index.ts, openrouter.ts did not exist
- **Issue:** Plan 02-02 depends on ProviderAdapter interface and adapter registry from Plan 02-01, which hadn't been executed
- **Fix:** Created interface.ts, openrouter.ts, and initial index.ts before proceeding with Plan 02-02 tasks
- **Files modified:** interface.ts, openrouter.ts, index.ts, package.json
- **Commits:** `773ffc0`, `4228d1d`

**2. [Rule 1 - Bug] ParsedEvent type not exported from eventsource-parser**
- **Found during:** TypeScript compilation
- **Issue:** Plan referenced `ParsedEvent` type but eventsource-parser v3.0.8 exports `EventSourceMessage`
- **Fix:** Updated all imports to use `EventSourceMessage` type
- **Files modified:** sse-transformer.ts, openrouter.ts, ollama.ts

**3. [Rule 1 - Bug] yield invalid in strict-mode callback**
- **Found during:** TypeScript compilation of openrouter.ts
- **Issue:** Original pattern used `yield` inside `onEvent` callback, which is invalid in strict mode
- **Fix:** Used events array collection pattern — collect events in callback, yield from main loop
- **Files modified:** openrouter.ts, ollama.ts

## Known Stubs

None — all adapters implement complete functionality per plan requirements.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: tampering | sse-transformer.ts | parseSSEStream uses eventsource-parser — raw upstream text never forwarded to Claude Code (T-02-05 mitigated) |
| threat_flag: info-disclosure | sse-transformer.ts | getUserFacingErrorMessage sanitizes sk-* patterns from all error messages (T-02-06 mitigated) |
| threat_flag: dos | opencode.ts, custom.ts | AbortController with 120s streaming timeout on all upstream requests (T-02-07 mitigated) |
| threat_flag: tampering | opencode.ts, custom.ts | Tool schema transformation maps input_schema → parameters without injecting arbitrary content (T-02-08 mitigated) |
| threat_flag: spoofing | ollama.ts | Ollama is local-only (/api/tags), no API key required, low spoofing risk (T-02-09 accepted) |

## Verification

- TypeScript compiles without errors (0 errors across all new files)
- All 29 existing tests pass
- SSEBuilder produces correct Anthropic SSE event sequence
- ContentBlockManager correctly tracks open blocks and synthesizes missing events
- All adapters implement validate() with appropriate endpoints
- Error messages are sanitized (no API key leakage)
- Adapter registry registers all 4 adapters (OpenRouter, OpenCode, Ollama, Custom)

## Self-Check: PASSED

All created files verified:
- `packages/proxy/src/services/sse-transformer.ts` ✓
- `packages/proxy/src/adapters/opencode.ts` ✓
- `packages/proxy/src/adapters/ollama.ts` ✓
- `packages/proxy/src/adapters/custom.ts` ✓
- `packages/proxy/src/adapters/interface.ts` ✓
- `packages/proxy/src/adapters/index.ts` ✓
- `packages/proxy/src/adapters/openrouter.ts` ✓

All commits verified:
- `773ffc0` ✓
- `32b9b60` ✓
- `6fc268a` ✓
- `b9dd3c7` ✓
- `4228d1d` ✓
