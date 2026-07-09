/**
 * Admin API routes
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 3
 * 
 * Per D-05: Admin endpoints:
 *   - GET /admin/config → return config (keys masked)
 *   - PUT /admin/config → save config
 *   - GET /admin/providers → list providers (keys masked)
 *   - POST /admin/providers → add provider
 *   - DELETE /admin/providers/:id → remove provider
 *   - GET /admin/routes → list routes
 *   - PUT /admin/routes → update routes
 */

import { Router, json as expressJson } from 'express';
import { configService, providerNameSchema, urlSchema, modelNameSchema, proxyConfigSchema } from '../services/config.js';
import { setKey, getKey, hasKey, deleteKey } from '../services/keychain.js';
import { providerService } from '../services/provider.js';
import { providerValidatorService } from '../services/provider-validator.js';
import { requestLogService } from '../services/requestLog.js';
import { rateLimiterService } from '../services/rateLimiter.js';
import { validationStoreService } from '../services/validationStore.js';
import { writeModelEnvFile } from '../services/modelEnv.js';
import { contextRegistry } from '../services/context-registry.js';
import { responseCache } from '../services/response-cache.js';
import { ensureAdminToken, isLocalhostRequest } from '../services/admin-auth.js';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import { getSessionUsage } from '../services/session-tracker.js';
import { lastContextUsage, getCurrentSessionUsage } from '../proxy.js';
import { getDiscoveryService } from '../services/discovery-registry.js';
import { checkProviderHealth } from '../services/provider-health.js';
import { getMetricsText } from '../metrics/prometheus.js';
import { getMetricsSummary } from '../services/metrics-summary.js';
import { listConfigAudit, loadConfigSnapshot, recordConfigAudit } from '../services/config-audit.js';
import { circuitBreakerService } from '../services/circuit-breaker.js';
import { resolveBindHost, resolvePort } from '../services/network.js';
import { latencyTracker } from '../services/latency-tracker.js';
import { runModelBenchmark } from '../services/model-benchmark.js';
import { importOpenRouterCatalog } from '../services/openrouter-import.js';
import { subscribeContextStream } from '../services/context-broadcast.js';
import { reloadRuntimeConfig } from '../services/runtime-config.js';
import {
  getAdminMtlsStatus,
  adminMtlsCertsReady,
  getAdminMtlsDir,
} from '../services/admin-mtls.js';
import { logger } from '../lib/logger.js';
import fs from 'fs';
import path from 'path';
import {
  resolvePluginPaths,
  syncSkillFile,
  syncScriptFile,
} from '../services/plugin-installer.js';
import { z } from 'zod';

const router = Router();

const bootstrapAttempts = new Map<string, { count: number; resetAt: number }>();
const BOOTSTRAP_WINDOW_MS = 60_000;
const BOOTSTRAP_MAX = 10;

