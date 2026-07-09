/**
 * Custom proxy handler — replaces http-proxy-middleware passthrough
 * Phase: 02-sse-streaming-integration
 * Plan: 02-03, Task 2
 *
 * Per D-19: Custom SSE handler — intercept upstream SSE, transform to Anthropic events
 * Per D-21: Timeout: 120s streaming, 30s non-streaming
 * Per D-26: Anthropic-compatible error format
 * Per D-28: Log internally + user-friendly response
 *
 * Threat mitigations:
 * - T-02-10: emitAnthropicError sanitizes messages via getUserFacingErrorMessage()
 * - T-02-11: Uses resolution.provider.baseUrl from registry (not client request body)
 * - T-02-12: AbortController with per-adapter timeout
 */

import type { Request, Response } from 'express';
import crypto from 'crypto';
import type { RouteResolution } from './types/index.js';
import { getOrCreateAdapter } from './adapters/index.js';
import { getKey } from './services/keychain.js';
import { getUserFacingErrorMessage } from './services/sse-transformer.js';
import { parseToolArguments } from './services/response-parsers.js';
import { fetchWithRetry } from './services/retryHandler.js';
import { contextRegistry, type LastContextUsage } from './services/context-registry.js';
import { countRequestTokens, estimateOutputTokens } from './services/token-counter.js';
import type { SessionUsage } from './services/session-tracker.js';
import { extractSessionId, updateSessionUsage, getSessionUsage } from './services/session-tracker.js';
import { tryFastPath } from './services/fast-path.js';
import { responseCache } from './services/response-cache.js';
import { configService } from './services/config.js';
import { resolveThinkingMode, filterThinkingEvent, AutoModeDetector, ThinkingBlockTracker } from './services/thinking-filter.js';
import { resolveRequest } from './services/route-resolver.js';
import { upstreamFetch } from './services/upstream-http.js';
import { joinProviderUrl } from './services/provider-url.js';
import { stripAnthropicOnlyChatFields } from './services/openai-body-sanitize.js';
import { registerActiveStream } from './services/shutdown.js';
import { proxyCacheHitsTotal, proxyExperimentRequestsTotal } from './metrics/prometheus.js';
import { createRequestLogger, logger } from './lib/logger.js';
import { eventBus } from './services/event-bus.js';

class StreamFailoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamFailoverError';
  }
}

const CONCISE_SYSTEM_PROMPT =
  'Answer directly and concisely. Do NOT analyze, think step by step, or explain. Just give the answer.';

const HIGH_REASONING_MODEL_FRAGMENTS = [
  'deepseek',
  'deepseek-r1',
  'deepseek-v4',
  'kimi',
  'glm',
  'qwen',
  'nemotron',
  'minimax',
  'gemma',
];

/** Automode classifier and similar probes use haiku + a tiny max_tokens budget. */
export function shouldBoostSmallTokenBudget(
  resolution: RouteResolution,
  originalMaxTokens: number | undefined,
): boolean {
  if (originalMaxTokens === undefined || originalMaxTokens > 200) return false;

  if (resolution.claudeTier === 'haiku') return true;

  const target = resolution.targetModel.toLowerCase();
  return HIGH_REASONING_MODEL_FRAGMENTS.some((fragment) => target.includes(fragment));
}

function prependConciseSystemPrompt(providerBody: Record<string, unknown>): void {
  const messages = (providerBody.messages as Array<{ role?: string; content?: unknown }>) || [];
  const alreadyPresent = messages.some(
    (m) =>
      m.role === 'system' &&
      typeof m.content === 'string' &&
      m.content.includes('Answer directly and concisely'),
  );
  if (alreadyPresent) return;

  providerBody.messages = [{ role: 'system', content: CONCISE_SYSTEM_PROMPT }, ...messages];
}

