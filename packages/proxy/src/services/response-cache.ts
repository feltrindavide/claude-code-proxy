/**
 * Response cache — in-memory LRU cache for non-streaming responses.
 */

import crypto from 'crypto';

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

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

/** Deterministic JSON with sorted object keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function normalizeSystem(system: unknown): string | null {
  if (!system) return null;
  if (typeof system === 'string') return system.length > 0 ? system : null;
  if (Array.isArray(system)) {
    const text = system
      .filter((b: { type?: string }) => b.type === 'text')
      .map((b: { text?: string }) => b.text || '')
      .join('\n');
    return text.length > 0 ? text : null;
  }
  return null;
}

export class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private config: ResponseCacheConfig;

  constructor(config?: Partial<ResponseCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reconfigure(config: Partial<ResponseCacheConfig>): void {
    this.config = { ...this.config, ...config };
    while (this.cache.size > this.config.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  getConfig(): ResponseCacheConfig {
    return { ...this.config };
  }

  clear(): void {
    this.cache.clear();
  }

  buildKey(body: Record<string, unknown>): string {
    const relevant: Record<string, unknown> = {
      model: body.model,
      messages: body.messages,
      tools: body.tools,
      max_tokens: body.max_tokens,
    };
    const system = normalizeSystem(body.system);
    if (system) relevant.system = system;

    const hash = crypto
      .createHash('sha256')
      .update(stableStringify(relevant))
      .digest('hex');
    return hash;
  }

  shouldCache(body: Record<string, unknown>): boolean {
    if (!this.config.enabled) return false;
    if (body.stream === true) return false;
    if ((body as { thinking?: { type?: string } }).thinking?.type === 'enabled') return false;
    if (!body.model || !body.messages) return false;
    return true;
  }

  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // LRU: move to end on access
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: unknown): void {
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

export const responseCache = new ResponseCache();