function checkBootstrapRateLimit(req: import('express').Request): boolean {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = bootstrapAttempts.get(key);
  if (!entry || now >= entry.resetAt) {
    bootstrapAttempts.set(key, { count: 1, resetAt: now + BOOTSTRAP_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= BOOTSTRAP_MAX;
}

/**
 * GET /admin/auth/bootstrap
 * Returns admin token for localhost clients only (dashboard, hooks).
 */
router.get('/auth/bootstrap', (req, res) => {
  if (!isLocalhostRequest(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!checkBootstrapRateLimit(req)) {
    return res.status(429).json({ error: 'Too many bootstrap requests' });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  logger.info({ remote: req.socket.remoteAddress }, 'Admin bootstrap token issued');
  res.json({ token: ensureAdminToken() });
});

router.use(adminAuthMiddleware);

// Input validation schemas — aligned with configService (same rules as disk persistence)
const providerSchema = z.object({
  name: providerNameSchema,
  baseUrl: urlSchema,
  keyId: providerNameSchema,
  providerType: z.string().min(1).max(50).optional(),
  models: z.array(modelNameSchema),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(100),
  autoDiscovered: z.boolean().optional(),
});

const routeSchema = z.object({
  claudeTier: z.enum(['opus', 'sonnet', 'haiku', 'fable']),
  providerName: providerNameSchema,
  targetModel: modelNameSchema,
});

// Rate limit validation schema (T-05-03: enforces 1-1000 RPM range)
const rateLimitSchema = z.object({
  requestsPerMinute: z.number().int().min(1).max(1000),
});

const routeExperimentSchema = z.object({
  id: z.string().min(1).max(50),
  tier: z.enum(['opus', 'sonnet', 'haiku', 'fable']),
  enabled: z.boolean(),
  variants: z.array(z.object({
    name: z.string().min(1).max(50),
    weight: z.number().min(0).max(100),
    providerName: z.string().min(1),
    targetModel: z.string().min(1),
  })).min(1),
  stickyKey: z.enum(['session', 'user']).optional(),
});

/**
 * GET /admin/config
 * Return current config (keyId values only, not actual keys per D-14)
 */
router.get('/config', (req, res) => {
  try {
    const config = configService.load();
    res.json(config);
  } catch (error) {
    console.error('[Admin] Error loading config:', error);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

/**
 * PUT /admin/config
 * Save config and reload provider service
 */
router.put('/config', (req, res) => {
  try {
    const parsed = proxyConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      return res.status(400).json({ error: `Invalid config: ${details}` });
    }

    configService.save(parsed.data);
    providerService.reload(parsed.data.providers || [], parsed.data.routes || []);

    // Sync context registry with updated models
    contextRegistry.syncFromConfig(providerService.getProviders());
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error saving config:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

/**
 * GET /admin/providers
 * List all providers (keys masked, actual keys never returned per D-14)
 */
router.get('/providers', async (req, res) => {
  try {
    const config = configService.load();
    providerService.reload(config.providers, config.routes);

    const providers = providerService.getProviders();
    
    // For each provider, mask the key for display
    const masked = await Promise.all(providers.map(async (p) => {
      const keyExists = await hasKey(p.name);
      return {
        name: p.name,
        baseUrl: p.baseUrl,
        keyId: p.keyId,
        keyMask: keyExists ? '••••' : null, // AUTH-03: masked display
        models: p.models,
        enabled: p.enabled,
        priority: p.priority,
        providerType: p.providerType || 'Custom',
        autoDiscovered: p.autoDiscovered || false,
      };
    }));
    
    res.json(masked);
  } catch (error) {
    console.error('[Admin] Error listing providers:', error);
    res.status(500).json({ error: 'Failed to list providers' });
  }
});

/**
 * POST /admin/providers
 * Add new provider, store key in Keychain
 */
router.post('/providers', async (req, res) => {
  try {
    const { name, baseUrl, keyId, models, apiKey, enabled, priority } = req.body;

    const providerEntry = {
      name,
      baseUrl,
      keyId: keyId || name,
      providerType: req.body.providerType,
      models: models || [],
      enabled: enabled ?? true,
      priority: priority ?? 1,
    };

    const parse = providerSchema.safeParse(providerEntry);
    if (!parse.success) {
      return res.status(400).json({
        error: parse.error.errors.map((e) => e.message).join(', '),
      });
    }

    // Store actual key in Keychain (D-08, D-09)
    if (apiKey) {
      await setKey(name, apiKey);
    }

    // Persist to config.json first — avoid ghost providers in memory if save fails
    const config = configService.load();
    const existingIndex = config.providers.findIndex((p) => p.name === name);
    if (existingIndex >= 0) {
      config.providers[existingIndex] = providerEntry;
    } else {
      config.providers.push(providerEntry);
    }
    configService.save(config);

    providerService.registerProvider(providerEntry);

    // Sync context registry with updated models (usa providerService, non config.json)
    contextRegistry.syncFromConfig(providerService.getProviders());

    // Validate provider connectivity on save (per D-22)
    // Log warning on failure but don't block — user may fix later
    let validation: { valid: boolean; error?: string } | undefined;
    try {
      validation = await providerValidatorService.validateProvider(
        name,
        baseUrl,
      );
      if (!validation.valid) {
        console.warn(
          `[Admin] Provider validation warning for ${name}: ${validation.error}`,
        );
      }
    } catch (error) {
      console.warn(
        `[Admin] Provider validation error for ${name}:`,
        error,
      );
      validation = {
        valid: false,
        error: 'Validation could not be completed',
      };
    }

    res.json({
      success: true,
      keyId: name,
      validation: validation,
    });
  } catch (error) {
    console.error('[Admin] Error adding provider:', error);
    const message = error instanceof Error ? error.message : 'Failed to add provider';
    res.status(500).json({ error: message.replace(/^Invalid config: /, '') || 'Failed to add provider' });
  }
});

/**
 * PATCH /admin/providers/:id/models — update model list without touching API key
 */
router.patch('/providers/:id/models', (req, res) => {
  try {
    const { id } = req.params;
    const { models } = req.body as { models?: unknown };
    if (!Array.isArray(models)) {
      return res.status(400).json({ error: 'models must be an array' });
    }

    for (const model of models) {
      const parsed = modelNameSchema.safeParse(model);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.errors.map((e) => e.message).join(', '),
        });
      }
    }

    const config = configService.load();
    const provider = config.providers.find((p) => p.name === id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    provider.models = models as string[];
    configService.save(config);
    providerService.reload(config.providers, config.routes);
    contextRegistry.syncFromConfig(config.providers);

    res.json({ success: true, models: provider.models });
  } catch (error) {
    console.error('[Admin] Error patching provider models:', error);
    const message = error instanceof Error ? error.message : 'Failed to update models';
    res.status(500).json({ error: message.replace(/^Invalid config: /, '') || 'Failed to update models' });
  }
});

/**
 * DELETE /admin/providers/:id
 * Remove provider and its Keychain entry
 */
router.delete('/providers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete Keychain entry
    await deleteKey(id);

    // Delete from provider registry
    providerService.deleteProvider(id);

    // Clean up rate limiter for deleted provider
    rateLimiterService.removeProvider(id);

    // Persist to disk so deletion survives app restart
    const config = configService.load();
    config.providers = config.providers.filter(p => p.name !== id);
    configService.save(config);

    // Sync context registry after provider removal
    contextRegistry.syncFromConfig(providerService.getProviders());

    console.log(`[Admin] Provider ${id} deleted and config saved`);

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error deleting provider:', error);
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

/**
 * POST /admin/providers/validate-dry
 * Test provider credentials without saving config (no keychain/config side effects).
 * Must be registered before /providers/:id/validate to avoid route shadowing.
 */
router.post('/providers/validate-dry', async (req, res) => {
  try {
    const { name, baseUrl, apiKey, providerType } = req.body as {
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      providerType?: string;
    };

    if (!name?.trim() || !baseUrl?.trim()) {
      return res.status(400).json({ error: 'name and baseUrl are required' });
    }

    try {
      new URL(baseUrl);
    } catch {
      return res.status(400).json({ error: 'baseUrl must be a valid URL' });
    }

    const result = await providerValidatorService.validateProviderInline(
      providerType || 'Custom',
      baseUrl,
      apiKey,
    );

    res.json(result);
  } catch (error) {
    console.error('[Admin] Error in dry-run validation:', error);
    res.status(500).json({ error: 'Failed to validate provider' });
  }
});

/**
 * POST /admin/providers/:id/validate
 * Validate provider connectivity (per D-22)
 */
router.post('/providers/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = providerService.getProvider(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const result = await providerValidatorService.validateProvider(
      provider.name,
      provider.baseUrl,
    );

    // Update validation store so UI reflects current state
    validationStoreService.updateResult(id, result);

    res.json(result);
  } catch (error) {
    console.error('[Admin] Error validating provider:', error);
    res.status(500).json({ error: 'Failed to validate provider' });
  }
});

/**
 * GET /admin/providers/:id/health
 * Lightweight health probe with cached latency and circuit state.
 */
router.get('/providers/:id/health', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = providerService.getProvider(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    const health = await checkProviderHealth(provider);
    res.json(health);
  } catch (error) {
    logger.error({ err: error }, 'Provider health check failed');
    res.status(500).json({ error: 'Failed to check provider health' });
  }
});

/**
 * GET /admin/metrics
 * Prometheus metrics (admin auth required).
 */
router.get('/metrics', async (_req, res) => {
  try {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(await getMetricsText());
  } catch (error) {
    logger.error({ err: error }, 'Failed to export metrics');
    res.status(500).json({ error: 'Failed to export metrics' });
  }
});

/**
 * GET /admin/providers/:id/models
 * Scan provider for available models (calls /v1/models on the provider)
 */
router.get('/providers/:id/models', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = providerService.getProvider(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const result = await providerValidatorService.validateProvider(
      provider.name,
      provider.baseUrl,
    );

    // Update validation store so UI reflects current state
    validationStoreService.updateResult(id, result);

    if (result.valid && result.models) {
      res.json({ models: result.models });
    } else {
      res.status(502).json({ error: result.error || 'Failed to fetch models' });
    }
  } catch (error) {
    console.error('[Admin] Error scanning models:', error);
    res.status(500).json({ error: 'Failed to scan models' });
  }
});

/**
 * GET /admin/routes
 * List model routes
 */
router.get('/routes', (req, res) => {
  try {
    const routes = providerService.getRoutes();
    const config = configService.load();
    res.json({ routes, subagentModel: config.subagentModel || '' });
  } catch (error) {
    console.error('[Admin] Error listing routes:', error);
    res.status(500).json({ error: 'Failed to list routes' });
  }
});

/**
 * PUT /admin/routes
 * Update model routes
 */
router.put('/routes', (req, res) => {
  try {
    const { routes, subagentModel } = req.body;
    
    if (!Array.isArray(routes)) {
      return res.status(400).json({ error: 'routes must be an array' });
    }

    for (const route of routes) {
      const validation = configService.validateRoute(route);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error || 'Invalid route' });
      }
      const r = route as { providerName?: string; targetModel?: string };
      if (!r.providerName?.trim() || !r.targetModel?.trim()) {
        return res.status(400).json({ error: 'providerName and targetModel are required for each route' });
      }
    }
    
    providerService.setRoutes(routes);
    
    // Also update config
    const config = configService.load();
    config.routes = routes;
    if (subagentModel !== undefined) {
      config.subagentModel = subagentModel;
    }
    configService.save(config);

    // Update env var file for Claude Code model picker
    writeModelEnvFile();

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error updating routes:', error);
    res.status(500).json({ error: 'Failed to update routes' });
  }
});

/**
 * GET /admin/config/export
 * Export current config with masked API keys (D-50)
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-02
 */
router.get('/config/export', (req, res) => {
  try {
    const exported = configService.exportConfig();
    res.json(exported);
  } catch (error) {
    console.error('[Admin] Error exporting config:', error);
    res.status(500).json({ error: 'Failed to export config' });
  }
});

/**
 * POST /admin/config/import
 * Import config with validation, auto-backup, and reload (D-51, D-52, D-53)
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-02
 */
router.post('/config/import', (req, res) => {
  try {
    const { data, strategy } = req.body;
    if (!data || !strategy || !['merge', 'replace'].includes(strategy)) {
      return res.status(400).json({ error: 'data and strategy (merge|replace) are required' });
    }

    // Auto-backup current config before changes (D-53)
    const backupPath = configService.createBackup();
    console.log(`[Admin] Config backup created: ${backupPath}`);

    // Import with validation (D-52)
    const imported = configService.importConfig(data, strategy as 'merge' | 'replace');
    configService.save(imported);

    // Reload provider service with new config
    providerService.reload(imported.providers || [], imported.routes || []);

    // Sync context registry with imported models
    contextRegistry.syncFromConfig(imported.providers || []);

    res.json({ success: true, backupPath });
  } catch (error) {
    console.error('[Admin] Error importing config:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to import config' });
  }
});