/** Apply max_tokens boost/clamp before upstream fetch (must run before JSON.stringify). */
export function applyProviderBodyAdjustments(
  providerBody: Record<string, unknown>,
  resolution: RouteResolution,
  reqLog: ReturnType<typeof createRequestLogger>,
): void {
  const originalMaxTokens = providerBody.max_tokens as number | undefined;
  if (shouldBoostSmallTokenBudget(resolution, originalMaxTokens)) {
    const boosted = 4096;
    providerBody.max_tokens = boosted;
    prependConciseSystemPrompt(providerBody);
    reqLog.info(
      {
        from: originalMaxTokens,
        to: boosted,
        model: resolution.targetModel,
        tier: resolution.claudeTier,
      },
      'Boosted max_tokens for automode classifier / reasoning overhead',
    );
  }

  const modelInfo = contextRegistry.getModelContext(resolution.targetModel, resolution.provider.name);
  if (modelInfo && providerBody.max_tokens !== undefined) {
    const current = providerBody.max_tokens as number;
    if (current > modelInfo.max_output) {
      providerBody.max_tokens = modelInfo.max_output;
      reqLog.info(
        { from: current, to: modelInfo.max_output },
        'Clamped max_tokens to model max_output',
      );
    }
  }
}

/**
 * Emit an error response in the appropriate format (SSE or JSON)
 * Per D-26: Anthropic-compatible error format
 * Per D-28: User-friendly message, full error logged internally
 */
function markUpstreamError(req: Request): void {
  (req as { hadUpstreamError?: boolean }).hadUpstreamError = true;
}

function emitAnthropicError(res: Response, error: unknown, wantsStream?: boolean, reqId?: string, req?: Request): void {
  if (req) markUpstreamError(req);
  const log = reqId ? createRequestLogger(reqId) : logger;
  log.error({ err: error instanceof Error ? error.message : String(error) }, 'Upstream error');

  // Get sanitized user-friendly message
  const userFriendlyMessage = getUserFacingErrorMessage(error);

  if (wantsStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(
      `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: { type: 'api_error', message: userFriendlyMessage },
      })}\n\n`,
    );
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.json({
      type: 'error',
      error: { type: 'api_error', message: userFriendlyMessage },
    });
    return; // res.json() ends the response
  }
  res.end();
}

