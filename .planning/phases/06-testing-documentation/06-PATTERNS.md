# Phase 06: Testing & Documentation - Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 23
**Analogs found:** 18 / 23

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `e2e/playwright.config.ts` | config | request-response | `packages/proxy/vitest.config.ts` | role-match |
| `e2e/fixtures.ts` | utility | request-response | `packages/proxy/tests/routes/admin.test.ts` | partial |
| `e2e/pages/StatusPage.ts` | test (page object) | request-response | `apps/web/src/components/StatusPage.tsx` | role-match |
| `e2e/pages/ProviderForm.ts` | test (page object) | request-response | `apps/web/src/components/ProviderForm.tsx` | role-match |
| `e2e/pages/ModelMappingPage.ts` | test (page object) | request-response | `apps/web/src/components/ModelMappingForm.tsx` | role-match |
| `e2e/pages/RoutingLogPage.ts` | test (page object) | request-response | `apps/web/src/components/RoutingLogTable.tsx` | role-match |
| `e2e/pages/SettingsPage.ts` | test (page object) | request-response | `apps/web/src/components/SettingsForm.tsx` | role-match |
| `e2e/tests/01-happy-path.spec.ts` | test (E2E) | request-response | `packages/proxy/tests/routes/admin.test.ts` | role-match |
| `e2e/tests/02-provider-types.spec.ts` | test (E2E) | request-response | `packages/proxy/tests/services/provider.test.ts` | role-match |
| `e2e/tests/03-edge-cases.spec.ts` | test (E2E) | request-response | `packages/proxy/tests/services/rateLimiter.test.ts` | role-match |
| `e2e/tests/04-config-export.spec.ts` | test (E2E) | request-response | `packages/proxy/tests/services/config.exportImport.test.ts` | role-match |
| `e2e/utils/test-helpers.ts` | utility | request-response | `packages/cli/src/index.ts` | partial |
| `docs/architecture.md` | documentation | — | `README.md` | role-match |
| `docs/setup-guide.md` | documentation | — | `packages/cli/src/index.ts` (setup command) | role-match |
| `docs/configuration-reference.md` | documentation | — | `packages/proxy/src/services/config.ts` | role-match |
| `docs/troubleshooting.md` | documentation | — | `README.md` (troubleshooting section) | role-match |
| `docs/api-reference.md` | documentation | — | `packages/proxy/src/routes/admin.ts` | role-match |
| `scripts/setup.ts` | service (CLI) | request-response | `packages/cli/src/index.ts` | exact |
| `src-tauri/tauri.conf.json` | config | — | `src-tauri/tauri.conf.json` (self) | exact |
| `src-tauri/capabilities/default.json` | config | — | `src-tauri/capabilities/default.json` (self) | exact |
| `src-tauri/Cargo.toml` | config | — | `src-tauri/Cargo.toml` (self) | exact |
| `README.md` | documentation | — | `README.md` (self) | exact |
| `package.json` | config | — | `package.json` (self) | exact |

## Pattern Assignments

### `e2e/playwright.config.ts` (config, request-response)

**Analog:** `packages/proxy/vitest.config.ts`

**Config pattern** (lines 1-13):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

**Playwright config pattern** (from RESEARCH.md):
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
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

---

### `e2e/fixtures.ts` (utility, request-response)

**Analog:** `packages/proxy/tests/routes/admin.test.ts` (lines 1-23)

**Test setup pattern** (lines 9-23):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('Admin API', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { default: adminRouter } = await import('../../src/routes/admin.js');
    app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);
  });
```

**Fixtures pattern** (global setup/teardown for Playwright):
```typescript
// Global setup: start Express proxy, clean config state
export default async function globalSetup() {
  // Set test config path to isolated directory
  process.env.CONFIG_DIR = '/tmp/claude-proxy-e2e-test';
  
  // Poll health endpoint until ready
  const url = 'http://localhost:3456/health';
  // ... retry loop until 200
}

