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

import { Router } from 'express';
import { configService } from '../services/config.js';
import { setKey, getKey, hasKey, deleteKey } from '../services/keychain.js';
import { providerService } from '../services/provider.js';
import { providerValidatorService } from '../services/provider-validator.js';
import { requestLogService } from '../services/requestLog.js';
import { rateLimiterService } from '../services/rateLimiter.js';
import { validationStoreService } from '../services/validationStore.js';
import { writeModelEnvFile } from '../services/modelEnv.js';
import { contextRegistry } from '../services/context-registry.js';
import { z } from 'zod';

const router = Router();

// Input validation schemas
const providerSchema = z.object({
  name: z.string().min(1).max(50),
  baseUrl: z.string().url(),
  keyId: z.string().min(1).max(50),
  models: z.array(z.string()),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(100),
});

const routeSchema = z.object({
  claudeTier: z.enum(['opus', 'sonnet', 'haiku']),
  providerName: z.string().min(1),
  targetModel: z.string().min(1),
});

// Rate limit validation schema (T-05-03: enforces 1-1000 RPM range)
const rateLimitSchema = z.object({
  requestsPerMinute: z.number().int().min(1).max(1000),
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
    const config = req.body;
    
    // Validate config
    const result = configService.validateProvider(config.providers?.[0]);
    if (!result?.valid) {
      // Allow empty providers
    }
    
    configService.save(config);
    providerService.reload(config.providers || [], config.routes || []);
    
    // Sync context registry with updated models
    contextRegistry.syncFromConfig(config.providers || []);
    
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
    
    // Validate input
    const parse = providerSchema.safeParse({ name, baseUrl, keyId, models, enabled, priority });
    if (!parse.success) {
      return res.status(400).json({ error: parse.error.errors });
    }
    
    // Store actual key in Keychain (D-08, D-09)
    if (apiKey) {
      await setKey(name, apiKey);
    }
    
    // Register provider (keyId stored in config, not actual key per D-14)
    providerService.registerProvider({
      name,
      baseUrl,
      keyId: name, // Use provider name as keyId for simplicity
      providerType: req.body.providerType, // Store adapter type if provided
      models: models || [],
      enabled: enabled ?? true,
      priority: priority ?? 1,
    });

    // Persist to config.json so providers survive restarts
    const config = configService.load();
    // Update or add provider in config
    const existingIndex = config.providers.findIndex(p => p.name === name);
    const providerEntry = {
      name,
      baseUrl,
      keyId: name,
      providerType: req.body.providerType,
      models: models || [],
      enabled: enabled ?? true,
      priority: priority ?? 1,
    };
    if (existingIndex >= 0) {
      config.providers[existingIndex] = providerEntry;
    } else {
      config.providers.push(providerEntry);
    }
    configService.save(config);

    // Sync context registry with updated models
    contextRegistry.syncFromConfig(config.providers);

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
    res.status(500).json({ error: 'Failed to add provider' });
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
    contextRegistry.syncFromConfig(config.providers);

    console.log(`[Admin] Provider ${id} deleted and config saved`);

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error deleting provider:', error);
    res.status(500).json({ error: 'Failed to delete provider' });
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
    
    // Validate routes
    if (!Array.isArray(routes)) {
      return res.status(400).json({ error: 'routes must be an array' });
    }
    
    // Update provider service
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
    res.json({ threshold: config.autoCompactThreshold ?? 0.7 });
  } catch (error) {
    console.error('[Admin] Error loading auto-compact threshold:', error);
    res.status(500).json({ error: 'Failed to load threshold' });
  }
});

router.put('/auto-compact', (req, res) => {
  try {
    const threshold = parseFloat(req.body.threshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      return res.status(400).json({ error: 'threshold must be a number between 0 and 1' });
    }
    const config = configService.load();
    config.autoCompactThreshold = threshold;
    configService.save(config);
    res.json({ success: true, threshold });
  } catch (error) {
    console.error('[Admin] Error saving auto-compact threshold:', error);
    res.status(500).json({ error: 'Failed to save threshold' });
  }
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
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error saving cache config:', error);
    res.status(500).json({ error: 'Failed to save cache config' });
  }
});

export default router;