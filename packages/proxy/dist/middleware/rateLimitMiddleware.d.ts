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
/**
 * Express middleware that queues POST /v1/messages requests through Bottleneck
 * Skips all other paths and methods
 * Resolves provider name from request body model via providerService.resolveModelRoute
 */
export declare function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=rateLimitMiddleware.d.ts.map