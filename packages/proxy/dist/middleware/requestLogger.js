/**
 * Request logging middleware — captures request metadata for every POST /v1/messages
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 *
 * Uses on-finished for SSE-safe lifecycle hooks — logs entry after response completes
 * Enrichment data (claudeTier, providerName, targetModel) set by proxy handler via req._logContext
 */
import onFinished from 'on-finished';
import { requestLogService } from '../services/requestLog.js';
/**
 * Express middleware that logs POST /v1/messages requests
 * Skips all other paths and methods
 */
export function requestLoggerMiddleware(req, res, next) {
    // Guard: only log POST /v1/messages
    if (req.path !== '/v1/messages' || req.method !== 'POST') {
        return next();
    }
    const startTime = Date.now();
    const requestModel = req.body?.model || 'unknown';
    const requestBodyPreview = requestLogService.truncateBody(req.body);
    // Set up on-finished callback — logs entry after response completes (SSE-safe)
    onFinished(res, (err) => {
        const durationMs = Date.now() - startTime;
        const status = err ? 'error' : res.statusCode >= 400 ? 'error' : 'success';
        // Read enrichment data set by proxy handler after route resolution
        const logContext = req._logContext || {};
        requestLogService.addEntry({
            timestamp: new Date().toISOString(),
            requestModel,
            claudeTier: logContext.claudeTier,
            providerName: logContext.providerName,
            targetModel: logContext.targetModel,
            status,
            durationMs,
            statusCode: res.statusCode,
            requestBodyPreview,
        });
    });
    next();
}
//# sourceMappingURL=requestLogger.js.map