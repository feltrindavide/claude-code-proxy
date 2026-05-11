---
phase: 2
slug: sse-streaming-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (existing from Phase 1) |
| **Config file** | `packages/proxy/vitest.config.ts` (Phase 1) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PROV-03 | T-02-01 | ProviderAdapter interface has transformRequest, transformResponse, validate, timeouts | unit | `npx vitest run -t "ProviderAdapter"` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | PROV-03 | T-02-02 | Adapter registry returns correct adapter by provider name | unit | `npx vitest run -t "adapter registry"` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | PROX-04 | T-02-03 | OpenRouter adapter transforms request to Anthropic format | unit | `npx vitest run -t "openrouter transform"` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | PROX-04 | T-02-05 | SSE transformer emits Anthropic events from OpenAI stream | unit | `npx vitest run -t "sse transformer"` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | PROX-04 | T-02-06 | OpenCode adapter uses POST /v1/chat/completions with fallback | unit | `npx vitest run -t "opencode adapter"` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | PROX-05 | T-02-07 | Ollama/Custom adapters transform correctly | unit | `npx vitest run -t "ollama\|custom adapter"` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | PROV-03 | T-02-10 | ProviderValidatorService validates connectivity on save | unit | `npx vitest run -t "validate"` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | INTG-03 | T-02-11 | Custom proxy handler intercepts and transforms requests | integration | `npx vitest run -t "proxy handler"` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | PROX-05 | T-02-12 | Error responses are Anthropic-compatible and sanitized | unit | `npx vitest run -t "error"` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `packages/proxy/tests/adapters/interface.test.ts` — ProviderAdapter interface stubs
- [ ] `packages/proxy/tests/adapters/openrouter.test.ts` — OpenRouter adapter tests
- [ ] `packages/proxy/tests/adapters/opencode.test.ts` — OpenCode adapter tests
- [ ] `packages/proxy/tests/adapters/ollama.test.ts` — Ollama adapter tests
- [ ] `packages/proxy/tests/services/sse-transformer.test.ts` — SSE transformation tests
- [ ] `packages/proxy/tests/services/provider-validator.test.ts` — Validation service tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code works transparently through proxy | INTG-03 | Requires real Claude Code CLI + actual provider API keys | 1. Start proxy, 2. Set ANTHROPIC_BASE_URL, 3. Run `claude "hello"`, 4. Verify response streams correctly |
| SSE streaming with real providers | PROX-04 | Requires live API calls to verify streaming behavior | 1. Configure real provider, 2. Send streaming request, 3. Verify tokens arrive in order without truncation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
