/**
 * Express Server Entry Point
 * Phase: 01-core-proxy-server
 * Plans: 01-01, 01-02, 01-03 (config loading wired in 01-03)
 * Port: 3456 (per D-02)
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { handleProxyRequest } from './proxy.js';
import { providerService } from './services/provider.js';
import { contextRegistry } from './services/context-registry.js';
import { configService } from './services/config.js';
import { providerValidatorService } from './services/provider-validator.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware.js';
import { requestLogService } from './services/requestLog.js';
import { validationStoreService } from './services/validationStore.js';
import adminRouter from './routes/admin.js';
import type { LLMProvider, ModelRoute } from './types/index.js';

const DEFAULT_PORT = 3456;
const DEFAULT_HOST = 'localhost';

import { writeModelEnvFile } from './services/modelEnv.js';
import { LocalDiscoveryService } from './services/local-discovery.js';
import { responseCache } from './services/response-cache.js';
import { ensureAdminToken } from './services/admin-auth.js';
import { setDiscoveryService, getDiscoveryService } from './services/discovery-registry.js';
import { adminAuthMiddleware } from './middleware/adminAuth.js';
import { prewarmAdapters } from './adapters/index.js';
import { attachLogWebSocket, closeLogWebSocket } from './services/log-broadcast.js';
import { setupGracefulShutdown } from './services/shutdown.js';
import { rateLimiterService } from './services/rateLimiter.js';
import { logger } from './lib/logger.js';
import type { Server } from 'http';

const app = express();

// Middleware
app.use(cors());
app.use(requestIdMiddleware);
app.use(express.json({ limit: '32mb' }));

// Try to read app version from bundled package.json (production) or proxy package.json (dev)
let APP_VERSION = '1.0.0';
try {
  const pkgPaths = [
    path.join(__dirname, '../package.json'),      // CJS bundle: proxy-bundle/package.json
    path.join(__dirname, '../../package.json'),   // dev tsx: packages/proxy/package.json → root
  ];
  for (const p of pkgPaths) {
    if (fs.existsSync(p)) {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (pkg.version) {
        APP_VERSION = pkg.version;
        break;
      }
    }
  }
} catch {}

// Mount admin API routes (D-05)
app.use('/admin', adminRouter);

  // Mount system proxy setup route
  setupSystemProxyRoutes();

  // Health check endpoint (D-02)
  app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    port: DEFAULT_PORT,
    version: APP_VERSION,
  });
});

// Admin endpoints (D-05)

// GET /config - Get current configuration
app.get('/config', (req, res) => {
  const providers = providerService.getProviders();
  // Don't expose keyId in response
  const safeProviders = providers.map(({ keyId, ...rest }) => rest);
  res.json({
    providers: safeProviders,
  });
});

// GET /v1/models — gateway model discovery per Claude Code
// I model ID usano formato "anthropic/{providerName}/{targetModel}"
// Claude Code li mostra nel picker e li riconosce come gateway models
app.get('/v1/models', (req, res) => {
  const routes = providerService.getRoutes();
  const data: Array<{
    type: string;
    id: string;
    display_name: string;
    created_at: string;
  }> = [];

  for (const route of routes) {
    data.push({
      type: 'model',
      id: `anthropic/${route.providerName}/${route.targetModel}`,
      display_name: route.targetModel,
      created_at: new Date().toISOString(),
    });
  }

  res.json({
    data,
    has_more: false,
    first_id: data[0]?.id ?? null,
    last_id: data[data.length - 1]?.id ?? null,
  });
});

// Mount proxy handler at /v1/messages (PROX-01, PROX-02, PROX-05)
// Request logging middleware inserted before handleProxyRequest (04-01)
  app.post('/v1/messages', express.json({ limit: '32mb' }), requestLoggerMiddleware, rateLimitMiddleware, handleProxyRequest);

/**
 * Migrazione: ~/.claude-code-proxy/ → ~/.claude/claude-code-proxy/
 * Eseguita PRIMA di loadConfigOnStartup() per garantire che config.json sia già
 * nella nuova posizione quando i servizi vengono caricati.
 */
