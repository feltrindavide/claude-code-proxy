/**
 * Token counter cache tests
 */

import { describe, it, expect } from 'vitest';
import { countRequestTokens } from '../../src/services/token-counter.js';

describe('countRequestTokens cache', () => {
  const messages = [{ role: 'user', content: 'Hello world' }];

  it('returns consistent counts for identical payloads', () => {
    const a = countRequestTokens(messages, 'system prompt', []);
    const b = countRequestTokens(messages, 'system prompt', []);
    expect(a.total).toBe(b.total);
    expect(a.total).toBeGreaterThan(0);
  });

  it('differs when messages change', () => {
    const a = countRequestTokens(messages, null, null);
    const b = countRequestTokens(
      [{ role: 'user', content: 'Hello world with more text' }],
      null,
      null,
    );
    expect(b.total).toBeGreaterThan(a.total);
  });
});
