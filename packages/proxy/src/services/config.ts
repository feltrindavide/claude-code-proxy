/**
 * ConfigService — JSON persistence for proxy configuration
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 1
 * 
 * Stores config at ~/.claude/claude-code-proxy/config.json
 * Per D-13: Config stores keyId (Keychain account name), never the actual key
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync } from 'fs';
import { recordConfigAudit } from './config-audit.js';
import { join } from 'path';
import os from 'os';
import { z } from 'zod';
import type { LLMProvider, ModelRoute, ClaudeTier } from '../types/index.js';
import { eventBus } from './event-bus.js';

// Config directory and file paths
const CONFIG_DIR = join(os.homedir(), '.claude', 'claude-code-proxy');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Zod validation schemas (per RESEARCH security domain — V5 Input Validation)

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

// Model name schema: no injection chars
const modelNameSchema = z.string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9/:._-]+$/, 'Invalid model name characters');

// LLMProvider schema (per D-14: keyId stored, not actual key)
const llmProviderSchema = z.object({
  name: providerNameSchema,
  baseUrl: urlSchema,
  keyId: providerNameSchema, // Keychain account name (D-14)
  models: z.array(modelNameSchema),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(100),
});

// ModelRoute schema
const routeCandidateSchema = z.object({
  providerName: providerNameSchema,
  targetModel: modelNameSchema,
  priority: z.number().int().min(0).max(100).optional(),
  costTier: z.enum(['free', 'cheap', 'standard', 'premium']).optional(),
});

const modelRouteSchema = z.object({
  claudeTier: z.enum(['opus', 'sonnet', 'haiku']),
  providerName: providerNameSchema,
  targetModel: modelNameSchema,
  candidates: z.array(routeCandidateSchema).optional(),
  tierFallback: z.array(z.enum(['opus', 'sonnet', 'haiku'])).optional(),
});

const routeExperimentSchema = z.object({
  id: z.string().min(1).max(50),
  tier: z.enum(['opus', 'sonnet', 'haiku']),
  enabled: z.boolean(),
  variants: z.array(z.object({
    name: z.string().min(1).max(50),
    weight: z.number().min(0).max(100),
    providerName: providerNameSchema,
    targetModel: modelNameSchema,
  })).min(1),
  stickyKey: z.enum(['session', 'user']).optional(),
});

// ProxyConfig schema
export const proxyConfigSchema = z.object({
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  providers: z.array(llmProviderSchema),
  routes: z.array(modelRouteSchema),
  subagentModel: z.string().optional(),
  autoCompactThreshold: z.number().min(0).max(1).optional(),
  autoCompactMode: z.enum(['suggest', 'trigger']).optional(),
  onboardingComplete: z.boolean().optional(),
  aliases: z.record(z.string()).optional(),
  experiments: z.array(routeExperimentSchema).optional(),
  routing: z.object({
    tierFallback: z.array(z.enum(['opus', 'sonnet', 'haiku'])).optional(),
    preferLowLatency: z.boolean().optional(),
    preferLowCost: z.boolean().optional(),
  }).optional(),
  thinking: z.any().optional(),
  responseCache: z.any().optional(),
  discoveryConfig: z.any().optional(),
  adminMtls: z.object({
    enabled: z.boolean(),
    port: z.number().int().min(1024).max(65535).optional(),
  }).optional(),
  adminPortSeparation: z.boolean().optional(),
  adminHttpPort: z.number().int().min(1024).max(65535).optional(),
  activeProfile: z.string().optional(),
  profiles: z.record(z.unknown()).optional(),
});

export type AppConfig = z.infer<typeof proxyConfigSchema>;

/**
 * ConfigService — manages proxy configuration persistence
 * 
 * Load: reads from ~/.claude/claude-code-proxy/config.json
 * Save: atomic write with temp file + rename
 */
export class ConfigService {
  private configPath: string;
  private configDir: string;
  private cachedConfig: AppConfig | null = null;
  private cacheMtime = 0;

  constructor(configPath?: string) {
    this.configDir = CONFIG_DIR;
    this.configPath = configPath || CONFIG_FILE;
    eventBus.on('config.invalidate', () => this.invalidateCache());
  }

  invalidateCache(): void {
    this.cachedConfig = null;
    this.cacheMtime = 0;
  }

