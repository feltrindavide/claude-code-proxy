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
import { handleProxyRequest, lastContextUsage, getCurrentSessionUsage } from './proxy.js';
import { getSessionUsage } from './services/session-tracker.js';
import { providerService } from './services/provider.js';
import { contextRegistry } from './services/context-registry.js';
import { configService } from './services/config.js';
import { providerValidatorService } from './services/provider-validator.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.js';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware.js';
import { requestLogService } from './services/requestLog.js';
import { validationStoreService } from './services/validationStore.js';
import adminRouter from './routes/admin.js';
import type { LLMProvider, ModelRoute } from './types/index.js';

const DEFAULT_PORT = 3456;
const DEFAULT_HOST = 'localhost';

import { writeModelEnvFile } from './services/modelEnv.js';

const app = express();

// Middleware
app.use(cors());
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

// GET /providers - List all providers
app.get('/providers', (req, res) => {
  const providers = providerService.getProviders();
  // Mask sensitive data
  const safe = providers.map((p) => ({
    ...p,
    // Don't expose keyId to clients
  }));
  res.json(safe);
});

// POST /providers - Add a new provider
app.post('/providers', (req, res) => {
  const { name, baseUrl, keyId, models, enabled = true, priority = 100 } = req.body;

  if (!name || !baseUrl) {
    res.status(400).json({ error: 'name and baseUrl are required' });
    return;
  }

  const provider: LLMProvider = {
    name,
    baseUrl,
    keyId: keyId || name, // Default keyId to name if not provided
    models: models || [],
    enabled,
    priority,
  };

  providerService.registerProvider(provider);
  // Sync context registry with updated providers
  const config = configService.load();
  contextRegistry.syncFromConfig(config.providers);
  res.json({ success: true, provider: { ...provider } });
});

// DELETE /providers/:name - Remove a provider
app.delete('/providers/:name', (req, res) => {
  const { name } = req.params;
  const provider = providerService.getProvider(name);
  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }
  // Re-register as disabled (soft delete) or implement hard delete
  // For now, we'll just mark it as disabled
  providerService.registerProvider({ ...provider, enabled: false });
  // Sync context registry after provider removal
  const config = configService.load();
  contextRegistry.syncFromConfig(config.providers);
  res.json({ success: true });
});

// GET /routes - Get current routes
app.get('/routes', (req, res) => {
  // This would need a method to get routes from providerService
  // For now, return empty array as routes are set internally
  res.json([]);
});