function migrateFromOldPath(): void {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return;

  const oldDir = path.join(home, '.claude-code-proxy');
  const newDir = path.join(home, '.claude', 'claude-code-proxy');
  if (!fs.existsSync(oldDir) || fs.existsSync(newDir)) return;

  try {
    console.log('[Setup] Migrating ~/.claude-code-proxy/ → ~/.claude/claude-code-proxy/');
    const mk = (p: string) => fs.mkdirSync(p, { recursive: true, mode: 0o700 });
    const cp = (src: string, dest: string) => {
      if (fs.existsSync(src)) fs.writeFileSync(dest, fs.readFileSync(src, 'utf-8'), { mode: 0o600 });
    };

    mk(newDir);
    mk(path.join(newDir, 'data'));
    mk(path.join(newDir, 'logs'));
    mk(path.join(newDir, 'config-backup'));
    mk(path.join(newDir, 'scripts'));

    // Copia file root
    cp(path.join(oldDir, 'config.json'), path.join(newDir, 'config.json'));
    cp(path.join(oldDir, 'proxy-context.json'), path.join(newDir, 'proxy-context.json'));
    cp(path.join(oldDir, 'models.sh'), path.join(newDir, 'models.sh'));
    cp(path.join(oldDir, 'proxy.pid'), path.join(newDir, 'proxy.pid'));
    cp(path.join(oldDir, 'proxy-startup.log'), path.join(newDir, 'logs', 'startup.log'));

    // Copia in data/
    cp(path.join(oldDir, 'secrets.json'), path.join(newDir, 'data', 'secrets.json'));
    cp(path.join(oldDir, 'rate-limits.json'), path.join(newDir, 'data', 'rate-limits.json'));
    cp(path.join(oldDir, 'validation-results.json'), path.join(newDir, 'data', 'validation-results.json'));
    cp(path.join(oldDir, 'request-log.json'), path.join(newDir, 'data', 'request-log.json'));

    // Copia scripts/
    const oldScripts = path.join(oldDir, 'scripts');
    if (fs.existsSync(oldScripts)) {
      for (const f of fs.readdirSync(oldScripts)) {
        const src = path.join(oldScripts, f);
        const dest = path.join(newDir, 'scripts', f);
        fs.writeFileSync(dest, fs.readFileSync(src, 'utf-8'), { mode: 0o755 });
      }
    }

    // Sposta backup sparsi in config-backup/
    for (const f of fs.readdirSync(oldDir)) {
      if (f.startsWith('config-backup-')) {
        cp(path.join(oldDir, f), path.join(newDir, 'config-backup', f));
      }
    }

    // Rimuovi vecchia dir (solo se la nuova è ok)
    const verifyFile = path.join(newDir, 'config.json');
    if (fs.existsSync(verifyFile)) {
      fs.rmSync(oldDir, { recursive: true, force: true });
      console.log('[Setup] Migration complete. Removed ~/.claude-code-proxy/');
    }
  } catch (err) {
    console.warn('[Setup] Migration failed:', err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * Auto-install Claude Code proxy plugins e configura settings.json
 */
function resolvePluginSources(): {
  skillSrc: string | null;
  statusScriptSrc: string | null;
  compactHookSrc: string | null;
} {
  const candidates = [
    // Production bundle (Tauri): proxy-bundle/plugins/
    {
      skill: path.join(__dirname, '../plugins/proxy-context/SKILL.md'),
      status: path.join(__dirname, '../plugins/context-status.js'),
      compact: path.join(__dirname, '../plugins/auto-compact-hook.js'),
    },
    // Dev monorepo: packages/proxy/src → ../../../scripts
    {
      skill: path.join(__dirname, '../../../scripts/plugins/proxy-context/SKILL.md'),
      status: path.join(__dirname, '../../../scripts/context-status.js'),
      compact: path.join(__dirname, '../../../scripts/auto-compact-hook.js'),
    },
    // Fallback: cwd scripts/ (e.g. npm run dev from repo root)
    {
      skill: path.join(process.cwd(), 'scripts/plugins/proxy-context/SKILL.md'),
      status: path.join(process.cwd(), 'scripts/context-status.js'),
      compact: path.join(process.cwd(), 'scripts/auto-compact-hook.js'),
    },
  ];

  for (const c of candidates) {
    if (fs.existsSync(c.status) || fs.existsSync(c.skill)) {
      return {
        skillSrc: fs.existsSync(c.skill) ? c.skill : null,
        statusScriptSrc: fs.existsSync(c.status) ? c.status : null,
        compactHookSrc: fs.existsSync(c.compact) ? c.compact : null,
      };
    }
  }

  return { skillSrc: null, statusScriptSrc: null, compactHookSrc: null };
}

function installPluginOnStartup(): void {
  const { skillSrc, statusScriptSrc, compactHookSrc } = resolvePluginSources();

  if (!skillSrc && !statusScriptSrc) return;

  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return;

  const scriptsDir = path.join(home, '.claude', 'claude-code-proxy', 'scripts');
  const skillDest = path.join(home, '.claude', 'skills', 'proxy-context', 'SKILL.md');
  const statusScriptDest = path.join(scriptsDir, 'context-status.js');
  const compactHookDest = path.join(scriptsDir, 'auto-compact-hook.js');
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const nodeBin = process.argv[0]; // full path to node binary

  let installed = false;

  // Installa SKILL.md (solo se assente)
  if (skillSrc && !fs.existsSync(skillDest)) {
    fs.mkdirSync(path.dirname(skillDest), { recursive: true, mode: 0o700 });
    fs.writeFileSync(skillDest, fs.readFileSync(skillSrc, 'utf-8'), { mode: 0o600 });
    console.log('[Setup] Installed proxy-context skill →', skillDest);
    installed = true;
  }

  // Sincronizza script hook (sovrascrive per propagare fix come admin token)
  if (statusScriptSrc) {
    fs.mkdirSync(scriptsDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(statusScriptDest, fs.readFileSync(statusScriptSrc, 'utf-8'), { mode: 0o755 });
    if (!installed) console.log('[Setup] Synced context-status script →', statusScriptDest);
    installed = true;
  }

  if (compactHookSrc) {
    fs.mkdirSync(scriptsDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(compactHookDest, fs.readFileSync(compactHookSrc, 'utf-8'), { mode: 0o755 });
    if (!installed) console.log('[Setup] Synced auto-compact hook →', compactHookDest);
    installed = true;
  }

  // Aggiorna settings.json con status line e hook (solo se non già presenti)
  const statusLineCmd = `"${nodeBin}" "${statusScriptDest}"`;
  const compactHookCmd = `"${nodeBin}" "${compactHookDest}"`;

  try {
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {}
    }

    let changed = false;

    // Status line - imposta se non configurata O se il percorso non esiste più
    const existingCmd = (settings.statusLine as Record<string, unknown> | undefined)?.command as string | undefined;
    const statusLineValid = existingCmd && (
      existingCmd.includes(statusScriptDest) ||
      fs.existsSync(existingCmd.replace(/^"|"$/g, '').split(' ').pop() || '')
    );
    if (!statusLineValid) {
      settings.statusLine = {
        type: 'command',
        command: statusLineCmd,
      };
      console.log('[Setup] Updated proxy-context status line in settings.json');
      changed = true;
    }

    // Auto-compact hook - aggiungi ai PostToolUse se non presente
    const hooksSetting = settings.hooks as Record<string, unknown> | undefined;
    if (!hooksSetting) (settings as any).hooks = {};
    const hk = settings.hooks as Record<string, unknown>;
    if (!Array.isArray(hk.PostToolUse)) hk.PostToolUse = [];

    const hooks = hk.PostToolUse as Array<Record<string, unknown>>;
    const hasCompactHook = hooks.some((h: any) =>
      Array.isArray(h.hooks) && h.hooks.some((hh: any) =>
        typeof hh.command === 'string' && hh.command.includes('auto-compact-hook.js'),
      ),
    );

    if (!hasCompactHook && fs.existsSync(compactHookDest)) {
      // Add to existing matcher or create new one
      const bashMatcher = hooks.find((h: any) => h.matcher === 'Bash|Edit|Write|MultiEdit|Agent|Task');
      if (bashMatcher) {
        const mHooks = bashMatcher.hooks as Array<Record<string, unknown>>;
        if (Array.isArray(mHooks)) mHooks.push({
          type: 'command',
          command: compactHookCmd,
          timeout: 5,
        });
      } else {
        hooks.push({
          matcher: 'Bash|Edit|Write|MultiEdit|Agent|Task',
          hooks: [{
            type: 'command',
            command: compactHookCmd,
            timeout: 5,
          }],
        });
      }
      console.log('[Setup] Added auto-compact hook to settings.json');
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 });
      console.log('[Setup] Updated ~/.claude/settings.json');
    }
  } catch (err) {
    console.warn('[Setup] Could not update settings.json:', err instanceof Error ? err.message : 'unknown');
  }

  if (installed) {
    console.log('[Setup] Proxy plugins installed. /proxy-context available in Claude Code.');
  }
}

/**
 * Load configuration and populate service registries
 * Per D-13, D-14: reads config.json, stores Keychain IDs (not actual keys)
 * Per D-22: validates all providers on startup (warnings only, doesn't block)
 */
async function loadConfigOnStartup(): Promise<void> {
  const config = configService.load();

  // Apply response cache config from disk
  responseCache.reconfigure(config.responseCache ?? {});

  // Reload providers from config (per MAP-03: mappings persist across restarts)
  config.providers.forEach((p: LLMProvider) => {
    providerService.registerProvider(p);
  });

  // Set routes from config
  providerService.setRoutes(config.routes);

  // Write model env file for Claude Code
  writeModelEnvFile();

  prewarmAdapters();
  logger.info('Adapters pre-warmed');

  logger.info(
    { providers: config.providers.length, routes: config.routes.length },
    'Config loaded from ~/.claude/claude-code-proxy/config.json',
  );

  // Sync modelli con context-registry
  contextRegistry.syncFromConfig(config.providers);
  console.log(`[Context] Sincronizzati modelli da config.json in proxy-context.json`);

  // Auto-install proxy-context plugin for Claude Code
  installPluginOnStartup();

  // Load request log from disk (04-01)
  requestLogService.load();
  console.log('[Proxy] Request log loaded from ~/.claude/claude-code-proxy/data/request-log.json');

  // Validate all providers on startup (per D-22)
  // Logs warnings for failures but doesn't block startup
  try {
    const validationResults = await providerValidatorService.validateAllProviders();
    let failedCount = 0;
    for (const [name, result] of validationResults) {
      if (!result.valid) {
        failedCount++;
        console.warn(`[Proxy] Startup validation failed for ${name}: ${result.error}`);
      }
    }
    if (failedCount > 0) {
      console.warn(`[Proxy] ${failedCount} provider(s) failed startup validation`);
    }
    // Persist validation results for UI display (D-70, D-71)
    const timestampedResults = new Map(
      Array.from(validationResults.entries()).map(([name, result]) => [
        name,
        { ...result, timestamp: new Date().toISOString() },
      ]),
    );
    validationStoreService.setResults(timestampedResults);
  } catch (error) {
    console.error('[Proxy] Startup validation error:', error);
  }

  // Start local provider discovery
  const discovery = new LocalDiscoveryService(
    (provider) => {
      // Don't overwrite manually configured providers
      const existing = providerService.getProvider(provider.name);
      if (existing && !existing.autoDiscovered) return;
      providerService.registerProvider({ ...provider, keyId: provider.name, autoDiscovered: true });
      contextRegistry.syncFromConfig(configService.load().providers);
    },
    config.discoveryConfig,
  );
  discovery.start();
  setDiscoveryService(discovery);
}

// Serve frontend static files if bundled together (production build)
// Placed after all API routes so API takes priority
const webDir = path.join(__dirname, '../web');
if (fs.existsSync(webDir)) {
  console.log(`[Proxy] Serving frontend from ${webDir}`);
  // Serve static files (only if file exists, otherwise falls through)
  app.use(express.static(webDir));
  // Handle Next.js static export paths: /settings -> /settings/index.html
  // Only matches GET requests not already handled by API routes above
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const filePath = path.join(webDir, req.path === '/' ? 'index.html' : `${req.path}/index.html`);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      next();
    }
  });
}

