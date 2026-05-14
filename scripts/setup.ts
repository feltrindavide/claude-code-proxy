#!/usr/bin/env node
/**
 * Enhanced Claude Code Proxy Setup Script
 * Phase: 06-testing-documentation
 * Plan: 06-02, Task 1
 *
 * Implements 6 features per D-81:
 * 1. Configure ANTHROPIC_BASE_URL in shell profile
 * 2. Create default config.json
 * 3. Verify provider connections
 * 4. Import config from backup
 * 5. Configure Keychain with API keys
 * 6. Generate diagnostic report
 *
 * Flags: --dry-run, --import <path>, --non-interactive, --no-keychain
 */

import { Command } from 'commander';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import http from 'http';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROXY_URL = 'http://localhost:3456';
const CONFIG_DIR = join(homedir(), '.claude-code-proxy');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const KEYCHAIN_SERVICE = 'claude-code-proxy';
const MARKER = 'ANTHROPIC_BASE_URL';

// ---------------------------------------------------------------------------
// Keytar dynamic import (native module, may not be available in all envs)
// ---------------------------------------------------------------------------

async function getKeytar() {
  try {
    const keytar = await import('keytar');
    return keytar.default || keytar;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeKey(value: string): string {
  return value.replace(/sk-[a-zA-Z0-9-]+/g, '[KEY]');
}

function log(msg: string) {
  console.log(msg);
}

function warn(msg: string) {
  console.log(`⚠️  ${msg}`);
}

function ok(msg: string) {
  console.log(`✅ ${msg}`);
}

function err(msg: string) {
  console.error(`❌ ${msg}`);
}

function section(title: string) {
  log(`\n${'─'.repeat(50)}`);
  log(`  ${title}`);
  log(`${'─'.repeat(50)}\n`);
}

// ---------------------------------------------------------------------------
// Feature 1: Configure ANTHROPIC_BASE_URL
// ---------------------------------------------------------------------------

interface ShellProfile {
  path: string;
  shell: string;
  exportLine: string;
}

function detectShellProfile(): ShellProfile {
  const shell = process.env.SHELL || '';
  const isZsh = shell.endsWith('zsh') || shell.includes('zsh');
  const isBash = shell.endsWith('bash') || shell.includes('bash');
  const isFish = shell.endsWith('fish') || shell.includes('fish');

  if (isFish) {
    return {
      path: join(homedir(), '.config', 'fish', 'config.fish'),
      shell: 'fish',
      exportLine: 'set -gx ANTHROPIC_BASE_URL "http://localhost:3456"',
    };
  }
  if (isBash) {
    return {
      path: join(homedir(), '.bashrc'),
      shell: 'bash',
      exportLine: 'export ANTHROPIC_BASE_URL="http://localhost:3456"',
    };
  }
  // zsh or fallback
  return {
    path: join(homedir(), '.zshenv'),
    shell: isZsh ? 'zsh' : 'unknown (fallback: zsh)',
    exportLine: 'export ANTHROPIC_BASE_URL="http://localhost:3456"',
  };
}

async function configureBaseUrl(dryRun: boolean): Promise<boolean> {
  section('1. Configure ANTHROPIC_BASE_URL');

  const profile = detectShellProfile();
  log(`Detected shell: ${profile.shell}`);
  log(`Profile file: ${profile.path}`);

  if (dryRun) {
    log(`[DRY RUN] Would write to ${profile.path}:`);
    log(`  ${profile.exportLine}`);
    if (existsSync(profile.path)) {
      const content = readFileSync(profile.path, 'utf-8');
      if (content.includes(MARKER)) {
        log(`  (already set — would skip)`);
        return false;
      }
    }
    return true;
  }

  // Already set?
  if (existsSync(profile.path)) {
    const content = readFileSync(profile.path, 'utf-8');
    if (content.includes(MARKER)) {
      ok(`ANTHROPIC_BASE_URL is already configured in ${profile.path}`);
      return false;
    }
  }

  // Ensure parent directory exists (for fish shell config)
  const parentDir = join(profile.path, '..');
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }

  let content = '';
  if (existsSync(profile.path)) {
    content = readFileSync(profile.path, 'utf-8');
  }

  const newContent =
    content.trimEnd() +
    (content.endsWith('\n') ? '' : '\n') +
    profile.exportLine +
    '\n';

  writeFileSync(profile.path, newContent, { mode: 0o600 });
  ok(`Added ANTHROPIC_BASE_URL to ${profile.path}`);
  log(`  Run: source ${profile.path}  (or restart terminal)`);
  return true;
}

// ---------------------------------------------------------------------------
// Feature 2: Create default config.json
// ---------------------------------------------------------------------------

function getDefaultConfig() {
  return {
    providers: [],
    routes: [
      { claudeTier: 'opus', providerName: 'opencode', targetModel: 'qwen3.6' },
      {
        claudeTier: 'sonnet',
        providerName: 'openrouter',
        targetModel: 'mimo-v2-flash',
      },
      {
        claudeTier: 'haiku',
        providerName: 'opencode',
        targetModel: 'nvidia/nemotron-3-super-120b-a12b:free',
      },
    ],
    version: '0.1.0',
  };
}

async function createDefaultConfig(dryRun: boolean): Promise<boolean> {
  section('2. Create Default Config');

  log(`Config directory: ${CONFIG_DIR}`);
  log(`Config file: ${CONFIG_FILE}`);

  if (dryRun) {
    if (existsSync(CONFIG_FILE)) {
      log(`[DRY RUN] Config already exists — would skip`);
      return false;
    }
    log(`[DRY RUN] Would create ${CONFIG_FILE} with default providers and routes`);
    return true;
  }

  if (existsSync(CONFIG_FILE)) {
    ok(`Config file already exists at ${CONFIG_FILE}`);
    return false;
  }

  // Atomic write: temp file + rename
  const tempPath = `${CONFIG_FILE}.tmp`;
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  const content = JSON.stringify(getDefaultConfig(), null, 2);
  writeFileSync(tempPath, content, { mode: 0o600 });
  renameSync(tempPath, CONFIG_FILE);
  ok(`Created default config at ${CONFIG_FILE}`);
  return true;
}

// ---------------------------------------------------------------------------
// Feature 3: Verify provider connections
// ---------------------------------------------------------------------------

function httpGet(path: string, timeoutMs = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${PROXY_URL}${path}`, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function verifyProviders(dryRun: boolean): Promise<void> {
  section('3. Verify Provider Connections');

  if (dryRun) {
    log('[DRY RUN] Would poll health endpoint and verify each enabled provider');
    return;
  }

  try {
    const health = (await httpGet('/health')) as { status: string };
    if (health.status !== 'ok') {
      warn('Proxy health check returned unexpected status');
      return;
    }
    ok('Proxy is running');
  } catch {
    warn('Proxy is not running — skipping provider verification');
    log('  Start proxy: npx claude-code-proxy start');
    return;
  }

  try {
    const providers = (await httpGet('/admin/providers')) as Array<{
      name: string;
      enabled: boolean;
      baseUrl: string;
    }>;

    if (!providers || providers.length === 0) {
      log('No providers configured');
      return;
    }

    log(`Found ${providers.length} provider(s):\n`);
    for (const p of providers) {
      if (!p.enabled) {
        log(`  ⏭️  ${p.name} (disabled) — ${p.baseUrl}`);
        continue;
      }
      try {
        await httpGet(`/admin/providers/${encodeURIComponent(p.name)}/validate`, 8000);
        ok(`  ${p.name} — connection OK (${p.baseUrl})`);
      } catch {
        warn(`  ${p.name} — connection failed (${p.baseUrl})`);
      }
    }
  } catch (e) {
    warn(`Could not fetch provider list: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Feature 4: Import config from backup
// ---------------------------------------------------------------------------

function readStdin(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function importBackup(
  backupPath: string | undefined,
  nonInteractive: boolean,
  dryRun: boolean,
): Promise<boolean> {
  section('4. Import Config from Backup');

  let filePath = backupPath;

  if (!filePath && !nonInteractive) {
    filePath = await readStdin('Enter backup file path (or press Enter to skip): ');
    if (!filePath) {
      log('Skipped import');
      return false;
    }
  }

  if (!filePath) {
    log('No backup file specified — skipping import');
    return false;
  }

  if (!existsSync(filePath)) {
    err(`Backup file not found: ${filePath}`);
    return false;
  }

  let backupData: unknown;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    backupData = JSON.parse(raw);
  } catch (e) {
    err(`Failed to parse backup file: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }

  // Validate structure
  const data = backupData as Record<string, unknown>;
  if (!Array.isArray(data.providers) || !Array.isArray(data.routes)) {
    err('Invalid backup: must contain providers[] and routes[] arrays');
    return false;
  }

  if (dryRun) {
    log(`[DRY RUN] Would import ${data.providers.length} provider(s) and ${data.routes.length} route(s) from ${filePath}`);
    return true;
  }

  // Merge with existing config
  let currentConfig = getDefaultConfig();
  if (existsSync(CONFIG_FILE)) {
    try {
      currentConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      // Use defaults if current config is corrupt
    }
  }

  // Merge providers (dedup by name, incoming wins)
  const providerMap = new Map<string, typeof currentConfig.providers[number]>();
  for (const p of currentConfig.providers) {
    providerMap.set(p.name, p);
  }
  for (const p of data.providers) {
    providerMap.set(p.name, p as typeof currentConfig.providers[number]);
  }

  const merged = {
    providers: Array.from(providerMap.values()),
    routes: data.routes,
    version: currentConfig.version || '0.1.0',
  };

  // Atomic write
  const tempPath = `${CONFIG_FILE}.tmp`;
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(tempPath, JSON.stringify(merged, null, 2), { mode: 0o600 });
  renameSync(tempPath, CONFIG_FILE);

  ok(`Imported config from ${filePath}`);
  log(`  ${merged.providers.length} provider(s), ${merged.routes.length} route(s)`);
  return true;
}

// ---------------------------------------------------------------------------
// Feature 5: Configure Keychain
// ---------------------------------------------------------------------------

async function configureKeychain(
  nonInteractive: boolean,
  noKeychain: boolean,
  dryRun: boolean,
): Promise<void> {
  section('5. Configure Keychain');

  if (noKeychain) {
    log('Keychain configuration skipped (--no-keychain)');
    return;
  }

  if (dryRun) {
    log('[DRY RUN] Would check Keychain for each provider and prompt for missing keys');
    return;
  }

  const keytar = await getKeytar();
  if (!keytar) {
    warn('keytar not available — skipping Keychain configuration');
    log('  Install keytar: npm install keytar');
    return;
  }

  // Load current config to get provider list
  if (!existsSync(CONFIG_FILE)) {
    log('No config file found — no providers to configure');
    return;
  }

  let config: { providers: Array<{ name: string; keyId: string }> };
  try {
    config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    warn('Could not parse config file — skipping Keychain configuration');
    return;
  }

  if (!config.providers || config.providers.length === 0) {
    log('No providers configured — nothing to store in Keychain');
    return;
  }

  log(`Checking Keychain for ${config.providers.length} provider(s):\n`);

  for (const provider of config.providers) {
    const accountName = provider.keyId || provider.name;
    try {
      const existingKey = await keytar.getPassword(KEYCHAIN_SERVICE, accountName);
      if (existingKey) {
        ok(`${provider.name} — key exists in Keychain`);
        continue;
      }
    } catch {
      // Key not found or error — prompt for it
    }

    if (nonInteractive) {
      warn(`${provider.name} — key missing in Keychain (non-interactive mode, skipping)`);
      continue;
    }

    // Prompt for API key
    const apiKey = await readStdin(
      `Enter API key for provider "${provider.name}" (account: ${accountName}): `,
    );

    if (!apiKey) {
      warn(`Skipped ${provider.name} — no key provided`);
      continue;
    }

    try {
      await keytar.setPassword(KEYCHAIN_SERVICE, accountName, apiKey);
      ok(`${provider.name} — key stored in Keychain`);
    } catch (e) {
      err(
        `${provider.name} — failed to store key: ${sanitizeKey(e instanceof Error ? e.message : String(e))}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 6: Generate diagnostic report
// ---------------------------------------------------------------------------

async function generateDiagnostic(dryRun: boolean): Promise<void> {
  section('6. Diagnostic Report');

  if (dryRun) {
    log('[DRY RUN] Would generate diagnostic report');
    return;
  }

  // Proxy health
  log('Proxy Health:');
  try {
    const health = (await httpGet('/health', 3000)) as Record<string, string>;
    ok(`  Status: ${health.status || 'unknown'}`);
    if (health.version) log(`  Version: ${health.version}`);
    if (health.port) log(`  Port: ${health.port}`);
  } catch {
    warn('  Proxy is not running');
  }

  // Config file
  log('\nConfig File:');
  log(`  Location: ${CONFIG_FILE}`);
  if (existsSync(CONFIG_FILE)) {
    ok('  File exists');
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      log(`  Providers: ${config.providers?.length || 0}`);
      log(`  Routes: ${config.routes?.length || 0}`);
    } catch {
      warn('  File exists but could not be parsed');
    }
  } else {
    warn('  File not found');
  }

  // Keychain status
  log('\nKeychain Status:');
  const keytar = await getKeytar();
  if (!keytar) {
    warn('  keytar not available');
  } else if (!existsSync(CONFIG_FILE)) {
    log('  No config file — no providers to check');
  } else {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (!config.providers || config.providers.length === 0) {
        log('  No providers configured');
      } else {
        for (const p of config.providers) {
          const accountName = p.keyId || p.name;
          try {
            const hasKey = await keytar.hasPassword(KEYCHAIN_SERVICE, accountName);
            if (hasKey) {
              ok(`  ${p.name}: key present`);
            } else {
              warn(`  ${p.name}: key missing`);
            }
          } catch {
            warn(`  ${p.name}: error checking Keychain`);
          }
        }
      }
    } catch {
      warn('  Could not parse config file');
    }
  }

  // Environment
  log('\nEnvironment:');
  const envUrl = process.env.ANTHROPIC_BASE_URL;
  if (envUrl) {
    ok(`  ANTHROPIC_BASE_URL=${envUrl}`);
  } else {
    warn('  ANTHROPIC_BASE_URL is not set');
  }

  log(`  Node.js: ${process.version}`);

  try {
    const { execSync } = await import('child_process');
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    log(`  npm: ${npmVersion}`);
  } catch {
    log('  npm: unknown');
  }
}

// ---------------------------------------------------------------------------
// Feature 7: Install Claude Code proxy-context skill plugin
// ---------------------------------------------------------------------------

const SKILL_SRC = join(__dirname, 'plugins', 'proxy-context', 'SKILL.md');
const SCRIPT_SRC = join(__dirname, 'context-status.js');

async function installProxyContextPlugin(dryRun: boolean): Promise<void> {
  section('7. Install /proxy-context Skill Plugin');

  const skillDir = join(homedir(), '.claude', 'skills', 'proxy-context');
  const skillDest = join(skillDir, 'SKILL.md');
  const scriptsDir = join(homedir(), '.claude-code-proxy', 'scripts');
  const scriptDest = join(scriptsDir, 'context-status.js');

  if (dryRun) {
    log(`[DRY RUN] Would create ${skillDest}`);
    log(`[DRY RUN] Would create ${scriptDest}`);
    log(`[DRY RUN] Would chmod +x ${scriptDest}`);
    return;
  }

  let installed = false;

  // Install SKILL.md
  if (existsSync(SKILL_SRC)) {
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true, mode: 0o700 });
    }
    const content = readFileSync(SKILL_SRC, 'utf-8');
    writeFileSync(skillDest, content, { mode: 0o600 });
    ok(`Installed proxy-context skill → ${skillDest}`);
    installed = true;
  } else {
    warn(`Skill source not found: ${SKILL_SRC}`);
  }

  // Install context-status.js
  if (existsSync(SCRIPT_SRC)) {
    if (!existsSync(scriptsDir)) {
      mkdirSync(scriptsDir, { recursive: true, mode: 0o700 });
    }
    const content = readFileSync(SCRIPT_SRC, 'utf-8');
    writeFileSync(scriptDest, content, { mode: 0o755 });
    ok(`Installed context-status script → ${scriptDest}`);
    installed = true;
  } else {
    warn(`Script source not found: ${SCRIPT_SRC}`);
  }

  if (!installed) {
    warn('No plugin files were installed — check scripts/ directory structure');
    return;
  }

  log('\n  Usage:');
  log(`    In Claude Code: type /proxy-context`);
  log(`    Or run: node ${scriptDest}`);
  log(`  To add to status line, edit ~/.claude/settings.json → statusLine.command`);
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const program = new Command();

  program
    .name('claude-code-proxy-setup')
    .description('Enhanced Claude Code Proxy Setup')
    .version('0.2.0')
    .option('--dry-run', 'Print what would be done without making changes')
    .option('--import <path>', 'Import config from backup file')
    .option('--non-interactive', 'Skip all interactive prompts')
    .option('--no-keychain', 'Skip Keychain configuration');

  program.parse(process.argv);

  const options = program.opts<{
    dryRun?: boolean;
    import?: string;
    nonInteractive?: boolean;
    noKeychain?: boolean;
  }>();

  const dryRun = options.dryRun ?? false;
  const nonInteractive = options.nonInteractive ?? false;
  const noKeychain = options.noKeychain ?? false;
  const importPath = options.import;

  if (dryRun) {
    log('\n🔧 Claude Code Proxy Setup — DRY RUN MODE\n');
  } else {
    log('\n🔧 Claude Code Proxy Setup\n');
  }

  // Feature 1: Configure ANTHROPIC_BASE_URL
  await configureBaseUrl(dryRun);

  // Feature 2: Create default config.json
  await createDefaultConfig(dryRun);

  // Feature 3: Verify provider connections
  await verifyProviders(dryRun);

  // Feature 4: Import config from backup (skip prompts in dry-run)
  if (importPath || (!nonInteractive && !dryRun)) {
    await importBackup(importPath, nonInteractive, dryRun);
  } else if (dryRun) {
    section('4. Import Config from Backup');
    log('[DRY RUN] Would prompt for backup file path (or use --import flag)');
  }

  // Feature 5: Configure Keychain
  await configureKeychain(nonInteractive, noKeychain, dryRun);

  // Feature 6: Generate diagnostic report
  await generateDiagnostic(dryRun);

  // Feature 7: Install /proxy-context skill plugin
  await installProxyContextPlugin(dryRun);

  if (dryRun) {
    log('\n📋 DRY RUN complete — no changes were made.\n');
  } else {
    log('\n🎉 Setup complete!\n');
    log('Next steps:');
    log('  1. Restart your terminal or run: source ~/.zshenv');
    log('  2. Start the proxy: npx claude-code-proxy start');
    log('  3. Verify: npx claude-code-proxy status');
    log('  4. In Claude Code, type /proxy-context to see model usage\n');
  }
}

// Export for testing
export {
  configureBaseUrl,
  createDefaultConfig,
  verifyProviders,
  importBackup,
  configureKeychain,
  generateDiagnostic,
  installProxyContextPlugin,
  detectShellProfile,
  getDefaultConfig,
};

// Run if executed directly
if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('Setup failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