function handleUpstreamFailure(
  res: Response,
  body: Record<string, unknown>,
  error: unknown,
  reqId?: string,
  req?: Request,
): void {
  if (req) markUpstreamError(req);
  const log = reqId ? createRequestLogger(reqId) : logger;
  log.error({ err: error instanceof Error ? error.message : String(error) }, 'All route candidates failed');

  const errMsg = getUserFacingErrorMessage(error);
  const isStream = (res as any)._wantsStream;

  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    emitSSEEvent(res, 'message_start', {
      type: 'message_start',
      message: {
        id: `msg_${crypto.randomUUID()}`,
        type: 'message',
        role: 'assistant',
        content: [],
        model: body.model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 1 },
      },
    });
    emitSSEEvent(res, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });
    emitSSEEvent(res, 'content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: errMsg },
    });
    emitSSEEvent(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: 0,
    });
    emitSSEEvent(res, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { input_tokens: 0, output_tokens: estimateOutputTokens(errMsg) },
    });
    emitSSEEvent(res, 'message_stop', { type: 'message_stop' });
    res.end();
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.json({
      id: `msg_${crypto.randomUUID()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: errMsg }],
      model: body.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: estimateOutputTokens(errMsg) },
    });
  }
}

// ---------------------------------------------------------------------------
// Ogni sessione Claude Code ha il proprio tracciamento.
// ---------------------------------------------------------------------------

/**
 * Restituisce il contesto per la sessione corrente (o ultima attiva)
 */
export function getCurrentSessionUsage(): SessionUsage | null {
  return getSessionUsage();
}

export let lastContextUsage: LastContextUsage = { inputTokens: 0, outputTokens: 0, model: '', provider: '', inflation: 1 };

// Carica l'ultima sessione attiva dal disco
const saved = getSessionUsage();
if (saved) {
  lastContextUsage = saved;
  logger.info(
    { model: saved.model, tokens: saved.inputTokens + saved.outputTokens },
    'Restored session context',
  );
}

/**
 * Handle incoming /v1/messages requests
 * Full transformation pipeline: resolve → transform → fetch → transform SSE → stream
 */
export async function handleProxyRequest(
  req: Request,
  res: Response,
): Promise<void> {
  // 1. Parse model from request body
  const body = req.body || {};

  // 1a. Fast-path: short-circuit for trivially-answerable requests
  if (tryFastPath(body, res)) {
    (req as any)._logContext = {
      claudeTier: '',
      providerName: 'fast-path',
      targetModel: String(body.model ?? ''),
    };
    return;
  }

  // 1b. Response cache check: return cached response for identical non-streaming requests
  const responseCacheKey = responseCache.shouldCache(body) ? responseCache.buildKey(body) : null;
  if (responseCacheKey) {
    const cached = responseCache.get(responseCacheKey);
    if (cached) {
      proxyCacheHitsTotal.inc({ hit: 'true' });
      createRequestLogger(req.requestId || 'unknown').info(
        { model: body.model, key: responseCacheKey.slice(0, 8) },
        'Response cache HIT',
      );
      res.json(cached);
      return;
    }
    proxyCacheHitsTotal.inc({ hit: 'false' });
  }

  // Resolve route (cached on req by routeResolverMiddleware)
  const routeResult = req.resolvedRoute ?? resolveRequest(body);
  const candidates = routeResult.candidates.length > 0
    ? routeResult.candidates
    : (routeResult.resolution ? [routeResult.resolution] : []);
  const modelName = routeResult.modelName;

  if (candidates.length === 0) {
    return emitAnthropicError(
      res,
      `No route configured for model: ${modelName}`,
      body.stream === true,
      req.requestId,
      req,
    );
  }

  const reqLog = createRequestLogger(req.requestId || 'unknown', {
    model: body.model as string,
  });

  eventBus.emit('request.started', {
    requestId: req.requestId || 'unknown',
    model: modelName,
    provider: candidates[0]?.provider.name,
    tier: candidates[0]?.claudeTier,
  });

  let resolution: RouteResolution | null = null;
  let upstreamResponse: globalThis.Response | null = null;
  let apiKey: string | null = null;
  let providerBody: Record<string, unknown> = {};
  let adapter: ReturnType<typeof getOrCreateAdapter> | null = null;
  let retryAttempt = 0;
  const wantsStream = body.stream === true;
  (res as any)._wantsStream = wantsStream;
  const upstreamStart = Date.now();
  let lastUpstreamError: unknown = null;

  for (let candidateIdx = 0; candidateIdx < candidates.length; candidateIdx++) {
    const candidate = candidates[candidateIdx];
    if (candidateIdx > 0) {
      const prev = candidates[candidateIdx - 1];
      eventBus.emit('route.fallback', {
        fromProvider: prev.provider.name,
        toProvider: candidate.provider.name,
        fromModel: prev.targetModel,
        toModel: candidate.targetModel,
        reason: lastUpstreamError instanceof Error ? lastUpstreamError.message : 'upstream failure',
        requestId: req.requestId,
      });
      reqLog.warn(
        {
          from: prev.provider.name,
          to: candidate.provider.name,
          attempt: candidateIdx + 1,
        },
        'Failing over to alternate route candidate',
      );
    }

    resolution = candidate;
    apiKey = await getKey(resolution.provider.name);
    if (!apiKey) {
      lastUpstreamError = new Error(`API key not found for provider: ${resolution.provider.name}`);
      if (candidateIdx === candidates.length - 1) {
        return emitAnthropicError(
          res,
          lastUpstreamError instanceof Error ? lastUpstreamError.message : 'API key not found',
          body.stream === true,
          req.requestId,
          req,
        );
      }
      continue;
    }

    const providerType = resolution.provider.providerType || resolution.provider.name;
    adapter = getOrCreateAdapter(providerType, resolution.provider.baseUrl);
    providerBody = adapter.transformRequest(body, resolution);
    if (adapter.apiPath !== '/v1/messages') {
      stripAnthropicOnlyChatFields(providerBody);
    }
    applyProviderBodyAdjustments(providerBody, resolution, reqLog);
    const resolvedApiKey = apiKey;

    try {
      upstreamResponse = await fetchWithRetry(
        resolution.provider.name,
        async (attemptNumber) => {
          retryAttempt = attemptNumber;
          const controller = new AbortController();
          const timeoutMs = wantsStream
            ? adapter!.timeouts.streaming
            : adapter!.timeouts.nonStreaming;
          const timeout = setTimeout(() => controller.abort(), timeoutMs);

          try {
            return await upstreamFetch(
              joinProviderUrl(resolution!.provider.baseUrl, adapter!.apiPath),
              {
                method: 'POST',
                headers: adapter!.buildHeaders(resolvedApiKey, {
                  streaming: wantsStream,
                  requestId: req.requestId,
                }),
                body: JSON.stringify(providerBody),
                signal: controller.signal,
              },
            );
          } finally {
            clearTimeout(timeout);
          }
        },
        { requestId: req.requestId },
      );
    } catch (error) {
      lastUpstreamError = error;
      eventBus.emit('provider.error', {
        provider: resolution.provider.name,
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        targetModel: resolution.targetModel,
      });
      if (candidateIdx === candidates.length - 1) {
        (req as any)._upstreamLatencyMs = Date.now() - upstreamStart;
        return handleUpstreamFailure(res, body, error, req.requestId, req);
      }
      continue;
    }

    if (!resolution || !upstreamResponse || !adapter) {
      continue;
    }

  // Enrich request log with route resolution data (per D-45, 04-01)
  (req as any)._logContext = {
    claudeTier: resolution.claudeTier,
    providerName: resolution.provider.name,
    targetModel: resolution.targetModel,
    experimentId: routeResult.experimentId ?? resolution.experimentId,
    experimentVariant: routeResult.experimentVariant ?? resolution.experimentVariant,
  };

  if (resolution.fallbackTier && resolution.claudeTier) {
    res.setHeader('X-Proxy-Fallback-Tier', resolution.claudeTier);
  }
  if (resolution.experimentId) {
    res.setHeader('X-Proxy-Experiment', resolution.experimentId);
    if (resolution.experimentVariant) {
      res.setHeader('X-Proxy-Experiment-Variant', resolution.experimentVariant);
    }
    proxyExperimentRequestsTotal.inc({
      experiment: resolution.experimentId,
      variant: resolution.experimentVariant || 'unknown',
      tier: resolution.claudeTier || 'unknown',
    });
  }

  (req as any)._upstreamLatencyMs = Date.now() - upstreamStart;

  if (retryAttempt > 0) {
    (req as any)._retryAttempt = retryAttempt;
  }

  // 5. Estrai sessionId per tracking per-sessione
  const currentSessionId = extractSessionId(body);
  if (currentSessionId) {
    (req as any)._sessionId = currentSessionId;
  }

  // 5b. Calcola token di input REALI per passarli a Claude Code
  const realInputTokens = countRequestTokens(body.messages, body.system, body.tools);

  // Snapshot config for this request (avoid mid-stream hot-reload drift)
  const savedConfig = configService.load();
  (req as any)._runtimeConfig = savedConfig;

  try {
    // 7b. Decide if thinking was requested by Claude Code (high-effort mode)
    const thinkingEnabled = (body as any).thinking?.type === 'enabled';

    // 7c. Resolve thinking mode for this request
    const thinkingMode = resolveThinkingMode(
      resolution.claudeTier,
      resolution.targetModel,
      savedConfig.thinking as any,
    );
    const thinkingTracker = new ThinkingBlockTracker();
    const autoDetector = thinkingMode === 'auto' ? new AutoModeDetector(10) : null;

    // 8. Transform and stream response (provider SSE → Anthropic SSE)
    if (wantsStream) {
      registerActiveStream(res);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Calcola inflation per token output
      const inflationFactor = getInflationFactor(resolution);

      // Batch writes to reduce overhead from DeepSeek's many tiny reasoning chunks
      const buf: string[] = [];
      const STREAM_DEADLINE = 120_000; // 120s total streaming deadline
      const streamStart = Date.now();
      let outputTokens = 0;
      let streamedText = '';
      let deadlineExceeded = false;
      let streamBytesWritten = 0;

      try {
      for await (const event of adapter.transformResponse(upstreamResponse, {
        messageId: `msg_${crypto.randomUUID()}`,
        model: body.model,
        inputTokens: realInputTokens.total,
        thinkingEnabled,
      })) {
        // Global streaming deadline — prevents hanging on endless reasoning
        if (Date.now() - streamStart > STREAM_DEADLINE) {
          reqLog.warn({ deadlineMs: STREAM_DEADLINE }, 'Streaming deadline exceeded, truncating');
          deadlineExceeded = true;
          break;
        }

        // Apply thinking filter before inflation
        const effectiveMode = autoDetector?.switchedToStrip ? 'strip' : thinkingMode;
        const filteredEvent = filterThinkingEvent(event, effectiveMode, thinkingTracker, autoDetector ? { switchedToStrip: autoDetector.switchedToStrip } : undefined);

        // Track for auto mode (observe original event, before filtering)
        if (autoDetector) {
          autoDetector.observe(event);
        }

        if (filteredEvent === null) continue; // Thinking block stripped

        // Track output tokens from SSE usage events
        const tok = extractOutputTokensFromEvent(filteredEvent);
        if (tok > 0) outputTokens = Math.max(outputTokens, tok);
        const dataMatch = filteredEvent.match(/^data: (.+)$/m);
        let isContentDelta = false;
        if (dataMatch) {
          try {
            const parsed = JSON.parse(dataMatch[1]);
            if (parsed.type === 'content_block_delta') {
              isContentDelta = true;
              if (parsed.delta?.type === 'text_delta') {
                streamedText += parsed.delta.text || '';
              } else if (parsed.delta?.type === 'thinking_delta') {
                streamedText += parsed.delta.thinking || '';
              }
            }
          } catch {}
        }

        // Apply inflation to message_start (input) and message_delta (output)
        if (inflationFactor !== 1) {
          buf.push(inflateUsageTokens(filteredEvent, inflationFactor));
        } else {
          buf.push(filteredEvent);
        }

        const isBoundary =
          filteredEvent.includes('message_') || filteredEvent.includes('"error"');
        if (shouldFlushStreamBuffer({ isContentDelta, isBoundary, bufLength: buf.length })) {
          res.write(buf.join(''));
          streamBytesWritten += buf.join('').length;
          buf.length = 0;
        }
      }
      if (buf.length > 0) {
        const chunk = buf.join('');
        res.write(chunk);
        streamBytesWritten += chunk.length;
      }
      if (deadlineExceeded) {
        emitSSEEvent(res, 'message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'max_tokens', stop_sequence: null },
          usage: { output_tokens: outputTokens || 1 },
        });
        emitSSEEvent(res, 'message_stop', { type: 'message_stop' });
        markUpstreamError(req);
      }
      res.end();
      if (outputTokens === 0 && streamedText) {
        outputTokens = estimateOutputTokens(streamedText);
      }
      updateLastUsage(realInputTokens.total, outputTokens, resolution, inflationFactor, currentSessionId);
      } catch (streamError) {
        if (streamBytesWritten === 0) {
          throw new StreamFailoverError(
            streamError instanceof Error ? streamError.message : String(streamError),
          );
        }
        markUpstreamError(req);
        emitSSEEvent(res, 'message_stop', { type: 'message_stop' });
        if (!res.writableEnded) res.end();
      }
    } else {
      // Non-streaming: accumulate events into a complete JSON response
      res.setHeader('Content-Type', 'application/json');
      let contentText = '';
      let stopReason = 'end_turn';
      let toolUseId = '';
      let toolUseName = '';
      let toolUseInput = '';

      for await (const event of adapter.transformResponse(upstreamResponse, {
        messageId: `msg_${crypto.randomUUID()}`,
        model: body.model,
        inputTokens: realInputTokens.total,
        thinkingEnabled,
      })) {
        // Parse SSE event to extract data
        const dataMatch = event.match(/^data: (.+)$/m);
        if (!dataMatch) continue;
        try {
          const parsed = JSON.parse(dataMatch[1]);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            contentText += parsed.delta.text || '';
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'thinking_delta') {
            contentText += parsed.delta.thinking || '';
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
            toolUseInput += parsed.delta.partial_json || '';
          } else if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            toolUseId = parsed.content_block.id || '';
            toolUseName = parsed.content_block.name || '';
            toolUseInput = '';
          } else if (parsed.type === 'message_delta') {
            stopReason = parsed.delta?.stop_reason || 'end_turn';
          }
        } catch {}
      }

      // Build content array
      const content: any[] = [];
      if (contentText) {
        content.push({ type: 'text', text: contentText });
      }
      // Claude Code doesn't handle empty content arrays well
      if (content.length === 0 && !toolUseId) {
        content.push({ type: 'text', text: '(no output)' });
      }
      if (toolUseId) {
        const parsedInput = parseToolArguments(toolUseInput || '{}');
        let toolInput: Record<string, unknown> = {};
        try {
          toolInput = JSON.parse(parsedInput) as Record<string, unknown>;
        } catch {
          reqLog.warn({ parsedInput }, 'Malformed tool_use JSON from upstream');
        }
        content.push({
          type: 'tool_use',
          id: toolUseId,
          name: toolUseName,
          input: toolInput,
        });
      }

      const outTokens = estimateOutputTokens(contentText);
      const inflationFactor = getInflationFactor(resolution);
      const inflatedInput = Math.max(1, Math.round(realInputTokens.total * inflationFactor));
      const inflatedOutput = Math.max(1, Math.round(outTokens * inflationFactor));
      const responseBody = {
        id: `msg_${crypto.randomUUID()}`,
        type: 'message',
        role: 'assistant',
        content,
        model: body.model,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: inflatedInput, output_tokens: inflatedOutput },
      };
      res.json(responseBody);
      // Cache the response for potential retry
      if (responseCacheKey) {
        responseCache.set(responseCacheKey, responseBody);
      }
      updateLastUsage(realInputTokens.total, outTokens, resolution, inflationFactor, currentSessionId);
    }
    return;
    } catch (error) {
      if (error instanceof StreamFailoverError && candidateIdx < candidates.length - 1) {
        lastUpstreamError = error;
        reqLog.warn(
          { attempt: candidateIdx + 1, reason: error.message },
          'Mid-stream failover to next route candidate',
        );
        continue;
      }
      return handleUpstreamFailure(res, body, error, req.requestId, req);
    }
  }

  return emitAnthropicError(res, 'No upstream route available', wantsStream, req.requestId, req);
}

function emitSSEEvent(res: Response, eventType: string, data: Record<string, unknown>): void {
  res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Inflation token per contesto
// ---------------------------------------------------------------------------

/** Calcola il fattore di inflazione basato sul contesto reale del modello */
function getInflationFactor(resolution: RouteResolution): number {
  if (!resolution.claudeTier || !resolution.targetModel) return 1;
  const claudeCtx = contextRegistry.getClaudeContext(resolution.claudeTier);
  const modelCtx = contextRegistry.getModelContext(resolution.targetModel, resolution.provider.name);
  if (!modelCtx) return 1;
  return claudeCtx / modelCtx.context;
}

/** Gonfia input_tokens e output_tokens in eventi message_start e message_delta */
function inflateUsageTokens(event: string, factor: number): string {
  try {
    const match = event.match(/^data: (.+)$/m);
    if (!match) return event;
    const parsed = JSON.parse(match[1]);
    if (parsed.type === 'message_delta' && parsed.usage) {
      if (parsed.usage.output_tokens) parsed.usage.output_tokens = Math.max(1, Math.round(parsed.usage.output_tokens * factor));
      if (parsed.usage.input_tokens) parsed.usage.input_tokens = Math.max(1, Math.round(parsed.usage.input_tokens * factor));
      return `event: message_delta\ndata: ${JSON.stringify(parsed)}\n\n`;
    }
    if (parsed.type === 'message_start' && parsed.message?.usage) {
      if (parsed.message.usage.input_tokens) parsed.message.usage.input_tokens = Math.max(1, Math.round(parsed.message.usage.input_tokens * factor));
      if (parsed.message.usage.output_tokens) parsed.message.usage.output_tokens = Math.max(1, Math.round(parsed.message.usage.output_tokens * factor));
      return `event: message_start\ndata: ${JSON.stringify(parsed)}\n\n`;
    }
  } catch {}
  return event;
}

/** Aggiorna il tracciamento per la sessione corrente e salva su disco */
function updateLastUsage(
  inputCount: number, outputCount: number,
  resolution: RouteResolution, inflation: number,
  sessionId?: string | null,
): void {
  const usage: SessionUsage = {
    inputTokens: inputCount,
    outputTokens: outputCount,
    model: resolution.targetModel,
    provider: resolution.provider.name,
    tier: resolution.claudeTier || '',
    inflation,
  };
  lastContextUsage = usage as LastContextUsage;
  updateSessionUsage(sessionId || null, usage);
}

/**
 * Extract output token count from an Anthropic SSE event string.
 */
export function extractOutputTokensFromEvent(event: string): number {
  const dataMatch = event.match(/^data: (.+)$/m);
  if (!dataMatch) return 0;
  try {
    const parsed = JSON.parse(dataMatch[1]);
    if (parsed.type === 'message_delta' && parsed.usage?.output_tokens) {
      return parsed.usage.output_tokens;
    }
  } catch {}
  return 0;
}

export function shouldFlushStreamBuffer(opts: {
  isContentDelta: boolean;
  isBoundary: boolean;
  bufLength: number;
  batchSize?: number;
}): boolean {
  const batchSize = opts.batchSize ?? 15;
  return opts.isContentDelta || opts.isBoundary || opts.bufLength >= batchSize;
}

export { emitAnthropicError, inflateUsageTokens, getInflationFactor };