  /**
   * Load configuration from disk
   * Returns defaults if file doesn't exist (graceful first-run)
   */
  load(): AppConfig {
    try {
      if (!existsSync(this.configPath)) {
        return this.getDefaults();
      }

      const mtime = statSync(this.configPath).mtimeMs;
      if (this.cachedConfig && mtime === this.cacheMtime) {
        return this.cachedConfig;
      }

      const content = readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);
      
      const result = proxyConfigSchema.safeParse(parsed);
      if (!result.success) {
        console.error('[Config] Invalid config, using defaults:', result.error);
        return this.getDefaults();
      }
      
      this.cachedConfig = result.data;
      this.cacheMtime = mtime;
      return result.data;
    } catch (error) {
      console.error('[Config] Error loading config:', error);
      return this.getDefaults();
    }
  }

  /**
   * Save configuration to disk
   * Uses atomic write pattern: temp file + rename
   */
  save(config: AppConfig): void {
    // Validate before saving
    const result = proxyConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid config: ${result.error}`);
    }

    // Ensure directory exists
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }

    // Atomic write: temp file + rename
    const tempPath = `${this.configPath}.tmp`;
    const content = JSON.stringify(config, null, 2);
    writeFileSync(tempPath, content, { mode: 0o600 });
    
    // Rename to final location (atomic on POSIX)
    renameSync(tempPath, this.configPath);
    this.cachedConfig = result.data;
    try {
      this.cacheMtime = statSync(this.configPath).mtimeMs;
    } catch {
      this.cacheMtime = Date.now();
    }

    try {
      recordConfigAudit(result.data, 'save');
    } catch {
      // non-fatal audit failure
    }
  }

  /**
   * Get default configuration per D-07
   */
  getDefaults(): AppConfig {
    return {
      host: '127.0.0.1',
      port: 3456,
      providers: [],
      routes: [
        { claudeTier: 'opus', providerName: 'opencode', targetModel: 'qwen3.6' },
        { claudeTier: 'sonnet', providerName: 'openrouter', targetModel: 'mimo-v2-flash' },
        { claudeTier: 'haiku', providerName: 'opencode', targetModel: 'nvidia/nemotron-3-super-120b-a12b:free' },
      ],
      autoCompactThreshold: 0.7,
    };
  }

  /**
   * Validate a provider config (for admin API input validation)
   */
  validateProvider(provider: unknown): { valid: boolean; error?: string } {
    const result = llmProviderSchema.safeParse(provider);
    if (!result.success) {
      return { valid: false, error: result.error.errors.map(e => e.message).join(', ') };
    }
    return { valid: true };
  }

  /**
   * Validate route config (for admin API input validation)
   */
  validateRoute(route: unknown): { valid: boolean; error?: string } {
    const result = modelRouteSchema.safeParse(route);
    if (!result.success) {
      return { valid: false, error: result.error.errors.map(e => e.message).join(', ') };
    }
    return { valid: true };
  }

  /**
   * Export current config with all provider keyId values masked (D-50)
   * Returns { providers, routes, settings } — never exposes actual API keys
   */
  exportConfig(): { providers: unknown[]; routes: unknown[]; settings: { port: number } } {
    const config = this.load();
    return {
      providers: config.providers.map(p => ({ ...p, keyId: '••••' })),
      routes: config.routes,
      settings: { port: config.port ?? 3456 },
    };
  }

  /**
   * Import config data with strict zod validation (D-52)
   * Strategy 'merge': combines providers (dedup by name, incoming wins), replaces routes
   * Strategy 'replace': returns validated data directly
   */
  importConfig(data: unknown, strategy: 'merge' | 'replace'): AppConfig {
    const result = proxyConfigSchema.safeParse(data);
    if (!result.success) {
      throw new Error(
        `Invalid config: ${result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')}`
      );
    }

    if (strategy === 'replace') {
      return result.data;
    }

    // Merge strategy: combine providers (dedup by name, incoming wins), replace routes
    const current = this.load();
    const providerMap = new Map<string, typeof current.providers[number]>();

    // Add current providers first
    for (const p of current.providers) {
      providerMap.set(p.name, p);
    }
    // Incoming providers overwrite existing ones with same name
    for (const p of result.data.providers) {
      providerMap.set(p.name, p);
    }

    return {
      ...current,
      ...result.data,
      providers: Array.from(providerMap.values()),
      routes: result.data.routes,
    };
  }

  /**
   * Create a timestamped backup of the current config (D-53)
   * Returns the backup file path
   */
  createBackup(): string {
    const config = this.load();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(this.configDir, 'config-backup', `config-backup-${timestamp}.json`);

    const backupDir = join(this.configDir, 'config-backup');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    }

    writeFileSync(backupPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    return backupPath;
  }
}

// Singleton instance
export const configService = new ConfigService();