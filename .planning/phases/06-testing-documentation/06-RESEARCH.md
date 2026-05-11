# Phase 06: Testing & Documentation - Research

**Researched:** 2026-05-11
**Domain:** E2E testing (Playwright + Tauri), documentation, setup automation, release packaging
**Confidence:** MEDIUM

## Summary

This phase delivers three distinct workstreams: (1) E2E test suite using Playwright to verify the full Tauri + Express + Next.js stack works with each provider type, (2) comprehensive user-facing documentation (README + docs/ directory), and (3) an enhanced setup script that automates Claude Code configuration. The phase also configures Tauri's auto-update plugin and DMG bundle for release packaging.

The key technical challenge is E2E testing a Tauri app — Tauri's official WebDriver support uses Selenium/WebdriverIO with `tauri-driver`, not Playwright directly. Playwright can test the Next.js frontend in browser mode, but testing the full Tauri-native app requires either WebDriver (Selenium) or a Playwright + WebKit approach with `tauri-driver`. Given the locked decision of Playwright (D-74), the recommended approach is: Playwright tests the Next.js frontend against the running Express proxy (dev mode), while Tauri-specific integration is verified via WebDriver or manual smoke tests. A pragmatic alternative is to use Playwright in Chromium mode against `localhost:3000` (the Next.js dev server) with the Express sidecar running — this covers all UI flows and proxy communication without requiring the Tauri binary.

**Primary recommendation:** Playwright in Chromium mode targeting the Next.js dev server + Express sidecar for E2E; Tauri `tauri-driver` + WebdriverIO for native app verification; Node.js-based setup script extending the existing CLI; MDX docs with VitePress or plain Markdown.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| E2E UI testing | Browser / Client | Frontend Server (SSR) | Playwright drives the browser; tests interact with Next.js UI components |
| E2E proxy integration | API / Backend | Browser / Client | Tests verify proxy routes respond correctly; browser triggers requests |
| Setup script | OS / CLI | API / Backend | CLI script writes env vars, config files, Keychain entries |
| Auto-update | Desktop App (Tauri) | CDN / Static | Tauri updater plugin checks remote endpoint, downloads and applies update |
| Documentation | — | — | Static content, no runtime tier |
| DMG packaging | Build / CI | — | Tauri bundle produces .dmg artifact |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-74:** Use Playwright for E2E testing — covers the full stack (Tauri app + Express sidecar + Next.js UI)
- **D-75:** E2E coverage includes all main flows from Phase 1-5: happy path + provider unavailable, rate limiting, retry logic, config export/import
- **D-76:** Test scenarios cover each provider type (OpenRouter, OpenCode Zen/Go, Ollama, Custom)
- **D-77:** Documentation includes README for developers + docs/ directory with architecture, decisions, and API reference
- **D-78:** All documentation in English (standard for the industry, maximum reach)
- **D-79:** docs/ should include: architecture overview, setup guide, configuration reference, troubleshooting, API reference for admin endpoints
- **D-80:** Setup delivered as CLI script (npm script), not Tauri wizard or manual instructions
- **D-81:** Setup script includes: configure ANTHROPIC_BASE_URL, create default config.json, verify provider connections, import config from backup, configure Keychain, generate diagnostic report
- **D-82:** Release package includes: .dmg with app + auto-update integrated + setup script + documentation
- **D-83:** Auto-update is part of the Tauri app (not separate mechanism)

### the agent's Discretion
- Specific Playwright test structure and page object patterns
- Exact docs/ directory structure and file naming
- Setup script implementation language (bash vs Node.js)
- Auto-update mechanism specifics (Tauri updater vs custom)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | 1.59.1 | E2E test framework | Industry standard for web E2E; auto-wait, web-first assertions, trace viewer [VERIFIED: npm registry] |
| `playwright` | 1.59.1 | Browser binaries (Chromium, Firefox, WebKit) | Paired with @playwright/test; required for browser automation [VERIFIED: npm registry] |
| `@tauri-apps/plugin-updater` | 2.10.1 | Tauri auto-update plugin | Official Tauri v2 updater with progress tracking and relaunch [VERIFIED: npm registry] |
| `@tauri-apps/plugin-process` | 2.3.1 | Tauri process control (relaunch) | Required by updater for `relaunch()` after update install [VERIFIED: npm registry] |
| `tauri-driver` | latest (cargo) | WebDriver bridge for Tauri apps | Official Tauri WebDriver testing tool [CITED: v2.tauri.app] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.5 | Unit test runner (existing) | Existing 82 unit tests; run alongside E2E for full coverage [VERIFIED: npm registry] |
| `supertest` | 7.2.2 | HTTP API testing (existing) | Existing admin API route tests; extend for setup script verification [VERIFIED: npm registry] |
| `vitepress` | latest | Documentation site generator | For docs/ directory if a browsable doc site is desired; optional enhancement |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright for Tauri native testing | Selenium + tauri-driver | Tauri officially supports WebDriver via Selenium; Playwright requires browser-mode only |
| Plain Markdown docs | VitePress / Docusaurus | Adds a doc site but increases complexity; plain MD is sufficient for v1 |
| Bash setup script | Node.js setup script | Node.js can reuse existing ConfigService/KeychainService; more maintainable |

