/**
 * Response cache — in-memory LRU cache for non-streaming responses.
 *
 * Keys are MD5 hashes of the request body (model + messages + tools + system + max_tokens).
 * TTL is short (default 10s) — only useful for retry windows, not long-term caching.
 *
 * Only caches non-streaming responses. Streaming would require buffering the
 * entire response before returning, which defeats the purpose.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResponseCacheConfig {
  enabled: boolean;
  ttlMs: number;
  maxEntries: number;
}

const DEFAULT_CONFIG: ResponseCacheConfig = {
  enabled: true,
  ttlMs: 10_000,
  maxEntries: 50,
};

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// ResponseCache class
// ---------------------------------------------------------------------------

export class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private config: ResponseCacheConfig;

  constructor(config?: Partial<ResponseCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Update runtime config */
  reconfigure(config: Partial<ResponseCacheConfig>): void {
    this.config = { ...this.config, ...config };
    // Prune if we're over the new max
    while (this.cache.size > this.config.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  /** Get current config (for admin API) */
  getConfig(): ResponseCacheConfig {
    return { ...this.config };
  }

  /** Clear all entries */
  clear(): void {
    this.cache.clear();
  }

  /** Build a deterministic cache key from the request body */
  buildKey(body: Record<string, unknown>): string {
    const relevant: Record<string, unknown> = {
      model: body.model,
      messages: body.messages,
      tools: body.tools,
      system: body.system,
      max_tokens: body.max_tokens,
    };
    const hash = crypto.createHash('md5').update(JSON.stringify(relevant)).digest('hex');
    return hash;
  }

  /** Check if a response should be cached (non-streaming, no thinking) */
  shouldCache(body: Record<string, unknown>): boolean {
    if (!this.config.enabled) return false;
    // Only cache non-streaming requests
    if (body.stream === true) return false;
    // Don't cache requests with thinking enabled (reasoning content varies)
    if ((body as any).thinking?.type === 'enabled') return false;
    // Don't cache error bodies
    if (!body.model || !body.messages) return false;
    return true;
  }

  /** Get cached response by key. Returns undefined on miss or expiry. */
  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  /** Store a response in cache */
  set(key: string, data: unknown): void {
    // Evict oldest entries if at capacity
    while (this.cache.size >= this.config.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.config.ttlMs,
    });
  }
}

// Singleton instance
export const responseCache = new ResponseCache();