// Update check endpoint (proxied to avoid CORS issues from Tauri webview)
app.get('/update-check', async (_req, res) => {
  try {
    const resp = await fetch('https://github.com/feltrindavide/claude-code-proxy/releases/latest/download/latest.json');
    const data = await resp.json() as { version?: string };
    res.json({ version: data?.version || 'unknown' });
  } catch {
    res.status(502).json({ error: 'Failed to check for updates' });
  }
});

/**
 * Imposta ANTHROPIC_BASE_URL per le app GUI via launchctl.
 * Permette a Claude Desktop di usare il proxy.
 */
function setupLaunchctlEnv(): void {
  try {
    const current = execSync(
      'launchctl getenv ANTHROPIC_BASE_URL 2>/dev/null || true',
      { encoding: 'utf-8', timeout: 2000 },
    ).trim();

    if (current !== `http://localhost:3456`) {
      execSync(
        'launchctl setenv ANTHROPIC_BASE_URL http://localhost:3456',
        { timeout: 2000 },
      );
      console.log('[Setup] Set ANTHROPIC_BASE_URL via launchctl for GUI apps (Claude Desktop)');
    }
  } catch (err) {
    console.warn('[Setup] Could not set launchctl env:', err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * Crea un certificato self-signed per api.anthropic.com se non esiste già.
 * Salva in ~/.claude/claude-code-proxy/data/certs/
 */
function ensureCert(): { key: string; cert: string } | null {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return null;

  const certDir = path.join(home, '.claude', 'claude-code-proxy', 'data', 'certs');
  const keyPath = path.join(certDir, 'api.anthropic.com-key.pem');
  const certPath = path.join(certDir, 'api.anthropic.com.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: keyPath, cert: certPath };
  }

  try {
    fs.mkdirSync(certDir, { recursive: true, mode: 0o700 });
    // Genera certificato self-signed usando openssl (disponibile su macOS)
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes ` +
      `-subj "/CN=api.anthropic.com/O=ClaudeCodeProxy/C=IT" ` +
      `-addext "subjectAltName=DNS:api.anthropic.com,DNS:localhost,IP:127.0.0.1"`,
      { timeout: 10000 },
    );
    // Permessi restrittivi
    fs.chmodSync(keyPath, 0o600);
    fs.chmodSync(certPath, 0o644);
    console.log('[Setup] Generated self-signed cert for api.anthropic.com');
    return { key: keyPath, cert: certPath };
  } catch (err) {
    console.warn('[Setup] Failed to generate cert:', err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

/**
 * Avvia server HTTPS per Claude Desktop.
 */
let httpsServer: ReturnType<typeof import('https').createServer> | null = null;

function startHttpsServer(app: express.Application, httpsPort: number): void {
  const certs = ensureCert();
  if (!certs) {
    console.warn('[Setup] HTTPS server not started (no certs)');
    return;
  }

  try {
    const https = require('https') as typeof import('https');
    const tlsOptions = {
      key: fs.readFileSync(certs.key),
      cert: fs.readFileSync(certs.cert),
    };

    httpsServer = https.createServer(tlsOptions, app);
    httpsServer.listen(httpsPort, '127.0.0.1', () => {
      console.log(`[Proxy] HTTPS server for Desktop on https://127.0.0.1:${httpsPort}`);
    });
    httpsServer.on('error', (err: Error) => {
      console.warn(`[Setup] HTTPS server error: ${err.message}`);
    });
  } catch (err) {
    console.warn('[Setup] Failed to start HTTPS server:', err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * POST /admin/setup-desktop — scrive lo script di setup.
 * L'utente lo esegue con: sudo ~/.claude/claude-code-proxy/scripts/setup-desktop.sh
 */
function setupSystemProxyRoutes(): void {
  app.post('/admin/setup-desktop', adminAuthMiddleware, express.json(), async (_req, res) => {
    try {
      const certs = ensureCert();
      if (!certs) {
        return res.status(500).json({ error: 'Failed to generate certificate' });
      }

      const home = process.env.HOME || '';
      const setupScript = path.join(home, '.claude', 'claude-code-proxy', 'scripts', 'setup-desktop.sh');
      const httpsPort = 8743;

      const scriptContent = `#!/bin/bash
# Claude Code Proxy — Desktop setup
# Run: sudo bash "$0"

echo "=== Claude Code Proxy - Desktop Setup ==="
echo ""

# 1. /etc/hosts
if ! grep -q "api.anthropic.com" /etc/hosts 2>/dev/null; then
  echo "127.0.0.1 api.anthropic.com" >> /etc/hosts
  echo "[OK] Added api.anthropic.com to /etc/hosts"
else
  echo "[OK] api.anthropic.com already in /etc/hosts"
fi

# 2. Trust self-signed cert
CERT="${certs.cert}"
if [ -f "$CERT" ]; then
  security add-trusted-cert -d -r trustAsRoot -p ssl -k /Library/Keychains/System.keychain "$CERT" 2>/dev/null && \\
    echo "[OK] Certificate trusted in system keychain" || \\
    echo "[WARN] Could not trust certificate (may already be trusted)"
fi

# 3. pf anchor for port redirect
echo "rdr pass on lo0 inet proto tcp from any to any port 443 -> 127.0.0.1 port ${httpsPort}" > /tmp/ccp-pf.conf
if [ -f "/etc/pf.anchors/com.claudecode.proxy" ]; then
  cp /tmp/ccp-pf.conf /etc/pf.anchors/com.claudecode.proxy
else
  cp /tmp/ccp-pf.conf /etc/pf.anchors/com.claudecode.proxy 2>/dev/null
  # Add anchor to pf.conf if needed
  if ! grep -q "com.claudecode.proxy" /etc/pf.conf 2>/dev/null; then
    sed -i '' 's/rdr-anchor "com.apple\\/\\*"/rdr-anchor "com.apple\\/*"\\nrdr-anchor "com.claudecode.proxy"/' /etc/pf.conf
    sed -i '' 's/load anchor "com.apple"/load anchor "com.apple"\\nload anchor "com.claudecode.proxy"/' /etc/pf.conf
  fi
fi
/sbin/pfctl -a "com.claudecode.proxy" -f /etc/pf.anchors/com.claudecode.proxy 2>/dev/null
/sbin/pfctl -e 2>/dev/null
echo "[OK] pf: port 443 → ${httpsPort}"

rm -f /tmp/ccp-pf.conf

echo ""
echo "=== Setup complete ==="
echo "Restart Claude Desktop (Cmd+Q, reopen) for changes to take effect."
echo "To verify: curl -sk https://api.anthropic.com/health"
`;

      fs.writeFileSync(setupScript, scriptContent, { mode: 0o755 });

      res.json({
        success: true,
        message: `Setup script created. Run it with: sudo bash ${setupScript}`,
        scriptPath: setupScript,
        command: `sudo bash "${setupScript}"`,
      });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to create setup script.' });
    }
  });
}

let httpServer: Server | null = null;

/**
 * Start the Express server
 */
export async function startServer(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<void> {
  migrateFromOldPath();
  setupLaunchctlEnv();
  contextRegistry.ensureDefaults();
  await loadConfigOnStartup();
  ensureAdminToken();

  return new Promise((resolve, reject) => {
    httpServer = app.listen(port, host, () => {
      logger.info({ host, port }, 'Claude Code Proxy started');
      logger.info(`Admin API:  http://${host}:${port}/admin`);
      logger.info(`Health:   http://${host}:${port}/health`);
      logger.info(`Proxy:    http://${host}:${port}/v1/*`);

      attachLogWebSocket(httpServer!);
      startHttpsServer(app, 8743);

      setupGracefulShutdown({
        httpServer: httpServer!,
        httpsServer,
        onShutdown: async () => {
          getDiscoveryService()?.stop();
          await rateLimiterService.disconnect();
          closeLogWebSocket();
        },
      });

      resolve();
    });

    httpServer.on('error', (err: Error) => {
      if (err.message.includes('EADDRINUSE')) {
        logger.error({ port }, 'Port already in use');
      } else {
        logger.error({ err: err.message }, 'Failed to start server');
      }
      reject(err);
    });
  });
}

// Start server - always starts regardless of NODE_ENV
startServer().catch(console.error);

export { app };