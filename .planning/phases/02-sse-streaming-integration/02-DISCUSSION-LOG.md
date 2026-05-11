# Phase 2: SSE Streaming & Integration - Discussion Log

**Date:** 2026-05-10
**Mode:** Default (interactive)

## Discussion Summary

### Area 1: Format Transformation Strategy

| Question | Options | Selected |
|----------|---------|----------|
| How should format transformation work? | Transform middleware, TransformerService, **Provider-specific adapters** | Provider-specific adapters |
| Transform direction? | **Request + Response**, Request only, You decide | Request + Response transforms |
| Where should adapters live? | **packages/proxy/src/adapters/**, services/transformer.ts, You decide | packages/proxy/src/adapters/ |
| Adapter interface structure? | **Interface-based**, Function-based modules, You decide | Interface-based (ProviderAdapter interface) |

**Decisions captured:** D-15, D-16, D-17, D-18

### Area 2: SSE Streaming Behavior

| Question | Options | Selected |
|----------|---------|----------|
| How to handle different SSE formats? | **Custom SSE handler**, Keep passthrough, You decide | Custom SSE handler |
| Where should SSE transformation happen? | **Adapter transforms SSE**, Separate middleware, You decide | Adapter transforms SSE |
| Timeout strategy? | **120s streaming / 30s non-streaming**, Fixed 60s, You decide | 120s streaming / 30s non-streaming |

**Decisions captured:** D-19, D-20, D-21

### Area 3: Provider Connectivity Validation

| Question | Options | Selected |
|----------|---------|----------|
| When to validate? | Test on save, Startup only, **Both** | Both (on save + startup) |
| Validation method? | **GET /v1/models**, Minimal chat completion, HTTP ping | GET /v1/models (user noted OpenRouter/OpenCode may need POST fallback) |
| Handle unsupported providers? | GET with fallback, **Per-adapter validate**, You decide | Per-adapter validate method |

**Decisions captured:** D-22, D-23, D-24, D-25

### Area 4: Error Response Format

| Question | Options | Selected |
|----------|---------|----------|
| Error format for Claude Code? | **Anthropic-compatible errors**, Simple JSON, Generic proxy errors | Anthropic-compatible errors |
| Where to transform errors? | **Adapter transforms errors**, Central middleware, You decide | Adapter transforms errors |
| Error logging? | **Log internally + user-friendly response**, Generic only, You decide | Log internally + user-friendly response |

**Decisions captured:** D-26, D-27, D-28

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 2-SSE Streaming & Integration*
*Discussion completed: 2026-05-10*