/**
 * GET/PUT /admin/auto-compact
 * Soglia percentuale per auto-compact (0-1, default 0.7)
 */
router.get('/auto-compact', (req, res) => {
  try {
    const config = configService.load();
    res.json({
      threshold: config.autoCompactThreshold ?? 0.7,
      mode: config.autoCompactMode ?? 'suggest',
    });
  } catch (error) {
    console.error('[Admin] Error loading auto-compact threshold:', error);
    res.status(500).json({ error: 'Failed to load threshold' });
  }
});

router.put('/auto-compact', (req, res) => {
  try {
    const threshold = req.body.threshold !== undefined
      ? parseFloat(req.body.threshold)
      : undefined;
    const mode = req.body.mode;

    if (threshold !== undefined && (isNaN(threshold) || threshold < 0 || threshold > 1)) {
      return res.status(400).json({ error: 'threshold must be a number between 0 and 1' });
    }
    if (mode !== undefined && mode !== 'suggest' && mode !== 'trigger') {
      return res.status(400).json({ error: 'mode must be suggest or trigger' });
    }

    const config = configService.load();
    if (threshold !== undefined) config.autoCompactThreshold = threshold;
    if (mode !== undefined) config.autoCompactMode = mode;
    configService.save(config);
    res.json({
      success: true,
      threshold: config.autoCompactThreshold ?? 0.7,
      mode: config.autoCompactMode ?? 'suggest',
    });
  } catch (error) {
    console.error('[Admin] Error saving auto-compact threshold:', error);
    res.status(500).json({ error: 'Failed to save threshold' });
  }
});

