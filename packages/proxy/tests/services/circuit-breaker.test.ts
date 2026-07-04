/**
 * Circuit breaker tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreakerService } from '../../src/services/circuit-breaker.js';

describe('CircuitBreakerService', () => {
  let cb: CircuitBreakerService;

  beforeEach(() => {
    cb = new CircuitBreakerService({ failureThreshold: 3, cooldownMs: 100 });
  });

  it('opens after consecutive failures', () => {
    cb.recordFailure('p1');
    cb.recordFailure('p1');
    expect(cb.canRequest('p1')).toBe(true);
    cb.recordFailure('p1');
    expect(cb.canRequest('p1')).toBe(false);
    expect(cb.getState('p1')).toBe('open');
  });

  it('recovers to half-open after cooldown then closed on success', async () => {
    for (let i = 0; i < 3; i++) cb.recordFailure('p1');
    expect(cb.canRequest('p1')).toBe(false);
    await new Promise((r) => setTimeout(r, 150));
    expect(cb.canRequest('p1')).toBe(true);
    expect(cb.getState('p1')).toBe('half-open');
    cb.recordSuccess('p1');
    expect(cb.getState('p1')).toBe('closed');
  });
});
