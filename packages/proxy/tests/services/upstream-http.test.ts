/**
 * Upstream HTTP client tests
 */

import { describe, it, expect } from 'vitest';
import { getAgentForOrigin } from '../../src/services/upstream-http.js';

describe('upstream-http', () => {
  it('reuses Agent for the same origin', async () => {
    const { upstreamFetch } = await import('../../src/services/upstream-http.js');
    const origin = 'http://example.com';

    try {
      await upstreamFetch(`${origin}/test`, { method: 'GET' });
    } catch {
      // network may fail in CI — agent should still be created
    }

    const agent1 = getAgentForOrigin(origin);
    expect(agent1).toBeDefined();

    try {
      await upstreamFetch(`${origin}/other`, { method: 'GET' });
    } catch {}

    const agent2 = getAgentForOrigin(origin);
    expect(agent2).toBe(agent1);
  });
});