// Global teardown: clean up test config and Keychain entries
export default async function globalTeardown() {
  // Delete test config directory
  // Clean up test Keychain entries
}
```

---

### `e2e/pages/StatusPage.ts` (test page object, request-response)

**Analog:** `apps/web/src/components/StatusPage.tsx`

**Component structure** (reference for selectors):
- Status page with health card
- Provider status indicators
- Health check results

**Page Object pattern** (from RESEARCH.md):
```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class StatusPagePage {
  readonly page: Page;
  readonly healthCard: Locator;
  readonly providerStatusList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.healthCard = page.getByRole('region', { name: /health/i });
    this.providerStatusList = page.getByRole('list', { name: /providers/i });
  }

  async goto() {
    await this.page.goto('/');
  }

  async waitForStatusReady() {
    await expect(this.healthCard).toBeVisible();
  }
}
```

---

### `e2e/pages/ProviderForm.ts` (test page object, request-response)

**Analog:** `apps/web/src/components/ProviderForm.tsx`

**Component structure** (lines 1-185):
```tsx
// Key form fields to target in E2E:
// - Name input
// - Base URL input
// - API Key input (password type)
// - Provider Type select (OpenRouter, OpenCode, Ollama, Custom)
// - Enabled checkbox
// - Priority number input
// - Test Connection button
// - Save Provider button
// - Cancel button
```

**Page Object pattern** (from RESEARCH.md, adapted to actual component):
```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class ProviderFormPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly baseUrlInput: Locator;
  readonly apiKeyInput: Locator;
  readonly providerTypeSelect: Locator;
  readonly testButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByLabel('Name');
    this.baseUrlInput = page.getByLabel('Base URL');
    this.apiKeyInput = page.getByLabel('API Key');
    this.providerTypeSelect = page.getByRole('combobox', { name: /provider type/i });
    this.testButton = page.getByRole('button', { name: 'Test Connection' });
    this.saveButton = page.getByRole('button', { name: 'Save Provider' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
  }

  async fillProvider(name: string, baseUrl: string, apiKey: string, type: string = 'OpenRouter') {
    await this.nameInput.fill(name);
    await this.baseUrlInput.fill(baseUrl);
    await this.apiKeyInput.fill(apiKey);
    await this.providerTypeSelect.selectOption(type);
  }

  async testConnection() {
    await this.testButton.click();
  }

  async save() {
    await this.saveButton.click();
  }
}
```

---

### `e2e/pages/ModelMappingPage.ts` (test page object, request-response)

**Analog:** `apps/web/src/components/ModelMappingForm.tsx`

**Page Object pattern:**
```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class ModelMappingPagePage {
  readonly page: Page;
  readonly mappingTable: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.mappingTable = page.getByRole('table', { name: /model mappings/i });
    this.saveButton = page.getByRole('button', { name: /save.*mapping/i });
  }

  async updateMapping(tier: string, provider: string, model: string) {
    // Find row by tier, update provider and model
  }
}
```

---

### `e2e/pages/RoutingLogPage.ts` (test page object, request-response)

**Analog:** `apps/web/src/components/RoutingLogTable.tsx`

**Page Object pattern:**
```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class RoutingLogPagePage {
  readonly page: Page;
  readonly logTable: Locator;
  readonly clearButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logTable = page.getByRole('table', { name: /routing log/i });
    this.clearButton = page.getByRole('button', { name: /clear log/i });
  }

  async waitForLogEntry(model: string) {
    await expect(this.logTable.getByText(model)).toBeVisible();
  }
}
```

---

### `e2e/pages/SettingsPage.ts` (test page object, request-response)

**Analog:** `apps/web/src/components/SettingsForm.tsx` + `apps/web/src/components/ConfigExportImport.tsx`

**Page Object pattern:**
```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class SettingsPagePage {
  readonly page: Page;
  readonly exportButton: Locator;
  readonly importButton: Locator;
  readonly importFileInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.exportButton = page.getByRole('button', { name: /export/i });
    this.importButton = page.getByRole('button', { name: /import/i });
    this.importFileInput = page.locator('input[type="file"]');
  }

  async exportConfig(): Promise<string> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.exportButton.click(),
    ]);
    return download.path();
  }

  async importConfig(filePath: string) {
    await this.importFileInput.setInputFiles(filePath);
  }
}
```

---

### `e2e/tests/01-happy-path.spec.ts` (test E2E, request-response)

**Analog:** `packages/proxy/tests/routes/admin.test.ts` (lines 1-76)

**Test structure pattern** (lines 1-76):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('Admin API', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { default: adminRouter } = await import('../../src/routes/admin.js');
    app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);
  });

  describe('GET /admin/config', () => {
    it('should return current config', async () => {
      const response = await request(app).get('/admin/config');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('providers');
    });
  });
});
```