const aliasSchema = z.record(z.string());

/**
 * GET /admin/aliases — user-friendly model aliases
 */
router.get('/aliases', (_req, res) => {
  const config = configService.load();
  res.json({ aliases: config.aliases ?? {} });
});

/**
 * PUT /admin/aliases — update model aliases (fast, smart, free, custom)
 */
router.put('/aliases', expressJson(), (req, res) => {
  const parsed = aliasSchema.safeParse(req.body.aliases ?? req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors });
  }

  const aliases: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (typeof value === 'string' && value.trim()) {
      aliases[key] = value.trim();
    }
  }

  const config = configService.load();
  config.aliases = aliases;
  configService.save(config);
  res.json({ success: true, aliases });
});

/**
 * POST /admin/config/diff
 * Return current (masked) vs incoming config for frontend diffing
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-02
 */
router.post('/config/diff', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }
    const current = configService.exportConfig();
    res.json({ current, incoming: data });
  } catch (error) {
    console.error('[Admin] Error generating diff:', error);
    res.status(500).json({ error: 'Failed to generate diff' });
  }
});

/**
 * GET /admin/logs
 * Return all request log entries (max 50, ring buffer)
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 */
router.get('/logs', (req, res) => {
  try {
    const entries = requestLogService.getAll();
    res.json(entries);
  } catch (error) {
    console.error('[Admin] Error loading request logs:', error);
    res.status(500).json({ error: 'Failed to load request logs' });
  }
});

