/**
 * Rate limit middleware tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { Request, Response, NextFunction } from 'express';
import { rateLimitMiddleware } from '../../src/middleware/rateLimitMiddleware.js';

const scheduleMock = vi.fn();

vi.mock('../../src/services/rateLimiter.js', () => ({
  rateLimiterService: {
    schedule: (...args: unknown[]) => scheduleMock(...args),
  },
}));

function makeMockRes(): Response & EventEmitter {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    writableFinished: false,
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }) as unknown as Response & EventEmitter;
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduleMock.mockImplementation(async (_name: string, fn: () => Promise<void>) => fn());
  });

  it('skips non POST /v1/messages', async () => {
    const next = vi.fn();
    const req = { path: '/health', method: 'GET' } as Request;
    const res = makeMockRes();

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('waits for response finish before completing schedule job', async () => {
    const next = vi.fn();
    const req = {
      path: '/v1/messages',
      method: 'POST',
      routeResolution: { provider: { name: 'openrouter' } },
    } as unknown as Request;
    const res = makeMockRes();

    let jobDone = false;
    scheduleMock.mockImplementation(async (_name: string, fn: () => Promise<void>) => {
      const p = fn();
      expect(jobDone).toBe(false);
      await new Promise((r) => setTimeout(r, 10));
      res.emit('finish');
      await p;
      jobDone = true;
    });

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(jobDone).toBe(true);
    expect(scheduleMock).toHaveBeenCalledWith('openrouter', expect.any(Function));
  });
});