**Playwright E2E pattern** (adapted):
```typescript
import { test, expect } from '@playwright/test';
import { StatusPagePage } from '../pages/StatusPage';
import { ProviderFormPage } from '../pages/ProviderForm';

test.describe('Happy Path', () => {
  test('full flow: setup → configure provider → route request', async ({ page }) => {
    const statusPage = new StatusPagePage(page);
    const providerForm = new ProviderFormPage(page);

    // 1. Navigate to app
    await statusPage.goto();
    await statusPage.waitForStatusReady();

    // 2. Add a provider
    await providerForm.fillProvider('test-provider', 'https://api.test.com/v1', 'test-key-12345');
    await providerForm.testConnection();
    await expect(page.getByText('Connection successful')).toBeVisible();
    await providerForm.save();

    // 3. Verify provider appears in status
    await statusPage.goto();
    await expect(statusPage.providerStatusList).toContainText('test-provider');
  });
});
```

---

### `e2e/tests/02-provider-types.spec.ts` (test E2E, request-response)

**Analog:** `packages/proxy/tests/services/provider.test.ts`

**Provider test pattern** (reference for test structure):
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ProviderService', () => {
  describe('registerProvider()', () => {
    it('should register a provider', () => {
      // ...
    });
  });
});
```

**Playwright E2E pattern** (per D-76, each provider type):
```typescript
import { test, expect } from '@playwright/test';
import { ProviderFormPage } from '../pages/ProviderForm';

test.describe('Provider Types', () => {
  const providerTypes = [
    { name: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', type: 'OpenRouter' },
    { name: 'opencode', baseUrl: 'https://api.opencode.ai/v1', type: 'OpenCode' },
    { name: 'ollama', baseUrl: 'http://localhost:11434', type: 'Ollama' },
    { name: 'custom', baseUrl: 'https://api.custom-ai.com/v1', type: 'Custom' },
  ];

  for (const provider of providerTypes) {
    test(`should configure ${provider.name} provider`, async ({ page }) => {
      const form = new ProviderFormPage(page);
      await form.goto();
      await form.fillProvider(provider.name, provider.baseUrl, 'test-key', provider.type);
      await form.save();
      await expect(page.getByText(provider.name)).toBeVisible();
    });
  }
});
```

---

### `e2e/tests/03-edge-cases.spec.ts` (test E2E, request-response)

**Analog:** `packages/proxy/tests/services/rateLimiter.test.ts`

**Edge case test pattern** (reference for structure):
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('RateLimiter', () => {
  it('should block requests after limit exceeded', () => {
    // ...
  });
});
```

**Playwright E2E pattern** (per D-75):
```typescript
import { test, expect } from '@playwright/test';

test.describe('Edge Cases', () => {
  test('should handle provider unavailable', async ({ page }) => {
    // Configure provider with invalid URL
    // Verify error message displayed
  });

  test('should display rate limiting warning', async ({ page }) => {
    // Trigger rate limiting
    // Verify toast warning
  });

  test('should retry failed requests', async ({ page }) => {
    // Configure retry scenario
    // Verify retry log entry
  });
});
```

---

### `e2e/tests/04-config-export.spec.ts` (test E2E, request-response)

**Analog:** `packages/proxy/tests/services/config.exportImport.test.ts`

**Export/Import test pattern** (reference):
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ConfigService export/import', () => {
  it('should export config with masked keys', () => {
    // ...
  });

  it('should import and merge config', () => {
    // ...
  });
});
```

**Playwright E2E pattern:**
```typescript
import { test, expect } from '@playwright/test';
import { SettingsPagePage } from '../pages/SettingsPage';

test.describe('Config Export/Import', () => {
  test('should export and re-import config', async ({ page }) => {
    const settings = new SettingsPagePage(page);
    await settings.goto();
    
    // Export config
    const exportPath = await settings.exportConfig();
    expect(exportPath).toBeDefined();
    
    // Clear config
    // ... clear operation
    
    // Import config
    await settings.importConfig(exportPath);
    // Verify config restored
  });
});
```

---

### `e2e/utils/test-helpers.ts` (utility, request-response)

**Analog:** `packages/cli/src/index.ts` (lines 1-86 for shell/config helpers)

**Helper pattern** (lines 22-36):
```typescript
function getProxyPackageRoot(): string {
  const monoRoot = resolve(__dirname, '..', '..');
  return join(monoRoot, 'packages', 'proxy');
}

