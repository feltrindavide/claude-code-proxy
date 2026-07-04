/**
 * Reject new requests while graceful shutdown is in progress.
 */

import type { Request, Response, NextFunction } from 'express';
import { isShuttingDown } from '../services/shutdown.js';

export function shutdownGateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isShuttingDown()) {
    res.setHeader('Connection', 'close');
    res.status(503).json({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Proxy is shutting down' },
    });
    return;
  }
  next();
}
