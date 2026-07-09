/**
 * Tracks in-flight proxy requests so config hot-reload can defer safely.
 */

import type { Request, Response, NextFunction } from 'express';

let activeRequests = 0;

export function getActiveRequestCount(): number {
  return activeRequests;
}

export function activeRequestGateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  activeRequests += 1;
  res.on('finish', () => {
    activeRequests = Math.max(0, activeRequests - 1);
  });
  res.on('close', () => {
    activeRequests = Math.max(0, activeRequests - 1);
  });
  next();
}

/** @internal test helper */
export function _resetActiveRequestCountForTests(): void {
  activeRequests = 0;
}
