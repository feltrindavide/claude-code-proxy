import { describe, it, expect } from 'vitest';
import { buildContextPayload } from '../src/services/context-broadcast.js';

describe('context-broadcast', () => {
  it('builds payload with usage percent capped at 100', () => {
    const payload = buildContextPayload();
    expect(payload).toHaveProperty('timestamp');
    expect(payload.usagePercent).toBeGreaterThanOrEqual(0);
    expect(payload.usagePercent).toBeLessThanOrEqual(100);
    expect(payload.limit).toBeGreaterThan(0);
  });
});