**Installation:**
```bash
# E2E testing (root workspace)
npm install -D @playwright/test playwright

# Tauri updater plugin
npm run tauri add updater
npm run tauri add process

# Tauri WebDriver (Rust)
cargo install tauri-driver --locked
```

**Version verification:**
- `@playwright/test` 1.59.1 — published 2026-05 [VERIFIED: npm registry]
- `@tauri-apps/plugin-updater` 2.10.1 — current stable [VERIFIED: npm registry]
- `@tauri-apps/plugin-process` 2.3.1 — current stable [VERIFIED: npm registry]
- `vitest` 4.1.5 — existing dependency [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    E2E Test Execution                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐     ┌──────────────┐     ┌─────────────────┐  │
│  │ Playwright│────▶│ Next.js UI   │────▶│ Express Proxy   │  │
│  │ (Chromium)│     │ (localhost:3k)│     │ (localhost:3456)│  │
│  └──────────┘     └──────────────┘     └────────┬────────┘  │
│                                                  │           │
│                                    ┌─────────────┼───────┐   │
│                                    ▼             ▼       │   │
│                              ┌──────────┐  ┌──────────┐  │   │
│                              │ Provider  │  │ Keychain │  │   │
│                              │ Adapter   │  │ Service  │  │   │
│                              └──────────┘  └──────────┘  │   │
│                                                          │   │
│  ┌──────────────────────────────────────────────────────┐│   │
│  │  Setup Script (npm script)                           ││   │
│  │  ├── ANTHROPIC_BASE_URL → shell profile              ││   │
│  │  ├── config.json → ~/.claude-code-proxy/             ││   │
│  │  ├── Provider verification → /admin/validate         ││   │
│  │  ├── Keychain config → keytar                        ││   │
│  │  ├── Backup import → config import                   ││   │
│  │  └── Diagnostic report → stdout                      ││   │
│  └──────────────────────────────────────────────────────┘│   │
│                                                          │   │
│  ┌──────────────────────────────────────────────────────┐│   │
│  │  Tauri Auto-Update                                   ││   │
│  │  ├── check() → remote endpoint                       ││   │
│  │  ├── downloadAndInstall() → progress tracking        ││   │
│  │  └── relaunch() → apply update                       ││   │
│  └──────────────────────────────────────────────────────┘│   │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
e2e/                          # Playwright E2E tests (NEW)
├── playwright.config.ts      # Playwright configuration
├── fixtures.ts               # Global setup/teardown (start proxy, clean state)
├── pages/                    # Page Object Models
│   ├── StatusPage.ts         # Status page interactions
│   ├── ProviderForm.ts       # Provider add/edit form
│   ├── ModelMappingPage.ts   # Model mapping configuration
│   ├── RoutingLogPage.ts     # Request routing log
│   └── SettingsPage.ts       # Settings + export/import
├── tests/
│   ├── 01-happy-path.spec.ts     # Full flow: setup → configure → route
│   ├── 02-provider-types.spec.ts # Each provider type (OpenRouter, OpenCode, Ollama, Custom)
│   ├── 03-edge-cases.spec.ts     # Provider unavailable, rate limiting, retry
│   └── 04-config-export.spec.ts  # Export/import config flow
└── utils/
    └── test-helpers.ts       # Shared test utilities

docs/                         # User documentation (NEW)
├── architecture.md           # System architecture overview
├── setup-guide.md            # Step-by-step setup instructions
├── configuration-reference.md # config.json schema, all options
├── troubleshooting.md        # Common issues and solutions
└── api-reference.md          # Admin API endpoint reference

scripts/                      # Setup and utility scripts (NEW)
└── setup.ts                  # Enhanced setup script (D-80, D-81)

src-tauri/
├── capabilities/
│   └── default.json          # Add updater:default permission
├── tauri.conf.json           # Add updater plugin config + bundle settings
└── Cargo.toml                # Add tauri-plugin-updater, tauri-plugin-process
```

### Pattern 1: Playwright Page Object Model
**What:** Encapsulate UI interactions in reusable page classes
**When to use:** All E2E tests — keeps tests readable and maintainable
**Example:**
```typescript
// Source: https://github.com/microsoft/playwright/blob/main/docs/src/pom.md
import { expect, type Locator, type Page } from '@playwright/test';

export class ProviderFormPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly baseUrlInput: Locator;
  readonly apiKeyInput: Locator;
  readonly testButton: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByLabel('Provider name');
    this.baseUrlInput = page.getByLabel('Base URL');
    this.apiKeyInput = page.getByLabel('API Key');
    this.testButton = page.getByRole('button', { name: 'Test Connection' });
    this.saveButton = page.getByRole('button', { name: 'Save' });
  }

  async fillProvider(name: string, baseUrl: string, apiKey: string) {
    await this.nameInput.fill(name);
    await this.baseUrlInput.fill(baseUrl);
    await this.apiKeyInput.fill(apiKey);
  }

  async testConnection() {
    await this.testButton.click();
    await expect(page.getByText('Connection successful')).toBeVisible();
  }
}
```

### Pattern 2: Playwright Global Setup/Teardown
**What:** Start Express proxy before tests, clean state after
**When to use:** E2E tests requiring a running backend
**Example:**
```typescript
// Source: https://github.com/microsoft/playwright/blob/main/docs/src/test-global-setup-teardown-js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: require.resolve('./fixtures'),
  globalTeardown: require.resolve('./fixtures'),
  timeout: 60000, // E2E tests need longer timeouts
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
});
```

### Anti-Patterns to Avoid
- **Testing Tauri binary with Playwright directly:** Playwright drives browsers, not native apps. Use browser-mode against the dev server for UI flows, or WebDriver for native app testing.
- **Mocking the proxy in E2E tests:** The whole point is to verify the real proxy works. Mock only external providers (use a test HTTP server).
- **Coupling tests to implementation details:** Test user-visible behavior, not internal state. Use `getByRole` and `getByText` over CSS selectors.
- **Skipping cleanup between tests:** Each test must start from a clean config state. Use global teardown to reset `~/.claude-code-proxy/`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| E2E test framework | Custom browser automation | Playwright | Auto-wait, web-first assertions, trace viewer, parallel execution |
| Page object pattern | Inline selectors in tests | Playwright Page Object Model | Centralized locators, reusable interactions |
| Test HTTP server for mocking providers | Custom mock server | `vitest` mock handlers or `msw` | Proper HTTP mock with request matching |
| Auto-update mechanism | Custom updater with download/verify/install | `@tauri-apps/plugin-updater` | Code signing verification, progress tracking, rollback, cross-platform |
| Documentation site | Custom HTML generator | Markdown + VitePress (optional) | Search, navigation, versioning out of the box |
| Config validation in setup script | Manual JSON parsing | Reuse existing `ConfigService` zod schemas | Single source of truth for config validation |

**Key insight:** Tauri's updater plugin handles the hardest parts of auto-update — cryptographic signature verification, atomic install, and safe relaunch. Building this custom would introduce security risks and platform-specific bugs.

## Common Pitfalls

### Pitfall 1: Playwright Cannot Drive Tauri's WebKit WebView
**What goes wrong:** Playwright's WebKit browser is not the same as Tauri's WKWebView on macOS. Tests passing in Playwright WebKit may fail in the actual Tauri app.
**Why it happens:** Tauri uses the platform's native WebView (WKWebView on macOS), while Playwright ships its own WebKit build.
**How to avoid:** Use Playwright in Chromium mode for UI flow testing (closest to dev experience). For native WebView verification, use `tauri-driver` + Selenium/WebdriverIO as a secondary test suite.
**Warning signs:** CSS or JS behavior differs between Playwright tests and the actual Tauri app.

### Pitfall 2: E2E Tests Leave Residual Config State
**What goes wrong:** Tests that modify `~/.claude-code-proxy/config.json` or Keychain entries persist between test runs, causing flaky tests.
**Why it happens:** ConfigService writes to the user's home directory; Keychain entries are persistent.
**How to avoid:** Use a custom config path in tests (pass `configPath` to ConfigService constructor). Clean up Keychain entries in global teardown. Set `CONFIG_DIR` env var for test isolation.
**Warning signs:** Tests pass individually but fail when run in sequence or parallel.

### Pitfall 3: Tauri Updater Requires Code Signing
**What goes wrong:** Auto-update fails silently or rejects unsigned builds.
**Why it happens:** Tauri's updater verifies the Ed25519 signature of update artifacts. Without signing, updates are rejected.
**How to avoid:** Generate signing keys with `tauri signer generate`. Store private key securely. Configure `pubkey` in `tauri.conf.json`. For development, use `--debug` builds with relaxed verification.
**Warning signs:** `check()` returns null even when updates are available.

### Pitfall 4: Setup Script Fails on Non-Zsh Shells
**What goes wrong:** Existing setup script only handles zsh/bash. Users with fish or other shells get no configuration.
**Why it happens:** Shell detection logic is incomplete.
**How to avoid:** Detect shell from `$SHELL`, support fish (`~/.config/fish/config.fish`), and provide a fallback that outputs the export command for manual configuration.
**Warning signs:** Setup succeeds but `echo $ANTHROPIC_BASE_URL` returns empty.

### Pitfall 5: Playwright Tests Race with Express Startup
**What goes wrong:** E2E tests start before the Express proxy is ready, causing connection refused errors.
**Why it happens:** Express takes time to load config, validate providers, and bind to port 3456.
**How to avoid:** In global setup, poll `http://localhost:3456/health` until 200 response before starting Playwright tests. Use a retry loop with exponential backoff.
**Warning signs:** First test in suite always fails, subsequent tests pass.

