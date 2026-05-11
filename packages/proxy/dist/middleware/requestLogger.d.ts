/**
 * Request logging middleware — captures request metadata for every POST /v1/messages
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 *
 * Uses on-finished for SSE-safe lifecycle hooks — logs entry after response completes
 * Enrichment data (claudeTier, providerName, targetModel) set by proxy handler via req._logContext
 */
import type { Request, Response, NextFunction } from 'express';
/**
 * Express middleware that logs POST /v1/messages requests
 * Skips all other paths and methods
 */
export declare function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=requestLogger.d.ts.map