/**
 * GET /admin/rate-limits
 * Return all provider rate limits
 * Phase: 05-reliability-polish
 * Plan: 05-01
 */
router.get('/rate-limits', (req, res) => {
  try {
    const limits = rateLimiterService.getAllRateLimits();
    res.json(limits);
  } catch (error) {
    console.error('[Admin] Error loading rate limits:', error);
    res.status(500).json({ error: 'Failed to load rate limits' });
  }
});

/**
 * GET /admin/providers/:id/rate-limit
 * Return rate limit for a specific provider
 * Phase: 05-reliability-polish
 * Plan: 05-01
 */
router.get('/providers/:id/rate-limit', (req, res) => {
  try {
    const { id } = req.params;
    const rpm = rateLimiterService.getRateLimit(id);
    res.json({ providerName: id, requestsPerMinute: rpm });
  } catch (error) {
    console.error('[Admin] Error loading rate limit:', error);
    res.status(500).json({ error: 'Failed to load rate limit' });
  }
});

/**
 * PUT /admin/providers/:id/rate-limit
 * Update rate limit for a specific provider (1-1000 RPM, zod validated)
 * Phase: 05-reliability-polish
 * Plan: 05-01
 */
router.put('/providers/:id/rate-limit', (req, res) => {
  try {
    const { id } = req.params;
    const parse = rateLimitSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: parse.error.errors });
    }
    rateLimiterService.configureProvider(id, parse.data.requestsPerMinute);
    res.json({ success: true, providerName: id, requestsPerMinute: parse.data.requestsPerMinute });
  } catch (error) {
    console.error('[Admin] Error updating rate limit:', error);
    res.status(500).json({ error: 'Failed to update rate limit' });
  }
});

/**
 * DELETE /admin/providers/:id/rate-limit
 * Remove rate limit for a deleted provider
 * Phase: 05-reliability-polish
 * Plan: 05-01
 */