// PUT /routes - Update routes
app.put('/routes', (req, res) => {
  const { routes } = req.body;
  if (!Array.isArray(routes)) {
    res.status(400).json({ error: 'routes must be an array' });
    return;
  }

  // Validate routes
  const validRoutes: ModelRoute[] = routes.filter(
    (r) => r.claudeTier && r.providerName && r.targetModel
  );

  providerService.setRoutes(validRoutes);
  writeModelEnvFile();
  res.json({ success: true, routes: validRoutes });
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
function installPluginOnStartup(): void {
  const pluginSrcDir = path.join(__dirname, '../plugins');
  const skillSrc = path.join(pluginSrcDir, 'proxy-context', 'SKILL.md');
  const statusScriptSrc = path.join(pluginSrcDir, 'context-status.js');
  const compactHookSrc = path.join(pluginSrcDir, 'auto-compact-hook.js');

  if (!fs.existsSync(skillSrc) && !fs.existsSync(statusScriptSrc)) return;

  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return;

  const scriptsDir = path.join(home, '.claude', 'claude-code-proxy', 'scripts');
  const skillDest = path.join(home, '.claude', 'skills', 'proxy-context', 'SKILL.md');
  const statusScriptDest = path.join(scriptsDir, 'context-status.js');
  const compactHookDest = path.join(scriptsDir, 'auto-compact-hook.js');
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const nodeBin = process.argv[0]; // full path to node binary

  let installed = false;

  // Installa SKILL.md
  if (fs.existsSync(skillSrc) && !fs.existsSync(skillDest)) {
    fs.mkdirSync(path.dirname(skillDest), { recursive: true, mode: 0o700 });
    fs.writeFileSync(skillDest, fs.readFileSync(skillSrc, 'utf-8'), { mode: 0o600 });
    console.log('[Setup] Installed proxy-context skill →', skillDest);
    installed = true;
  }

  // Installa context-status.js
  if (fs.existsSync(statusScriptSrc) && !fs.existsSync(statusScriptDest)) {
    fs.mkdirSync(scriptsDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(statusScriptDest, fs.readFileSync(statusScriptSrc, 'utf-8'), { mode: 0o755 });
    console.log('[Setup] Installed context-status script →', statusScriptDest);
    installed = true;
  }

  // Installa auto-compact-hook.js
  if (fs.existsSync(compactHookSrc) && !fs.existsSync(compactHookDest)) {
    fs.mkdirSync(scriptsDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(compactHookDest, fs.readFileSync(compactHookSrc, 'utf-8'), { mode: 0o755 });
    console.log('[Setup] Installed auto-compact hook →', compactHookDest);
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

  // Reload providers from config (per MAP-03: mappings persist across restarts)
  config.providers.forEach((p: LLMProvider) => {
    providerService.registerProvider(p);
  });

  // Set routes from config
  providerService.setRoutes(config.routes);

  // Write model env file for Claude Code
  writeModelEnvFile();

  console.log(`[Proxy] Loaded ${config.providers.length} providers, ${config.routes.length} routes from ~/.claude/claude-code-proxy/config.json`);

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

// Context tracking endpoint
app.get('/admin/context', (req, res) => {
  const ctx = contextRegistry.load();
  const sessionId = req.query.session as string | undefined;
  const usage = sessionId
    ? getSessionUsage(sessionId)           // Richiesta esplicita: SOLO quella sessione
    : getCurrentSessionUsage() || lastContextUsage; // Senza sessione: ultima attiva
  res.json({ lastUsage: usage || null, config: ctx });
});

app.put('/admin/context', express.json(), (req, res) => {
  try {
    const ctx = contextRegistry.load();
    // Sostituisce l'intera lista modelli con quella inviata (pruning)
    if (Array.isArray(req.body.models)) {
      ctx.models = req.body.models;
    }
    // Aggiorna tier Claude
    if (req.body.claude && typeof req.body.claude === 'object') {
      for (const [tier, context] of Object.entries(req.body.claude)) {
        if (['opus', 'sonnet', 'haiku'].includes(tier) && typeof context === 'number') {
          ctx.claude[tier] = context;
        }
      }
    }
    contextRegistry.save(ctx);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
 * Avvia server HTTPS per Claude Desktop (sulla porta 3457 o sulla stessa).
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
 * POST /admin/setup-desktop — configura il sistema per Claude Desktop.
 * Scrive uno script temporaneo ed esegue via osascript per evitare problemi
 * di escaping con le virgolette.
 */
function setupSystemProxyRoutes(): void {
  app.post('/admin/setup-desktop', express.json(), async (_req, res) => {
    try {
      const certs = ensureCert();
      if (!certs) {
        return res.status(500).json({ error: 'Failed to generate certificate' });
      }

      const home = process.env.HOME || '';
      const setupScript = path.join(home, '.claude', 'claude-code-proxy', 'scripts', 'setup-desktop.sh');
      const httpsPort = 3457;

      // Crea script di setup
      const scriptContent = `#!/bin/bash
# Claude Code Proxy — Desktop setup (run with sudo)

# 1. /etc/hosts entry
if ! grep -q "api.anthropic.com" /etc/hosts 2>/dev/null; then
  echo "127.0.0.1 api.anthropic.com" >> /etc/hosts
  echo "[OK] Added api.anthropic.com to /etc/hosts"
else
  echo "[OK] api.anthropic.com already in /etc/hosts"
fi

# 2. Trust self-signed cert
if [ -f "${certs.cert}" ]; then
  security add-trusted-cert -d -r trustAsRoot -p ssl -k /Library/Keychains/System.keychain "${certs.cert}" 2>/dev/null
  echo "[OK] Certificate trusted in system keychain"
fi

# 3. pf: redirect 443 → ${httpsPort}
echo "rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 443 -> 127.0.0.1 port ${httpsPort}" | /sbin/pfctl -ef - 2>/dev/null
echo "[OK] pf: port 443 → ${httpsPort}"

# 4. Enable ip forwarding
sysctl -w net.inet.ip.fw.enable=1 2>/dev/null || true

echo ""
echo "Done. Restart Claude Desktop for changes to take effect."
`;

      fs.writeFileSync(setupScript, scriptContent, { mode: 0o755 });

      // Esegui via osascript con privilegi amministratore
      execSync(
        `osascript -e 'do shell script "${setupScript}" with administrator privileges'`,
        { timeout: 120000, encoding: 'utf-8' },
      );

      res.json({
        success: true,
        message: `Claude Desktop configured. Proxy HTTPS on port ${httpsPort}. Restart Claude Desktop.`,
      });
    } catch (e: any) {
      const msg = e?.stderr?.toString() || e?.message || 'Unknown error';
      console.error('[Setup] Desktop setup failed:', msg);
      res.status(500).json({
        error: `Setup failed: ${msg}`,
      });
    }
  });
}

/**
 * Start the Express server
 */
export async function startServer(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<void> {
  // Migrazione prima di tutto: ~/.claude-code-proxy/ → ~/.claude/claude-code-proxy/
  migrateFromOldPath();
  // Imposta ANTHROPIC_BASE_URL per app GUI (Claude Desktop)
  setupLaunchctlEnv();
  // Ensure proxy-context.json esiste
  contextRegistry.ensureDefaults();
  // Load config and validate providers on startup (01-03: per D-13, MAP-03; 02-03: per D-22)
  await loadConfigOnStartup();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`[Proxy] Claude Code Proxy starting on http://${host}:${port}`);
      console.log(`[Proxy] Admin API:  http://${host}:${port}/admin`);
      console.log(`[Proxy] Health:   http://${host}:${port}/health`);
      console.log(`[Proxy] Proxy:    http://${host}:${port}/v1/*`);
      // Avvia server HTTPS per Claude Desktop (porta 3457)
      startHttpsServer(app, 3457);
      resolve();
    });

    server.on('error', (err: Error) => {
      if (err.message.includes('EADDRINUSE')) {
        console.error(`[Server] Port ${port} is already in use`);
      } else {
        console.error(`[Server] Failed to start:`, err.message);
      }
      reject(err);
    });
  });
}

// Start server - always starts regardless of NODE_ENV
startServer().catch(console.error);

export { app };