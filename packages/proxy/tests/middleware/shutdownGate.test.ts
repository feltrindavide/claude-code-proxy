import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../src/services/shutdown.js', () => ({
  isShuttingDown: vi.fn(() => true),
}));

import { isShuttingDown } from '../../src/services/shutdown.js';
import { shutdownGateMiddleware } from '../../src/middleware/shutdownGate.js';

describe('shutdownGateMiddleware', () => {
  beforeEach(() => {
    vi.mocked(isShuttingDown).mockReturnValue(true);
  });

  it('returns 503 when shutting down for POST /v1/messages', () => {
    const req = { path: '/v1/messages', method: 'POST' } as Request;
    const json = vi.fn();
    const res = {
      status: vi.fn().mockReturnValue({ json }),
      setHeader: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    shutdownGateMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