router.delete('/providers/:id/rate-limit', (req, res) => {
  try {
    const { id } = req.params;
    rateLimiterService.removeProvider(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error removing rate limit:', error);
    res.status(500).json({ error: 'Failed to remove rate limit' });
  }
});

/**
 * GET /admin/validation-results
 * Return persisted validation results for UI display
 * Phase: 05-reliability-polish
 * Plan: 05-02
 */
router.get('/validation-results', (req, res) => {
  try {
    const results = validationStoreService.getResults();
    res.json(results);
  } catch (error) {
    console.error('[Admin] Error loading validation results:', error);
    res.status(500).json({ error: 'Failed to load validation results' });
  }
});

/**
 * POST /admin/validation-results/:id/dismiss
 * Dismiss a validation warning for a provider
 * Phase: 05-reliability-polish
 * Plan: 05-02
 */
router.post('/validation-results/:id/dismiss', (req, res) => {
  try {
    const { id } = req.params;
    validationStoreService.dismissWarning(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error dismissing warning:', error);
    res.status(500).json({ error: 'Failed to dismiss warning' });
  }
});

/**
 * GET /admin/thinking-config
 * Return current thinking filter configuration
 */
router.get('/thinking-config', (req, res) => {
  try {
    const config = configService.load();
    res.json(config.thinking || {});
  } catch (error) {
    console.error('[Admin] Error loading thinking config:', error);
    res.status(500).json({ error: 'Failed to load thinking config' });
  }
});

/**
 * PUT /admin/thinking-config
 * Update thinking filter configuration
 */
router.put('/thinking-config', (req, res) => {
  try {
    const config = configService.load();
    config.thinking = req.body;
    configService.save(config);
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error saving thinking config:', error);
    res.status(500).json({ error: 'Failed to save thinking config' });
  }
});

/**
 * GET /admin/cache-config
 * Return current response cache configuration
 */
router.get('/cache-config', (req, res) => {
  try {
    const config = configService.load();
    res.json(config.responseCache || { enabled: true, ttlMs: 10000, maxEntries: 50 });
  } catch (error) {
    console.error('[Admin] Error loading cache config:', error);
    res.status(500).json({ error: 'Failed to load cache config' });
  }
});

/**
 * PUT /admin/cache-config
 * Update response cache configuration
 */
router.put('/cache-config', (req, res) => {
  try {
    const config = configService.load();
    config.responseCache = req.body;
    configService.save(config);
    responseCache.reconfigure(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error saving cache config:', error);
    res.status(500).json({ error: 'Failed to save cache config' });
  }
});

/**
 * GET /admin/context — per-session context usage
 */
router.get('/context', (req, res) => {
  const ctx = contextRegistry.load();
  const sessionId = req.query.session as string | undefined;
  const usage = sessionId
    ? getSessionUsage(sessionId)
    : getCurrentSessionUsage() || lastContextUsage;
  res.json({ lastUsage: usage || null, config: ctx });
});

router.put('/context', expressJson(), (req, res) => {
  try {
    const ctx = contextRegistry.load();
    if (Array.isArray(req.body.models)) {
      ctx.models = req.body.models;
    }
    if (req.body.claude && typeof req.body.claude === 'object') {
      for (const [tier, context] of Object.entries(req.body.claude)) {
        if (['opus', 'sonnet', 'haiku', 'fable'].includes(tier) && typeof context === 'number') {
          ctx.claude[tier] = context;
        }
      }
    }
    contextRegistry.save(ctx);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

/**
 * Discovery admin endpoints
 */
router.get('/discovery', (_req, res) => {
  const discovery = getDiscoveryService();
  if (!discovery) return res.json({ enabled: false, providers: [] });
  res.json({
    enabled: true,
    config: discovery.getConfig(),
    providers: discovery.getDiscoveredProviders(),
  });
});

router.post('/discovery/scan', async (_req, res) => {
  const discovery = getDiscoveryService();
  if (!discovery) return res.status(503).json({ error: 'Discovery not initialized' });
  await discovery.scan();
  res.json({ success: true, providers: discovery.getDiscoveredProviders() });
});

/**
 * GET /admin/routing-stats — latency p50/p95 per provider/model
 */
router.get('/routing-stats', (_req, res) => {
  res.json({
    latency: latencyTracker.getAllStats(),
    routes: providerService.getRoutes(),
  });
});

/**
 * GET /admin/onboarding — first-run wizard status
 */
router.get('/onboarding', (_req, res) => {
  const config = configService.load();
  res.json({
    complete: config.onboardingComplete === true,
    hasProviders: config.providers.length > 0,
    hasRoutes: config.routes.some((r) => r.providerName && r.targetModel),
  });
});

/**
 * POST /admin/onboarding/complete — mark wizard done
 */
router.post('/onboarding/complete', (_req, res) => {
  const config = configService.load();
  config.onboardingComplete = true;
  configService.save(config);
  res.json({ success: true });
});

const benchmarkSchema = z.object({
  providerName: z.string().min(1),
  targetModel: z.string().min(1),
  tier: z.enum(['opus', 'sonnet', 'haiku', 'fable']).optional(),
});

/**
 * POST /admin/benchmark — run standard probe against a model
 */
router.post('/benchmark', expressJson(), async (req, res) => {
  const parsed = benchmarkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors });
  }
  try {
    const result = await runModelBenchmark(parsed.data);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Benchmark failed');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Benchmark failed',
    });
  }
});

const importOpenRouterSchema = z.object({
  filter: z.enum(['all', 'free', 'paid']).optional(),
});

/**
 * POST /admin/providers/:id/import-openrouter — merge OpenRouter catalog
 */
router.post('/providers/:id/import-openrouter', expressJson(), async (req, res) => {
  const { id } = req.params;
  const parsed = importOpenRouterSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors });
  }
  try {
    const result = await importOpenRouterCatalog(id, parsed.data.filter ?? 'all');
    reloadRuntimeConfig();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Import failed',
    });
  }
});

/**
 * GET /admin/context/stream — SSE live context gauge
 */
router.get('/context/stream', (req, res) => {
  const sessionId = typeof req.query.session === 'string' ? req.query.session : undefined;
  subscribeContextStream(res, sessionId);
});

const networkSchema = z.object({
  host: z.string().min(1).max(253).optional(),
  port: z.number().int().min(1).max(65535).optional(),
});