## Code Examples

### Playwright Config for This Project
```typescript
// e2e/playwright.config.ts
// Source: https://github.com/microsoft/playwright/blob/main/docs/src/test-configuration-js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // E2E tests share state (proxy), run sequentially
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start Express proxy + Next.js dev server before tests
  webServer: [
    {
      command: 'cd packages/proxy && npx tsx src/index.ts',
      url: 'http://localhost:3456/health',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev --workspace=apps/web',
      url: 'http://localhost:3000',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

### Tauri Updater Integration in Frontend
```typescript
// apps/web/src/services/updater.ts
// Source: https://context7.com/tauri-apps/tauri-docs/llms.txt
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkForUpdates(): Promise<{ available: boolean; version?: string }> {
  const update = await check();
  if (update) {
    console.log(`Update available: ${update.version}`);
    
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          console.log(`Downloading ${event.data.contentLength} bytes...`);
          break;
        case 'Progress':
          // Track progress for UI
          break;
        case 'Finished':
          console.log('Download complete!');
          break;
      }
    });
    
    await relaunch();
    return { available: true, version: update.version };
  }
  return { available: false };
}
```

### Tauri Configuration for Updater + DMG
```json
// src-tauri/tauri.conf.json (additions)
{
  "bundle": {
    "active": true,
    "targets": ["dmg"],
    "createUpdaterArtifacts": true,
    "macOS": {
      "dmg": {
        "appPosition": { "x": 180, "y": 170 },
        "applicationFolderPosition": { "x": 480, "y": 170 },
        "windowSize": { "height": 400, "width": 660 }
      }
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "<public-key-from-tauri-signer-generate>",
      "endpoints": [
        "https://github.com/<owner>/<repo>/re/latest/download"
      ]
    }
  }
}
```

### Enhanced Setup Script Structure (Node.js)
```typescript
// scripts/setup.ts — recommended approach
// Reuses existing ConfigService, KeychainService from packages/proxy

