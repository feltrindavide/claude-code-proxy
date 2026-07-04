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
import { registerActiveStream } from './services/shutdown.js';
import { proxyCacheHitsTotal } from './metrics/prometheus.js';
import { createRequestLogger, logger } from './lib/logger.js';

/**
 * Emit an error response in the appropriate format (SSE or JSON)
 * Per D-26: Anthropic-compatible error format
 * Per D-28: User-friendly message, full error logged internally
 */
function emitAnthropicError(res: Response, error: unknown, wantsStream?: boolean, reqId?: string): void {
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

// ---------------------------------------------------------------------------
// Per-session context tracking
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
  // Must run before subagent tag extraction (fast-path handles simple requests)
  if (tryFastPath(body, res)) {
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

  // Resolve route (subagent tag, config subagent model, gateway, custom, tier)
  const { modelName, resolution } = resolveRequest(body);
  if (!resolution) {
    return emitAnthropicError(
      res,
      `No route configured for model: ${modelName}`,
      body.stream === true,
      req.requestId,
    );
  }

  const reqLog = createRequestLogger(req.requestId || 'unknown', {
    provider: resolution.provider.name,
    model: body.model as string,
  });

  // Enrich request log with route resolution data (per D-45, 04-01)
  (req as any)._logContext = {
    claudeTier: resolution.claudeTier,
    providerName: resolution.provider.name,
    targetModel: resolution.targetModel,
  };

  if (resolution.fallbackTier && resolution.claudeTier) {
    res.setHeader('X-Proxy-Fallback-Tier', resolution.claudeTier);
  }

  // 3. Get API key from Keychain
  const apiKey = await getKey(resolution.provider.name);
  if (!apiKey) {
    return emitAnthropicError(
      res,
      `API key not found for provider: ${resolution.provider.name}`,
      body.stream === true,
      req.requestId,
    );
  }

  // 4. Select adapter — use providerType if available, fall back to provider name
  const providerType =
    resolution.provider.providerType || resolution.provider.name;
  const adapter = getOrCreateAdapter(
    providerType,
    resolution.provider.baseUrl,
  );

  // 5. Estrai sessionId per tracking per-sessione
  const currentSessionId = extractSessionId(body);
  if (currentSessionId) {
    (req as any)._sessionId = currentSessionId;
  }

  // 5b. Calcola token di input REALI per passarli a Claude Code
  const realInputTokens = countRequestTokens(body.messages, body.system, body.tools);

  // 5c. Transform request body (Anthropic → provider format)
  const providerBody = adapter.transformRequest(body, resolution);

  // Debug: check reasoning_content for DeepSeek
  if (resolution.targetModel?.toLowerCase().includes('deepseek') && Array.isArray(providerBody.messages)) {
    const hasRC = (providerBody.messages as any[]).filter((m: any) => m.role === 'assistant' && !m.reasoning_content).length;
    if (hasRC > 0) {
      reqLog.warn({ count: hasRC }, 'Assistant messages missing reasoning_content for DeepSeek');
    }
  }

  // Force Reasoning: se il modello non supporta thinking nativo, 
  // converte i thinking block in <reasoning_content> e inietta un prompt
  const forceReasoningModels: string[] = []; // Configurable: es. ['qwen', 'minimax']
  const needsForceReasoning = forceReasoningModels.some(m =>
    resolution.targetModel.toLowerCase().includes(m)
  );
  if (needsForceReasoning) {
    const messages = (providerBody as any).messages || [];
    // Wrap assistant thinking content in reasoning tags
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.content) {
        if (typeof msg.content === 'string' && msg.content.includes('<thinking>')) {
          msg.content = msg.content.replace(/<thinking>([\s\S]*?)<\/thinking>/g, '<reasoning_content>$1</reasoning_content>');
        }
      }
    }
    // Inject reasoning prompt in last user message
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const prompt = '\n\nBefore answering, reason step-by-step inside <reasoning_content> tags. Then provide your final answer.';
      if (typeof lastMsg.content === 'string') {
        lastMsg.content += prompt;
      } else if (Array.isArray(lastMsg.content)) {
        lastMsg.content.push({ type: 'text', text: prompt });
      }
    }
    reqLog.info({ model: resolution.targetModel }, 'Force reasoning enabled');
  }

  // Boost max_tokens for models with high reasoning overhead (e.g. DeepSeek)
  // These models spend tokens on chain-of-thought before producing a response.
  // The auto-mode classifier uses small max_tokens (1-50) which gets consumed
  // entirely by reasoning, leaving no tokens for the actual response.
  const highReasoningModels = ['deepseek', 'deepseek-r1', 'deepseek-v4'];
  const needsBoost = highReasoningModels.some(m =>
    resolution.targetModel.toLowerCase().includes(m)
  );
  const originalMaxTokens = (providerBody as any).max_tokens;
  if (needsBoost && originalMaxTokens !== undefined && originalMaxTokens <= 200) {
    // DeepSeek uses chain-of-thought that consumes ~150-500+ tokens.
    // The auto-mode classifier sends 1-50 tokens which gets entirely consumed
    // by reasoning, leaving 0 tokens for the actual response.
    // Boost generously so DeepSeek has room for both reasoning AND actual content.
    const boosted = 4096;
    (providerBody as any).max_tokens = boosted;

    // Add system instruction to suppress chain-of-thought reasoning
    // DeepSeek defaults to verbose analysis even for simple requests
    (providerBody as any).messages = [
      { role: 'system', content: 'Answer directly and concisely. Do NOT analyze, think step by step, or explain. Just give the answer.' },
      ...((providerBody as any).messages || [])
    ];

    reqLog.info(
      { from: originalMaxTokens, to: boosted, model: resolution.targetModel },
      'Boosted max_tokens for reasoning overhead',
    );
  }

  // Clamp max_tokens to model's max_output if known (evita errori "max_tokens exceeds model limit")
  const modelInfo = contextRegistry.getModelContext(resolution.targetModel, resolution.provider.name);
  if (modelInfo && (providerBody as any).max_tokens !== undefined) {
    const current = (providerBody as any).max_tokens as number;
    if (current > modelInfo.max_output) {
      (providerBody as any).max_tokens = modelInfo.max_output;
      reqLog.info(
        { from: current, to: modelInfo.max_output },
        'Clamped max_tokens to model max_output',
      );
    }
  }

  // 6. Make upstream request with retry (D-66 to D-69)
  const wantsStream = body.stream === true;
  (res as any)._wantsStream = wantsStream;
  let retryAttempt = 0;

  const upstreamStart = Date.now();

  try {
    const upstreamResponse = await fetchWithRetry(
      resolution.provider.name,
      async (attemptNumber) => {
        retryAttempt = attemptNumber;
        const controller = new AbortController();
        const timeoutMs = wantsStream
          ? adapter.timeouts.streaming
          : adapter.timeouts.nonStreaming;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await upstreamFetch(
          `${resolution.provider.baseUrl}${adapter.apiPath}`,
          {
            method: 'POST',
            headers: adapter.buildHeaders(apiKey, {
              streaming: wantsStream,
              requestId: req.requestId,
            }),
            body: JSON.stringify(providerBody),
            signal: controller.signal,
          },
        );

        clearTimeout(timeout);
        return response;
      },
    );

    (req as any)._upstreamLatencyMs = Date.now() - upstreamStart;

    // Signal retry count to request logger (D-69)
    if (retryAttempt > 0) {
      (req as any)._retryAttempt = retryAttempt;
    }

    // 7b. Decide if thinking was requested by Claude Code (high-effort mode)
    // This controls whether adapters emit native thinking_delta events or convert to text
    const thinkingEnabled = (body as any).thinking?.type === 'enabled';

    // 7c. Resolve thinking mode for this request (load persisted config from disk)
    const savedConfig = configService.load();
    const thinkingMode = resolveThinkingMode(resolution.claudeTier, resolution.targetModel, savedConfig.thinking as any);
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

      for await (const event of adapter.transformResponse(upstreamResponse, {
        messageId: `msg_${crypto.randomUUID()}`,
        model: body.model,
        inputTokens: realInputTokens.total,
        thinkingEnabled,
      })) {
        // Global streaming deadline — prevents hanging on endless reasoning
        if (Date.now() - streamStart > STREAM_DEADLINE) {
          reqLog.warn({ deadlineMs: STREAM_DEADLINE }, 'Streaming deadline exceeded, truncating');
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
          buf.length = 0;
        }
      }
      if (buf.length > 0) res.write(buf.join(''));
      res.end();
      if (outputTokens === 0 && streamedText) {
        outputTokens = estimateOutputTokens(streamedText);
      }
      updateLastUsage(realInputTokens.total, outputTokens, resolution, inflationFactor, currentSessionId);
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
        content.push({
          type: 'tool_use',
          id: toolUseId,
          name: toolUseName,
          input: JSON.parse(parsedInput),
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
  } catch (error) {
    (req as any)._upstreamLatencyMs = Date.now() - upstreamStart;
    // return a valid text response with the error message.
    // This way Claude Code always gets a parsable response.
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