/**
 * GET /admin/network — bind address policy and persisted settings
 */
router.get('/network', (_req, res) => {
  const config = configService.load();
  res.json({
    host: resolveBindHost(config.host),
    requestedHost: config.host ?? '127.0.0.1',
    port: resolvePort(config.port),
    lanBindAllowed: process.env.ALLOW_LAN_BIND === 'true',
  });
});

/**
 * PUT /admin/network — persist host/port (restart required to apply)
 */
router.put('/network', expressJson(), (req, res) => {
  const parsed = networkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors });
  }

  const config = configService.load();
  if (parsed.data.host !== undefined) {
    config.host = resolveBindHost(parsed.data.host);
  }
  if (parsed.data.port !== undefined) {
    config.port = resolvePort(parsed.data.port);
  }
  configService.save(config);
  reloadRuntimeConfig();

  res.json({
    success: true,
    host: config.host,
    port: config.port,
    restartRequired: true,
  });
});

const mtlsSchema = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1024).max(65535).optional(),
});

/**
 * GET /admin/security/mtls — mTLS admin listener status
 */
router.get('/security/mtls', (_req, res) => {
  const config = configService.load();
  const status = getAdminMtlsStatus();
  res.json({
    ...status,
    configured: config.adminMtls ?? { enabled: false, port: status.port },
    generateScript: 'scripts/generate-admin-mtls.sh',
    certDir: getAdminMtlsDir(),
  });
});

/**
 * PUT /admin/security/mtls — enable/disable mTLS admin (restart required)
 */
router.put('/security/mtls', expressJson(), (req, res) => {
  const parsed = mtlsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors });
  }

  if (parsed.data.enabled && !adminMtlsCertsReady()) {
    return res.status(400).json({
      error: 'Certificates not found. Run scripts/generate-admin-mtls.sh first.',
      certDir: getAdminMtlsDir(),
      generateScript: 'scripts/generate-admin-mtls.sh',
    });
  }

  const config = configService.load();
  config.adminMtls = {
    enabled: parsed.data.enabled,
    port: parsed.data.port ?? config.adminMtls?.port,
  };
  configService.save(config);
  reloadRuntimeConfig();

  res.json({
    success: true,
    restartRequired: true,
    ...getAdminMtlsStatus(),
    configured: config.adminMtls,
  });
});

router.put('/routing/prefs', (req, res) => {
  try {
    const config = configService.load();
    config.routing = {
      ...config.routing,
      preferLowLatency: Boolean(req.body?.preferLowLatency),
      preferLowCost: Boolean(req.body?.preferLowCost),
    };
    configService.save(config);
    reloadRuntimeConfig();
    res.json({ success: true, routing: config.routing });
  } catch (error) {
    console.error('[Admin] Error saving routing prefs:', error);
    res.status(500).json({ error: 'Failed to save routing preferences' });
  }
});

router.get('/profiles', (_req, res) => {
  const config = configService.load();
  const profiles = Object.keys((config as { profiles?: Record<string, unknown> }).profiles ?? { default: {} });
  res.json({
    activeProfile: (config as { activeProfile?: string }).activeProfile ?? 'default',
    profiles: profiles.length ? profiles : ['default'],
  });
});