function getProxyPackageJson(): { name: string; version: string } | null {
  try {
    const pkgPath = join(getProxyPackageRoot(), 'package.json');
    if (!existsSync(pkgPath)) return null;
    return JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}
```

**Test helpers pattern:**
```typescript
import { join } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';

export const TEST_CONFIG_DIR = '/tmp/claude-proxy-e2e-test';

export function cleanTestConfig() {
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_CONFIG_DIR, { recursive: true });
}

export function pollHealthEndpoint(url: string, timeout = 30_000): Promise<void> {
  // Retry until 200 or timeout
}

export function getTestProvider(name: string) {
  return {
    name,
    baseUrl: 'https://api.test.com/v1',
    apiKey: 'test-key-12345',
  };
}
```

---

### `scripts/setup.ts` (service/CLI, request-response)

**Analog:** `packages/cli/src/index.ts` (lines 1-265)

**CLI pattern** (lines 1-16, 39-86, 237-265):
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

// Command structure pattern
const program = new Command();
program
  .name('claude-code-proxy')
  .description('Claude Code proxy setup and management CLI')
  .version('0.1.0');

program
  .command('setup')
  .description('...')
  .action(runSetup);
```

**Setup command pattern** (lines 42-86):
```typescript
async function runSetup(): Promise<void> {
  const shell = process.env.SHELL || '';
  const isZsh = shell.endsWith('zsh') || shell.includes('zsh');
  const isBash = shell.endsWith('bash') || shell.includes('bash');

  let profilePath: string;
  if (isZsh) {
    profilePath = join(homedir(), '.zshenv');
  } else if (isBash) {
    profilePath = join(homedir(), '.bashrc');
  } else {
    profilePath = join(homedir(), '.zshenv');
  }

  const exportLine = 'export ANTHROPIC_BASE_URL="http://localhost:3456"';
  // ... check if already set, write if not
}
```

**Enhanced setup script structure** (per D-81):
```typescript
import { Command } from 'commander';
import { configService } from '../packages/proxy/src/services/config.js';
import { keychainService } from '../packages/proxy/src/services/keychain.js';
import { providerValidatorService } from '../packages/proxy/src/services/provider-validator.js';

async function runEnhancedSetup(options: { dryRun?: boolean; import?: string }): Promise<void> {
  // 1. Configure ANTHROPIC_BASE_URL (existing logic from packages/cli)
  // 2. Create default config.json via configService.save(configService.getDefaults())
  // 3. Verify provider connections via providerValidatorService.validateAllProviders()
  // 4. Import config from backup (if --import flag provided)
  // 5. Configure Keychain (interactive: prompt for API keys, store via keychainService)
  // 6. Generate diagnostic report (health check, config summary, Keychain status)
}
```

---

### `docs/architecture.md` (documentation)

**Analog:** `README.md` (lines 38-46)

**Architecture section pattern** (lines 38-46):
```markdown
## Architecture

Claude Code CLI → localhost:3456 → Provider
                         ↑
                   Admin API (/admin)

Per D-01: Express.js sidecar on port 3456
Per D-13: Config at ~/.claude-code-proxy/config.json
```

**Full architecture doc structure:**
```markdown
# Architecture Overview

## System Components
- Express Proxy (port 3456)
- Next.js Admin UI (port 3000)
- Tauri Desktop Wrapper
- macOS Keychain (API key storage)

## Data Flow
1. Claude Code → ANTHROPIC_BASE_URL → localhost:3456
2. Proxy routes to configured provider (OpenRouter, OpenCode, Ollama, Custom)
3. Admin UI manages providers and routes via /admin API

## Configuration
- Config file: ~/.claude-code-proxy/config.json
- API keys: macOS Keychain (service: claude-code-proxy)
- Shell env: ANTHROPIC_BASE_URL=http://localhost:3456
```

---

### `docs/setup-guide.md` (documentation)

**Analog:** `README.md` (lines 5-21) + `packages/cli/src/index.ts` (setup command)

**Quick Start pattern** (lines 5-21):
```markdown
## Quick Start

1. Install dependencies
2. Start the proxy server
3. Configure Claude Code
4. Verify setup
```

**Setup guide structure:**
```markdown
# Setup Guide

## Prerequisites
- Node.js 18+
- macOS (Keychain required)
- Claude Code installed

## Step 1: Install
## Step 2: Run Setup Script
## Step 3: Configure Providers
## Step 4: Verify
## Step 5: Start Using Claude Code
```

---

### `docs/configuration-reference.md` (documentation)

**Analog:** `packages/proxy/src/services/config.ts` (lines 20-64)

