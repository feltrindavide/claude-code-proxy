---
phase: 04
slug: model-mapping-ui-routing-log
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (existing in proxy package) |
| **Config file** | `packages/proxy/vitest.config.ts` (existing) |
| **Quick run command** | `npm run test:run --workspace=packages/proxy` |
| **Full suite command** | `npm run test:run --workspace=packages/proxy` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run --workspace=packages/proxy -- --run`
- **After every plan wave:** Run `npm run test:run --workspace=packages/proxy`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | UI-06 | — | Ring buffer caps at 50 entries, drops oldest | unit | `vitest run -t "ring buffer"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | UI-06 | — | Middleware logs request without blocking SSE | integration | `vitest run -t "middleware sse"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | UI-06 | — | Log entry captures all 10 required fields | unit | `vitest run -t "log entry"` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | MAP-04 | T-04-01 | Export masks API keys, never includes actual keys | unit | `vitest run -t "export"` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | MAP-04 | T-04-02 | Import validates against zod schema, rejects invalid | unit | `vitest run -t "import validation"` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | MAP-04 | T-04-02 | Import merge/replace strategies apply correctly | unit | `vitest run -t "import merge"` + `vitest run -t "import replace"` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `packages/proxy/src/services/__tests__/requestLog.test.ts` — covers ring buffer (UI-06)
- [ ] `packages/proxy/src/middleware/__tests__/requestLogger.test.ts` — covers middleware doesn't block SSE (UI-06)
- [ ] `packages/proxy/src/routes/__tests__/admin.exportImport.test.ts` — covers export/import endpoints (MAP-04)
- [ ] `packages/proxy/src/services/__tests__/config.exportImport.test.ts` — covers ConfigService extensions (MAP-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Config export triggers browser download in Tauri webview | MAP-04 | Tauri webview Blob URL behavior needs manual verification | Click Export button → verify JSON file downloads → open file → verify keys are masked |
| JSON diff preview renders correctly with jsondiffpatch | MAP-04 | CSS integration with Tailwind needs visual verification | Import a modified config → verify diff modal shows correct visual diff with Cursor brand colors |
| Routing log table sorts and filters correctly | UI-06 | UI interaction requires manual testing | Add filter by provider → verify table shows only matching entries → click column header → verify sort order changes |
| Auto-backup file created before import | MAP-04 | File system side effect | Import a config → check ~/.claude-code-proxy/ for backup file with timestamp |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
