---
phase: 06
slug: testing-documentation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.59.1 (E2E) + Vitest 4.1.5 (unit, existing) |
| **Config file** | `e2e/playwright.config.ts` (new) |
| **Quick run command** | `npx playwright test --project=chromium --grep "@smoke"` |
| **Full suite command** | `npx playwright test --project=chromium && npm run test:run --workspace=packages/proxy` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --project=chromium --grep "@smoke"`
- **After every plan wave:** Run `npx playwright test --project=chromium && npm run test:run --workspace=packages/proxy`
- **Before `/gsd-verify-work`:** Full E2E + unit suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SC-06-01 | — | E2E verifies proxy routing with OpenRouter | E2E | `npx playwright test tests/01-happy-path.spec.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | SC-06-01 | — | E2E verifies proxy routing with Ollama | E2E | `npx playwright test tests/01-happy-path.spec.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | SC-06-01 | — | E2E verifies proxy routing with Custom provider | E2E | `npx playwright test tests/01-happy-path.spec.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | D-75 | — | E2E covers edge cases (provider unavailable, rate limiting) | E2E | `npx playwright test tests/02-edge-cases.spec.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | SC-06-02 | — | Setup script configures ANTHROPIC_BASE_URL | Integration | `npm run setup -- --dry-run` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | D-81 | — | Setup includes Keychain config, backup import, diagnostic | Integration | `npm run setup -- --test` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | SC-06-03 | — | README documents all features | Manual | Review README.md | ✅ Exists | ⬜ pending |
| 06-03-02 | 03 | 2 | SC-06-04 | — | Configuration schema documented | Manual | Review docs/configuration-reference.md | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/playwright.config.ts` — Playwright configuration with webServer setup
- [ ] `e2e/fixtures.ts` — Global setup/teardown (start proxy, clean config state)
- [ ] `e2e/pages/` — Page Object Models for all UI pages
- [ ] `e2e/tests/` — E2E test files covering all flows
- [ ] `npm install -D @playwright/test playwright` — Framework install
- [ ] `npx playwright install chromium` — Browser binary install
- [ ] `docs/` directory with all documentation files
- [ ] `scripts/setup.ts` — Enhanced setup script
- [ ] Tauri updater plugin added via `npm run tauri add updater`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README completeness | SC-06-03 | Documentation quality is subjective | Review README.md covers all Phase 1-5 features, setup, troubleshooting |
| Configuration reference | SC-06-04 | Documentation accuracy | Review docs/configuration-reference.md matches actual config schema |
| Tauri .dmg build | D-82 | Requires macOS build + signing | Build .dmg via `npm run tauri build`, verify app launches and auto-update configured |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
