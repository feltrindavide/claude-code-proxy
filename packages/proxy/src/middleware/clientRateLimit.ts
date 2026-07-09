/**
 * Per-client IP rate limiting — returns 429 when exceeded.
 */

import type { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;

interface ClientWindow {
  count: number;
  resetAt: number;
}

const windows = new Map<string, ClientWindow>();

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function maxRequests(): number {
  const parsed = Number(process.env.PROXY_CLIENT_RPM);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_REQUESTS;
}

export function clientRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  const key = clientKey(req);
  const now = Date.now();
  let window = windows.get(key);

  if (!window || now >= window.resetAt) {
    window = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(key, window);
  }

  window.count += 1;
  const limit = maxRequests();

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - window.count)));

  if (window.count > limit) {
    res.status(429).json({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'Too many requests from this client. Try again later.',
      },
    });
    return;
  }

  next();
}

/** @internal test helper */
export function _resetClientRateLimitsForTests(): void {
  windows.clear();
}