router.put('/profiles/active', (req, res) => {
  try {
    const name = String(req.body?.name || 'default');
    const config = configService.load();
    if (!config.profiles) config.profiles = {};

    const snapshot = config.profiles[name] as Partial<typeof config> | undefined;
    if (!snapshot || Object.keys(snapshot).length === 0) {
      if (!config.profiles[name]) config.profiles[name] = {};
      config.activeProfile = name;
      configService.save(config);
      return res.json({ success: true, activeProfile: name, applied: false });
    }

    const merged = {
      ...config,
      ...snapshot,
      profiles: config.profiles,
      activeProfile: name,
    };
    configService.save(merged);
    providerService.reload(merged.providers || [], merged.routes || []);
    reloadRuntimeConfig();
    res.json({ success: true, activeProfile: name, applied: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to switch profile' });
  }
});

router.put('/profiles/:name', (req, res) => {
  try {
    const name = req.params.name;
    const config = configService.load();
    if (!config.profiles) config.profiles = {};

    const { providers, routes, routing, experiments, aliases, subagentModel } = config;
    config.profiles[name] = {
      providers,
      routes,
      routing,
      experiments,
      aliases,
      subagentModel,
    };
    config.activeProfile = name;
    configService.save(config);
    res.json({ success: true, profile: name });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save profile snapshot' });
  }
});

router.put('/experiments', (req, res) => {
  try {
    const experiments = req.body?.experiments;
    if (!Array.isArray(experiments)) {
      return res.status(400).json({ error: 'experiments array required' });
    }
    for (const exp of experiments) {
      const parsed = routeExperimentSchema.safeParse(exp);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
    }
    const config = configService.load();
    config.experiments = experiments;
    configService.save(config);
    reloadRuntimeConfig();
    res.json({ success: true, experiments: config.experiments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save experiments' });
  }
});

router.get('/config/audit', (_req, res) => {
  try {
    res.json({ entries: listConfigAudit(50) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load config audit log' });
  }
});

router.post('/config/rollback', (req, res) => {
  try {
    const id = String(req.body?.id || '');
    if (!id) return res.status(400).json({ error: 'id is required' });

    const current = configService.load();
    recordConfigAudit(current, 'pre_rollback', `Before rollback to ${id}`);

    const restored = loadConfigSnapshot(id);
    configService.save(restored);
    providerService.reload(restored.providers || [], restored.routes || []);
    reloadRuntimeConfig();
    recordConfigAudit(restored, 'rollback', `Restored from audit ${id}`);
    res.json({ success: true, id });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Rollback failed' });
  }
});

router.get('/metrics/summary', (_req, res) => {
  res.json(getMetricsSummary());
});

router.get('/circuit-breakers', (_req, res) => {
  const states = [...circuitBreakerService.getAllStates()].map(([provider, state]) => ({
    provider,
    state,
  }));
  res.json({ circuitBreakers: states });
});

router.post('/replay', async (req, res) => {
  try {
    if (!requestLogService.isReplayEnabled()) {
      return res.status(403).json({ error: 'Request replay is disabled. Set replayBodies: true in config.' });
    }
    const replayId = req.body?.replayId as string | undefined;
    const body = req.body?.body as unknown | undefined;
    let requestBody: unknown;

    if (replayId) {
      requestBody = requestLogService.getReplayBody(replayId);
    } else if (body) {
      requestBody = body;
    } else {
      return res.status(400).json({ error: 'replayId or body required' });
    }

    const config = configService.load();
    const port = resolvePort(config.port);
    const token = process.env.PROXY_API_TOKEN;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const upstream = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const text = await upstream.text();
    res.status(upstream.status).json({
      success: upstream.ok,
      statusCode: upstream.status,
      preview: text.slice(0, 2048),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Replay failed' });
  }
});

router.get('/providers/health', async (_req, res) => {
  try {
    const providers = providerService.getProviders();
    const results = await Promise.all(providers.map((p) => checkProviderHealth(p)));
    res.json({ providers: results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check provider health' });
  }
});

router.get('/plugins', (_req, res) => {
  const paths = resolvePluginPaths();
  const candidates = [
    path.join(process.cwd(), 'scripts/plugins/proxy-context/SKILL.md'),
    path.join(process.cwd(), '../../scripts/plugins/proxy-context/SKILL.md'),
  ];
  const bundledSkill = candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
  res.json([
    { id: 'proxy-context', installed: fs.existsSync(paths.skillDest), path: paths.skillDest },
    { id: 'proxy-context-bundled', installed: fs.existsSync(bundledSkill), path: bundledSkill },
  ]);
});

router.post('/plugins/:id/install', (req, res) => {
  try {
    const { id } = req.params;
    if (id !== 'proxy-context') {
      return res.status(404).json({ error: 'Unknown plugin' });
    }
    const paths = resolvePluginPaths();
    const candidates = [
      path.join(process.cwd(), 'scripts/plugins/proxy-context/SKILL.md'),
      path.join(process.cwd(), '../../scripts/plugins/proxy-context/SKILL.md'),
    ];
    const skillSrc = candidates.find((c) => fs.existsSync(c));
    if (!skillSrc) {
      return res.status(404).json({ error: 'Bundled plugin skill not found' });
    }
    const result = syncSkillFile(skillSrc, paths.skillDest, process.env.APP_VERSION || '1.0.0');
    const scriptCandidates = [
      path.join(process.cwd(), 'scripts/context-status.js'),
      path.join(process.cwd(), '../../scripts/context-status.js'),
    ];
    const scriptSrc = scriptCandidates.find((c) => fs.existsSync(c));
    if (scriptSrc) syncScriptFile(scriptSrc, paths.statusScriptDest);
    res.json({ success: true, result });
  } catch (error) {
    console.error('[Admin] Plugin install failed:', error);
    res.status(500).json({ error: 'Plugin install failed' });
  }
});

export default router;