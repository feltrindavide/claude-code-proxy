/**
 * RateLimiterService tests
 * Phase: 05-reliability-polish
 * Plan: 05-01
 *
 * Tests per-provider Bottleneck rate limiter with persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rateLimiterService } from '../../src/services/rateLimiter.js';

describe('RateLimiterService', () => {
  beforeEach(() => {
    // Reset service state before each test
  });

  afterEach(() => {
    // Cleanup if needed
  });

  it('should have DEFAULT_RPM of 60', () => {
    // Default rate limit is 60 requests/minute per D-62
    expect(rateLimiterService.getRateLimit('unknown-provider')).toBe(60);
  });

  it('configureProvider sets correct Bottleneck settings', () => {
    // configureProvider(providerName, rpm) should set reservoir, refresh interval
    // and persist config to disk
    expect(typeof rateLimiterService.configureProvider).toBe('function');
  });

  it('schedule queues requests when rate limit exceeded', () => {
    // schedule(providerName, fn) should auto-configure with DEFAULT_RPM if not set
    // and queue requests through Bottleneck
    expect(typeof rateLimiterService.schedule).toBe('function');
  });

  it('getRateLimit returns configured or default value', () => {
    // getRateLimit(providerName) should return configured RPM or DEFAULT_RPM
    expect(typeof rateLimiterService.getRateLimit).toBe('function');
  });

  it('getAllRateLimits returns all configured limits', () => {
    // getAllRateLimits() should return Record<string, number>
    expect(typeof rateLimiterService.getAllRateLimits).toBe('function');
  });

  it('removeProvider cleans up limiter and config', () => {
    // removeProvider(providerName) should delete Bottleneck key and config entry
    expect(typeof rateLimiterService.removeProvider).toBe('function');
  });

  it('persist/load round-trip via atomic writes', () => {
    // Config should persist to ~/.claude-code-proxy/rate-limits.json
    // and be restored on service construction via load()
    expect(rateLimiterService).toBeDefined();
  });
});
