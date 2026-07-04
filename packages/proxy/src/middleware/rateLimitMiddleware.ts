/**
 * Rate limit middleware — queues requests via Bottleneck per provider
 * Phase: 05-reliability-polish
 * Plan: 05-01
 *
 * Express middleware that intercepts POST /v1/messages requests and queues them
 * through the per-provider Bottleneck rate limiter. Requests exceeding the rate
 * limit are queued (not rejected with 429) per D-60.
 */

import type { Request, Response, NextFunction } from 'express';
import { rateLimiterService } from '../services/rateLimiter.js';

/** Wait until the response completes so maxConcurrent limits in-flight upstream work. */
function waitForResponseEnd(res: Response): Promise<void> {
  if (res.writableFinished) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const done = () => {
      res.removeListener('finish', done);
      res.removeListener('close', done);
      res.removeListener('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      res.removeListener('finish', done);
      res.removeListener('close', done);
      res.removeListener('error', onError);
      reject(err);
    };
    res.once('finish', done);
    res.once('close', done);
    res.once('error', onError);
  });
}

/**
 * Express middleware that queues POST /v1/messages requests through Bottleneck
 * Skips all other paths and methods
 * Uses route resolution cached on req by routeResolverMiddleware
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  const providerName = req.routeResolution?.provider.name || 'unknown';

  try {
    await rateLimiterService.schedule(providerName, () => new Promise<void>((resolve, reject) => {
      waitForResponseEnd(res).then(resolve).catch(reject);
      next();
    }));
  } catch (err) {
    console.error('[RateLimit] Queue error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Rate limiter error' });
    }
  }
}