import { Command } from 'commander';
import { configService } from '../packages/proxy/src/services/config.js';
import { keychainService } from '../packages/proxy/src/services/keychain.js';
import { providerValidatorService } from '../packages/proxy/src/services/provider-validator.js';

async function setup() {
  // 1. Configure ANTHROPIC_BASE_URL (existing logic from packages/cli)
  // 2. Create default config.json via configService.save(configService.getDefaults())
  // 3. Verify provider connections via providerValidatorService.validateAllProviders()
  // 4. Import config from backup (interactive: ask for backup file path)
  // 5. Configure Keychain (interactive: prompt for API keys, store via keychainService)
  // 6. Generate diagnostic report (health check, config summary, Keychain status)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Selenium WebDriver for web E2E | Playwright with auto-wait and trace viewer | 2021+ | Faster, more reliable tests with better debugging |
| Manual Tauri update checks | `@tauri-apps/plugin-updater` with progress tracking | Tauri v2 | Built-in signature verification, atomic installs |
| Bash-only setup scripts | Node.js scripts reusing application services | Ongoing | Shared validation logic, better error handling |
| Hand-written docs | Markdown + static site generators (VitePress) | Ongoing | Searchable, navigable documentation |

**Deprecated/outdated:**
- Tauri v1 updater API: Replaced by v2 plugin system with `check()`/`downloadAndInstall()` pattern
- `tauri.conf.json` `tauri.updater` key: Now under `plugins.updater` in Tauri v2
- `createUpdaterArtifacts: "v1Compatible"`: Use `true` for new projects (v1Compatible is migration-only)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Playwright cannot directly drive Tauri's WKWebView — requires browser-mode against dev server or WebDriver for native testing | Summary, Pitfall 1 | If Playwright gains native Tauri support, E2E approach could be simplified |
| A2 | Node.js setup script is preferable to bash for reusing ConfigService/KeychainService | Don't Hand-Roll, Code Examples | If the team prefers bash, setup script must duplicate validation logic |
| A3 | GitHub Releases is the intended update endpoint for Tauri updater | Code Examples (tauri.conf.json) | If using a different CDN, endpoint URL changes but mechanism stays the same |
| A4 | The existing `packages/cli` setup command is the baseline to extend (D-81 adds Keychain config, backup import, diagnostics) | Setup Script Structure | If CLI is being replaced rather than extended, more work is needed |

## Open Questions (RESOLVED)

1. **Should E2E tests run against the Tauri binary or the dev server?** — **(RESOLVED)**
   - What we know: Playwright drives browsers, not native apps. Tauri officially supports WebDriver via Selenium.
   - What's unclear: Whether the team wants native app testing (slower, requires build) or is satisfied with dev server testing (faster, covers UI + proxy).
   - **Resolution:** Use Playwright against dev server for primary E2E suite. Faster iteration, covers all UI flows and proxy communication. Native app verification deferred to manual testing during release.

2. **What update server should the Tauri updater use?** — **(RESOLVED)**
   - What we know: Tauri updater needs HTTPS endpoints returning update artifacts.
   - What's unclear: Whether releases will be on GitHub Releases, a custom CDN, or CrabNebula Cloud.
   - **Resolution:** Default to GitHub Releases (simplest for v1). Endpoint configurable via `tauri.conf.json` `pubkey` and `endpoints` fields. Plans use GitHub Releases as the update server.

3. **Should the setup script be interactive or non-interactive?** — **(RESOLVED)**
   - What we know: D-81 lists 6 features including Keychain config (requires API key input) and backup import (requires file path).
   - What's unclear: Whether these should be interactive prompts or flag-driven.
   - **Resolution:** Interactive by default with `--non-interactive` flag for CI/automation. Interactive mode uses readline prompts; non-interactive mode reads from environment variables or config file.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts, tests, proxy | ✓ | Check with `node --version` | — |
| npm | Package management | ✓ | Check with `npm --version` | — |
| Playwright browsers | E2E tests | ✗ (not installed) | — | `npx playwright install` after package install |
| `tauri-driver` (cargo) | Native Tauri WebDriver tests | ✗ (not installed) | — | Skip native tests, use browser-mode only |
| Rust/Cargo | Tauri build + updater plugin | Check with `cargo --version` | — | Required for Tauri builds |
| macOS Keychain | Keychain setup script feature | ✓ (macOS only) | — | N/A — macOS-only app |
| `tauri` CLI | Build DMG, add plugins | ✓ (in devDependencies) | 2.x | — |

**Missing dependencies with fallback:**
- Playwright browsers — install with `npx playwright install` (Chromium sufficient for primary tests)
- `tauri-driver` — optional; skip native WebView tests if not installed, use browser-mode E2E instead

**Missing dependencies with no fallback:**
- Rust/Cargo — required for Tauri builds and DMG packaging. Must be installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.59.1 (E2E) + Vitest 4.1.5 (unit, existing) |
| Config file | `e2e/playwright.config.ts` (new) |
| Quick run command | `npx playwright test --project=chromium --grep "@smoke"` |
| Full suite command | `npx playwright test --project=chromium` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-06-01 | E2E verifies Claude Code works through proxy with each provider type | E2E | `npx playwright test tests/02-provider-types.spec.ts` | ❌ Wave 0 |
| SC-06-02 | Setup script configures ANTHROPIC_BASE_URL, creates default config, verifies providers | Integration | `npm run setup -- --dry-run` | ❌ Wave 0 |
| SC-06-03 | README documents all features and troubleshooting | Manual | Review README.md | ✅ Exists, needs update |
| SC-06-04 | Configuration schema documented for advanced users | Manual | Review docs/configuration-reference.md | ❌ Wave 0 |
| D-75 | E2E covers happy path + edge cases (provider unavailable, rate limiting, retry, export/import) | E2E | `npx playwright test` | ❌ Wave 0 |
| D-76 | Test each provider type (OpenRouter, OpenCode, Ollama, Custom) | E2E | `npx playwright test tests/02-provider-types.spec.ts` | ❌ Wave 0 |
| D-81 | Setup includes Keychain config, backup import, diagnostic report | Integration | `npm run setup -- --test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test --project=chromium --grep "@smoke"` (quick smoke tests)
- **Per wave merge:** `npx playwright test --project=chromium && npm run test:run --workspace=packages/proxy` (full E2E + unit)
- **Phase gate:** Full E2E suite green + unit tests green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/playwright.config.ts` — Playwright configuration with webServer setup
- [ ] `e2e/fixtures.ts` — Global setup/teardown (start proxy, clean config state)
- [ ] `e2e/pages/` — Page Object Models for all UI pages
- [ ] `e2e/tests/` — E2E test files covering all flows
- [ ] `npm install -D @playwright/test playwright` — Framework install
- [ ] `npx playwright install chromium` — Browser binary install
- [ ] `docs/` directory with all documentation files
- [ ] `scripts/setup.ts` — Enhanced setup script
- [ ] Tauri updater plugin added via `npm run tauri add updater`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — no user auth, only API key storage |
| V3 Session Management | No | N/A — no sessions |
| V4 Access Control | No | N/A — localhost-only admin API |
| V5 Input Validation | Yes | Zod schemas in ConfigService (existing) |
| V6 Cryptography | Yes | Ed25519 for Tauri updater artifact signing |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure in E2E test fixtures | Information Disclosure | Use mock/test keys only; never real keys in tests |
| Unsigned Tauri update artifacts | Tampering | Ed25519 signing via `tauri signer`; verify pubkey in config |
| Setup script writes to shell profile | Spoofing | Validate target file path; don't overwrite existing ANTHROPIC_BASE_URL |
| Keychain entries left after test cleanup | Information Disclosure | Global teardown must delete test Keychain entries |
| Config file permissions too open | Information Disclosure | ConfigService already uses `mode: 0o600` for file writes |

## Sources

### Primary (HIGH confidence)
- `/microsoft/playwright` (Context7) — Playwright POM pattern, config, fixtures, parallel execution
- `/tauri-apps/tauri-docs` (Context7) — Tauri updater plugin, DMG bundle, configuration
- https://v2.tauri.app/develop/tests/webdriver/ — Tauri WebDriver testing documentation
- https://github.com/microsoft/playwright/blob/main/docs/src/pom.md — Page Object Model pattern
- https://github.com/microsoft/playwright/blob/main/docs/src/test-global-setup-teardown-js — Global setup/teardown

### Secondary (MEDIUM confidence)
- npm registry — Package versions verified at research time
- https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/plugin/updater.mdx — Updater plugin details
- https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/distribute/dmg.mdx — DMG bundle guide

### Tertiary (LOW confidence)
- Playwright + Tauri integration patterns — No official Playwright-Tauri integration guide found; approach inferred from Tauri WebDriver docs and Playwright webServer capability

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All packages verified against npm registry and Context7 docs
- Architecture: MEDIUM — Playwright + Tauri integration pattern inferred, not officially documented
- Pitfalls: MEDIUM — Based on Tauri docs + Playwright docs, some inferred from architecture

**Research date:** 2026-05-11
**Valid until:** 30 days (stable technologies — Playwright and Tauri v2 are mature)