**Config schema pattern** (lines 20-64):
```typescript
// Provider name: alphanumeric, dash, underscore only
const providerNameSchema = z.string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Provider name must be alphanumeric with dashes/underscores');

// URL schema: https required, localhost allowed
const urlSchema = z.string()
  .url()
  .refine(
    (url) => url.startsWith('https://') || url.includes('localhost') || url.includes('127.0.0.1'),
    'URL must be HTTPS or localhost'
  );
```

**Configuration reference structure:**
```markdown
# Configuration Reference

## config.json Schema
### providers[]
- name (string): Provider identifier
- baseUrl (string): API endpoint URL
- keyId (string): Keychain account name
- models (string[]): Available models
- enabled (boolean): Whether provider is active
- priority (number): 0-100 routing priority

### routes[]
- claudeTier (enum): opus | sonnet | haiku
- providerName (string): Target provider
- targetModel (string): Model to route to
```

---

### `docs/troubleshooting.md` (documentation)

**Analog:** `README.md` (lines 99-126)

**Troubleshooting pattern** (lines 99-126):
```markdown
## Troubleshooting

**Proxy not running:**
npx claude-code-proxy start

**Claude Code not connecting:**
echo $ANTHROPIC_BASE_URL
npx claude-code-proxy setup
source ~/.zshenv

**View logs:**
The proxy logs to stdout.

**Check health:**
curl http://localhost:3456/health
```

**Full troubleshooting structure:**
```markdown
# Troubleshooting

## Common Issues
- Proxy not starting
- Provider connection failures
- Keychain access denied
- Config file corruption
- Port conflicts

## Diagnostic Commands
- Health check
- Config validation
- Provider verification

## Log Locations
- Proxy stdout
- Tauri console
- System logs
```

---

### `docs/api-reference.md` (documentation)

**Analog:** `packages/proxy/src/routes/admin.ts` + `README.md` (lines 25-36)

**API reference pattern** (lines 25-36):
```markdown
- GET /admin/providers — list providers
- POST /admin/providers — add provider
- GET /admin/routes — view model mappings
- PUT /admin/routes — update model mappings
```

**API reference structure:**
```markdown
# Admin API Reference

## Endpoints
### GET /admin/config
Returns current proxy configuration.

### PUT /admin/config
Updates proxy configuration.

### GET /admin/providers
Lists all configured providers.

### POST /admin/providers
Adds a new provider.

### GET /admin/routes
Returns current model routes.

### PUT /admin/routes
Updates model routes.

### GET /health
Health check endpoint.
```

---

### `src-tauri/tauri.conf.json` (config, modify)

**Analog:** Self (current file, lines 1-30)

**Current config** (lines 1-30):
```json
{
  "$schema": "https://raw.githubusercontent.com/nicklasxyz/tauri2-schema/main/schema.json",
  "productName": "ClaudeCode Proxy",
  "version": "0.1.0",
  "identifier": "com.claudecode.proxy",
  "build": {
    "beforeDevCommand": "cd packages/proxy && npx tsx src/index.js & npm run dev --workspace=apps/web",
    "beforeBuildCommand": "cd packages/proxy && npm run build && npm run build --workspace=apps/web",
    "frontendDist": "../apps/web/.next/static",
    "devUrl": "http://localhost:3000"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [...]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": []
  }
}
```

**Additions needed** (per RESEARCH.md):
```json
{
  "bundle": {
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
      "pubkey": "<public-key>",
      "endpoints": ["https://github.com/<owner>/<repo>/releases/latest/download"]
    }
  }
}
```

---

### `src-tauri/capabilities/default.json` (config, modify)

**Analog:** Self (current file, lines 1-11)

**Current permissions** (lines 1-11):
```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "shell:allow-spawn",
    "shell:allow-kill",
    "shell:allow-stdin-write",
    "shell:allow-stdout-read",
    "shell:allow-stderr-read"
  ]
}
```

**Add:** `"updater:default"` to permissions array.

---

### `src-tauri/Cargo.toml` (config, modify)

**Analog:** Self (current file, lines 1-20)

**Current dependencies** (lines 15-20):
```toml
[dependencies]
tauri = { version = "2", features = ["shell-sidecar"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["blocking", "json"] }
```

