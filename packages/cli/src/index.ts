#!/usr/bin/env node
/**
 * Claude Code Proxy CLI
 * Phase: 01-core-proxy-server
 * Plan: 01-03, Task 1
 *
 * Provides setup, start, and status commands for Claude Code proxy.
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getProxyPackageRoot(): string {
  // CLI lives at packages/cli/, proxy sibling at packages/proxy/
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

// ---------------------------------------------------------------------------
// Command: setup
// ---------------------------------------------------------------------------

async function runSetup(): Promise<void> {
  const shell = process.env.SHELL || '';
  const isZsh = shell.endsWith('zsh') || shell.includes('zsh');
  const isBash = shell.endsWith('bash') || shell.includes('bash');

  // Determine profile file
  let profilePath: string;
  if (isZsh) {
    profilePath = join(homedir(), '.zshenv');
  } else if (isBash) {
    profilePath = join(homedir(), '.bashrc');
  } else {
    profilePath = join(homedir(), '.zshenv');
  }

  const exportLine = 'export ANTHROPIC_BASE_URL="http://localhost:3456"';
  const marker = 'ANTHROPIC_BASE_URL';

  console.log(`\n🔧 Claude Code Proxy Setup\n`);
  console.log(`Detected shell: ${isZsh ? 'zsh' : isBash ? 'bash' : 'unknown'}`);
  console.log(`Writing to: ${profilePath}\n`);

  let content = '';
  let alreadySet = false;

  if (existsSync(profilePath)) {
    content = readFileSync(profilePath, 'utf-8');
    if (content.includes(marker)) {
      console.log(`✅ ANTHROPIC_BASE_URL is already configured in ${profilePath}`);
      alreadySet = true;
    }
  }

  if (!alreadySet) {
    const newContent = content.trimEnd() + (content.endsWith('\n') ? '' : '\n') + exportLine + '\n';
    writeFileSync(profilePath, newContent, { mode: 0o600 });
    console.log(`✅ Added ANTHROPIC_BASE_URL to ${profilePath}`);
  }

  console.log(`\n📋 Next Steps:`);
  console.log(`  1. Run: source ${profilePath}   (or restart your terminal)`);
  console.log(`  2. Configure providers: http://localhost:3456/admin/providers`);
  console.log(`  3. Verify: npx claude-code-proxy status\n`);
  console.log(`  Once set up, Claude Code will route requests through localhost:3456\n`);
}

// ---------------------------------------------------------------------------
// Command: start
// ---------------------------------------------------------------------------

async function runStart(port?: number): Promise<void> {
  const proxyRoot = getProxyPackageRoot();
  const pkg = getProxyPackageJson();

  if (!pkg) {
    console.error('❌ Error: Proxy package not found. Run npm install in packages/proxy/');
    process.exit(1);
  }

  const proxyPkgPath = join(proxyRoot, 'src', 'index.ts');

  if (!existsSync(proxyPkgPath)) {
    console.error('❌ Error: Proxy source not found at packages/proxy/src/index.ts');
    process.exit(1);
  }

  console.log(`\n🚀 Starting Claude Code Proxy...\n`);

  try {
    // Dynamically import the proxy server
    const { startServer } = await import(join(proxyRoot, 'src', 'index.js'))
      .catch(() => import(join(proxyRoot, 'src', 'index.ts')));

    const targetPort = port || 3456;
    await startServer(targetPort);
    console.log(`\n✅ Proxy running on http://localhost:${targetPort}\n`);
  } catch (error) {
    // If .js import fails, try tsx
    const { execSync } = await import('child_process');
    try {
      execSync(
        `node --loader tsx/esm ${join(proxyRoot, 'src', 'index.ts')}${port ? ` ${port}` : ''}`,
        { stdio: 'inherit', cwd: proxyRoot }
      );
    } catch (e) {
      console.error('❌ Failed to start proxy server:', error);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Command: status
// ---------------------------------------------------------------------------

async function runStatus(): Promise<void> {
  const http = await import('http');

  console.log(`\n🔍 Checking proxy status...\n`);

  const req = http.get('http://localhost:3456/health', (res) => {
    if (res.statusCode === 200) {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log(`✅ Proxy is RUNNING`);
          console.log(`   Version: ${data.version}`);
          console.log(`   Port:    ${data.port}`);
          console.log(`   URL:     http://localhost:${data.port}\n`);
          console.log(`   Admin:   http://localhost:${data.port}/admin/providers`);
          console.log(`   Health:  http://localhost:${data.port}/health\n`);
        } catch {
          console.log(`✅ Proxy is RUNNING (status endpoint responded)\n`);
        }
      });
    } else {
      console.log(`❌ Proxy returned status ${res.statusCode}`);
      process.exit(1);
    }
  });

  req.on('error', () => {
    console.log(`❌ Proxy is NOT RUNNING`);
    console.log(`   Start it with: npx claude-code-proxy start\n`);
    process.exit(1);
  });

  req.setTimeout(3000, () => {
    req.destroy();
    console.log(`❌ Proxy health check timed out`);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Command: config
// ---------------------------------------------------------------------------

async function runConfig(): Promise<void> {
  const http = await import('http');

  const makeRequest = (path: string, method = 'GET'): Promise<void> => {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: 'localhost', port: 3456, path, method, timeout: 3000 },
        (res) => {
          if (res.statusCode !== 200) {
            console.log(`Error: proxy returned status ${res.statusCode}`);
            reject(new Error(`Status ${res.statusCode}`));
            return;
          }
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              console.log(JSON.stringify(data, null, 2));
              resolve();
            } catch {
              console.log(body);
              resolve();
            }
          });
        }
      );
      req.on('error', (e) => {
        console.log(`❌ Proxy is not running. Start it with: npx claude-code-proxy start\n`);
        reject(e);
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });
      req.end();
    });
  };

  console.log(`\n⚙️  Proxy Configuration\n`);
  console.log(`Fetching from http://localhost:3456/admin/providers and /routes...\n`);

  try {
    await makeRequest('/admin/providers');
    console.log('');
    await makeRequest('/admin/routes');
  } catch (e) {
    // already printed error
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('claude-code-proxy')
  .description('Claude Code proxy setup and management CLI')
  .version('0.1.0');

program
  .command('setup')
  .description('Configure Claude Code to use the proxy (writes ANTHROPIC_BASE_URL to shell profile)')
  .action(runSetup);

program
  .command('start')
  .description('Start the Claude Code proxy server')
  .option('-p, --port <port>', 'Port to run the proxy on (default: 3456)', parseInt)
  .action((options) => runStart(options.port));

program
  .command('status')
  .description('Check if the proxy server is running')
  .action(runStatus);

program
  .command('config')
  .description('Show current proxy configuration (providers and routes)')
  .action(runConfig);

program.parse();