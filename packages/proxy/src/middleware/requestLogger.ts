/**
 * Request logging middleware — captures request metadata for every POST /v1/messages
 */

import onFinished from 'on-finished';
import type { Request, Response, NextFunction } from 'express';
import { requestLogService } from '../services/requestLog.js';
import { notifyRequestCompleted } from '../services/config-watcher.js';
import { eventBus } from '../services/event-bus.js';
import { latencyTracker } from '../services/latency-tracker.js';
import {
  proxyRequestsTotal,
  proxyUpstreamLatencyMs,
} from '../metrics/prometheus.js';

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path !== '/v1/messages' || req.method !== 'POST') {
    return next();
  }

  const startTime = Date.now();
  const requestModel = (req.body as { model?: string })?.model || 'unknown';
  const replayId = requestLogService.storeReplayBody(req.body);
  const requestBodyPreview = requestLogService.truncateBody(req.body);
  const wantsStream = (req.body as { stream?: boolean })?.stream === true;

  onFinished(res, (err: Error | null) => {
    notifyRequestCompleted();
    const durationMs = Date.now() - startTime;
    const hadUpstreamError = (req as { hadUpstreamError?: boolean }).hadUpstreamError === true;
    const status = err || hadUpstreamError || res.statusCode >= 400 ? 'error' : 'success';
    const logContext = (req as { _logContext?: Record<string, unknown> })._logContext || {};
    const provider = (logContext.providerName as string) || 'unknown';
    const tier = (logContext.claudeTier as string) || 'unknown';

    proxyRequestsTotal.inc({
      status,
      provider,
      tier,
      stream: wantsStream ? 'true' : 'false',
    });

    const upstreamMs = (req as { _upstreamLatencyMs?: number })._upstreamLatencyMs;
    if (upstreamMs !== undefined) {
      proxyUpstreamLatencyMs.observe(
        { provider, stream: wantsStream ? 'true' : 'false' },
        upstreamMs,
      );
      const targetModel = logContext.targetModel as string | undefined;
      if (targetModel) {
        latencyTracker.record(provider, targetModel, upstreamMs);
      }
    }

    eventBus.emit('request.completed', {
      requestId: req.requestId || 'unknown',
      status,
      durationMs,
      provider,
      tier: logContext.claudeTier as import('../types/index.js').ClaudeTier | undefined,
      upstreamLatencyMs: upstreamMs,
    });

    requestLogService.addEntry({
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      requestModel,
      claudeTier: logContext.claudeTier as import('../types/index.js').ClaudeTier | undefined,
      providerName: logContext.providerName as string | undefined,
      targetModel: logContext.targetModel as string | undefined,
      status,
      durationMs,
      statusCode: res.statusCode,
      requestBodyPreview,
      replayId,
      retryCount: (req as { _retryAttempt?: number })._retryAttempt,
    });
  });

  next();
}
