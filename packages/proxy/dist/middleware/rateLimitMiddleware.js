/**
 * Rate limit middleware — queues requests via Bottleneck per provider
 * Phase: 05-reliability-polish
 * Plan: 05-01
 *
 * Express middleware that intercepts POST /v1/messages requests and queues them
 * through the per-provider Bottleneck rate limiter. Requests exceeding the rate
 * limit are queued (not rejected with 429) per D-60.
 */
import { rateLimiterService } from '../services/rateLimiter.js';
import { providerService } from '../services/provider.js';
/**
 * Express middleware that queues POST /v1/messages requests through Bottleneck
 * Skips all other paths and methods
 * Resolves provider name from request body model via providerService.resolveModelRoute
 */
export async function rateLimitMiddleware(req, res, next) {
    // Guard: only apply to POST /v1/messages
    if (req.path !== '/v1/messages' || req.method !== 'POST') {
        return next();
    }
    const modelName = req.body?.model || 'claude-opus-4-20250514';
    const resolution = providerService.resolveModelRoute(modelName);
    const providerName = resolution?.provider.name || 'unknown';
    try {
        await rateLimiterService.schedule(providerName, () => new Promise((resolve) => {
            next();
            resolve();
        }));
    }
    catch (err) {
        console.error('[RateLimit] Queue error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Rate limiter error' });
        }
    }
}
//# sourceMappingURL=rateLimitMiddleware.js.map