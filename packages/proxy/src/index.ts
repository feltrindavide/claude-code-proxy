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
import { handleProxyRequest } from './proxy.js';
import { providerService } from './services/provider.js';
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

// Mount admin API routes (D-05)
app.use('/admin', adminRouter);

// Health check endpoint (D-02)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    port: DEFAULT_PORT,
    version: '1.0.0',
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

  console.log(`[Proxy] Loaded ${config.providers.length} providers, ${config.routes.length} routes from ~/.claude-code-proxy/config.json`);

  // Load request log from disk (04-01)
  requestLogService.load();
  console.log('[Proxy] Request log loaded from ~/.claude-code-proxy/request-log.json');

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

/**
 * Start the Express server
 */
export async function startServer(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<void> {
  // Load config and validate providers on startup (01-03: per D-13, MAP-03; 02-03: per D-22)
  await loadConfigOnStartup();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`[Proxy] Claude Code Proxy starting on http://${host}:${port}`);
      console.log(`[Proxy] Admin API:  http://${host}:${port}/admin`);
      console.log(`[Proxy] Health:   http://${host}:${port}/health`);
      console.log(`[Proxy] Proxy:    http://${host}:${port}/v1/*`);
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