**Add:**
```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

---

### `README.md` (documentation, modify)

**Analog:** Self (current file, lines 1-126)

**Current structure** (full file):
- Quick Start (lines 5-21)
- Configuration (lines 23-36)
- Architecture (lines 38-46)
- CLI Commands (lines 48-64)
- API Keys (lines 66-79)
- Providers (lines 81-97)
- Troubleshooting (lines 99-126)

**Additions needed:**
- E2E Testing section
- Setup Script section (enhanced)
- Auto-Update section
- Release/DMG section
- Documentation links

---

### `package.json` (config, modify)

**Analog:** Self (current file, lines 1-15)

**Current scripts** (lines 5-10):
```json
{
  "scripts": {
    "dev": "npm run dev --workspace=apps/web",
    "build": "npm run build --workspace=apps/web",
    "tauri": "tauri",
    "proxy:build": "cd packages/proxy && npm run build",
    "proxy:start": "cd packages/proxy && node dist/index.js"
  }
}
```

**Additions needed:**
```json
{
  "scripts": {
    "test:e2e": "npx playwright test --project=chromium",
    "test:e2e:smoke": "npx playwright test --project=chromium --grep \"@smoke\"",
    "test:e2e:ui": "npx playwright test --project=chromium --ui",
    "setup": "npx tsx scripts/setup.ts",
    "docs": "npx vitepress dev docs"
  },
  "devDependencies": {
    "@playwright/test": "^1.59.1",
    "playwright": "^1.59.1"
  }
}
```

---

## Shared Patterns

### Test Structure
**Source:** `packages/proxy/tests/routes/admin.test.ts`
**Apply to:** All E2E test files (`e2e/tests/*.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    // Arrange
    // Act
    // Assert
    await expect(...).toBeVisible();
  });
});
```

### Service Import Pattern
**Source:** `packages/cli/src/index.ts` (lines 10-16)
**Apply to:** `scripts/setup.ts`
```typescript
import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
```

### Config Service Pattern
**Source:** `packages/proxy/src/services/config.ts` (lines 73-80)
**Apply to:** `scripts/setup.ts`
```typescript
export class ConfigService {
  private configPath: string;
  private configDir: string;

  constructor(configPath?: string) {
    this.configDir = CONFIG_DIR;
    this.configPath = configPath || CONFIG_FILE;
  }
}
```

### Keychain Service Pattern
**Source:** `packages/proxy/src/services/keychain.ts` (lines 30-91)
**Apply to:** `scripts/setup.ts`
```typescript
export class KeychainService {
  async setKey(providerName: string, apiKey: string): Promise<void> {
    await keytar.setPassword(SERVICE, providerName, apiKey);
  }
  async getKey(providerName: string): Promise<string | null> {
    return await keytar.getPassword(SERVICE, providerName);
  }
}
```

### Error Handling Pattern
**Source:** `packages/proxy/src/services/keychain.ts` (lines 18-25)
**Apply to:** `scripts/setup.ts`, `e2e/fixtures.ts`
```typescript
export class ProxyKeychainError extends Error {
  constructor(message: string) {
    const sanitized = message.replace(/sk-[a-zA-Z0-9-]+/g, '[KEY]');
    super(sanitized);
    this.name = 'ProxyKeychainError';
  }
}
```

### Tauri Config Pattern
**Source:** `src-tauri/tauri.conf.json`
**Apply to:** `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`

All Tauri configuration files follow the v2 schema. New plugins must be added to:
1. `Cargo.toml` — Rust dependencies
2. `capabilities/default.json` — Permissions
3. `tauri.conf.json` — Plugin configuration

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `e2e/playwright.config.ts` | config | request-response | No Playwright config exists (first E2E setup) |
| `e2e/fixtures.ts` | utility | request-response | No Playwright fixtures exist yet |
| `e2e/pages/*.ts` | test (page object) | request-response | No Page Object Models exist (first E2E) |
| `e2e/tests/*.spec.ts` | test (E2E) | request-response | No E2E tests exist (first E2E suite) |
| `e2e/utils/test-helpers.ts` | utility | request-response | No E2E test utilities exist |
| `docs/*.md` | documentation | — | No docs/ directory exists yet |
| `scripts/setup.ts` | service (CLI) | request-response | Enhanced setup script (extends existing CLI but new file) |

---

## Metadata

**Analog search scope:** `packages/proxy/tests/`, `packages/proxy/src/`, `packages/cli/src/`, `apps/web/src/components/`, `src-tauri/`, root `README.md`, `package.json`
**Files scanned:** 25
**Pattern extraction date:** 2026-05-11
