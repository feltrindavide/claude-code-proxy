/**
 * Response cache key and LRU tests
 */

import { describe, it, expect } from 'vitest';
import { ResponseCache, stableStringify } from '../../src/services/response-cache.js';

describe('ResponseCache reconfigure', () => {
  it('respects enabled: false after reconfigure', () => {
    const cache = new ResponseCache();
    cache.reconfigure({ enabled: false, ttlMs: 10000, maxEntries: 50 });

    const body = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    };

    expect(cache.shouldCache(body)).toBe(false);
  });

  it('caches when enabled', () => {
    const cache = new ResponseCache({ enabled: true });
    const body = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    };
    expect(cache.shouldCache(body)).toBe(true);
  });
});

describe('ResponseCache buildKey', () => {
  const cache = new ResponseCache();

  it('ignores metadata in cache key', () => {
    const base = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    };
    const k1 = cache.buildKey({ ...base, metadata: { user_id: 'a' } });
    const k2 = cache.buildKey({ ...base, metadata: { user_id: 'b' } });
    expect(k1).toBe(k2);
  });

  it('treats empty system same as absent', () => {
    const base = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
    };
    expect(cache.buildKey(base)).toBe(cache.buildKey({ ...base, system: '' }));
  });

  it('LRU moves accessed entry to end', () => {
    const c = new ResponseCache({ enabled: true, maxEntries: 2, ttlMs: 60_000 });
    c.set('a', { v: 1 });
    c.set('b', { v: 2 });
    c.get('a');
    c.set('c', { v: 3 });
    expect(c.get('a')).toEqual({ v: 1 });
    expect(c.get('b')).toBeUndefined();
  });
});

describe('stableStringify', () => {
  it('sorts object keys deterministically', () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
  });
});
