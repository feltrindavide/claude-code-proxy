/**
 * RateLimiterService — per-provider Bottleneck rate limiter with persistence
 * Phase: 05-reliability-polish
 * Plan: 05-01
 *
 * Uses Bottleneck.Group keyed by provider name for per-provider rate limiting.
 * Requests exceeding the rate limit are queued (not rejected with 429) per D-60.
 * Rate limits are configurable per provider and persisted to disk via atomic writes.
 * Default rate limit: 60 requests/minute per provider per D-62.
 */

import Bottleneck from 'bottleneck';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import os from 'os';

// Constants
const DEFAULT_RPM = 60; // D-62
const CONFIG_DIR = join(os.homedir(), '.claude', 'claude-code-proxy');
const CONFIG_FILE = join(CONFIG_DIR, 'data', 'rate-limits.json');

/**
 * RateLimiterService — manages per-provider rate limiting via Bottleneck
 *
 * configureProvider: sets rate limit for a provider, persists to disk
 * schedule: queues request through Bottleneck, auto-configures with DEFAULT_RPM if not set
 * getRateLimit: returns configured or default RPM
 * getAllRateLimits: returns all configured limits as Record<string, number>
 * removeProvider: cleans up limiter and config entry
 * persist/load: atomic write pattern for config persistence
 */
export class RateLimiterService {
  private group: Bottleneck.Group;
  private config: Map<string, number>;

  constructor() {
    this.group = new Bottleneck.Group({
      maxConcurrent: 1,
      minTime: 0,
      highWater: 100, // Cap queue at 100 to prevent OOM (T-05-02)
    });
    this.config = new Map();
    this.load();
  }

  /**
   * Set rate limit for a provider
   * Uses rpm ?? DEFAULT_RPM if not specified
   * Persists config to disk after update
   */
  configureProvider(providerName: string, rpm?: number): void {
    const limit = rpm ?? DEFAULT_RPM;
    this.config.set(providerName, limit);

    const limiter = this.group.key(providerName);
    limiter.updateSettings({
      reservoir: limit,
      reservoirRefreshAmount: limit,
      reservoirRefreshInterval: 60000, // 60 seconds
      maxConcurrent: 1,
      minTime: Math.floor(60000 / limit), // Spread evenly across the minute
    });

    this.persist();
  }

  /**
   * Schedule a request through the Bottleneck limiter
   * Auto-configures with DEFAULT_RPM if not already configured
   * Queues requests when rate limit exceeded (does NOT reject with 429)
   */
  async schedule<T>(providerName: string, fn: () => Promise<T>): Promise<T> {
    if (!this.config.has(providerName)) {
      this.configureProvider(providerName, DEFAULT_RPM);
    }
    return this.group.key(providerName).schedule(fn);
  }

  /**
   * Remove provider limiter and config entry
   * Cleans up Bottleneck key and persisted config
   */
  removeProvider(providerName: string): void {
    this.group.deleteKey(providerName);
    this.config.delete(providerName);
    this.persist();
  }

  /**
   * Get rate limit for a provider
   * Returns configured RPM or DEFAULT_RPM if not configured
   */
  getRateLimit(providerName: string): number {
    return this.config.get(providerName) ?? DEFAULT_RPM;
  }

  /**
   * Get all configured rate limits
   * Returns Record<string, number> of provider name → RPM
   */
  getAllRateLimits(): Record<string, number> {
    return Object.fromEntries(this.config);
  }

  /**
   * Load persisted config from disk
   * Reads CONFIG_FILE if exists, parses JSON, calls configureProvider for each entry
   * Graceful first-run: returns silently if file doesn't exist
   */
  private load(): void {
    try {
      if (!existsSync(CONFIG_FILE)) {
        return;
      }
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const data = JSON.parse(content) as Record<string, number>;
      for (const [providerName, rpm] of Object.entries(data)) {
        this.configureProvider(providerName, rpm);
      }
    } catch (error) {
      console.error('[RateLimiter] Error loading config:', error);
    }
  }

  /**
   * Persist config to disk using atomic write pattern
   * Ensures directory exists with secure permissions (0o700)
   * Writes to temp file then renames to final path (atomic on POSIX)
   */
  private persist(): void {
    // Ensure directory exists with secure permissions
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }

    // Atomic write: temp file + renameSync
    const tempPath = `${CONFIG_FILE}.tmp`;
    const content = JSON.stringify(Object.fromEntries(this.config), null, 2);
    writeFileSync(tempPath, content, { mode: 0o600 });
    renameSync(tempPath, CONFIG_FILE);
  }
}

// Singleton instance
export const rateLimiterService = new RateLimiterService();
