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
import { providerService } from './services/provider.js';
import { getKey } from './services/keychain.js';
import { getUserFacingErrorMessage } from './services/sse-transformer.js';
import { fetchWithRetry } from './services/retryHandler.js';

/**
 * Emit an Anthropic-compatible error SSE event and end the response
 * Per D-26: Anthropic error format
 * Per D-28: User-friendly message, full error logged internally
 */
function emitAnthropicError(res: Response, error: unknown): void {
  // Log full error internally (without API keys — getUserFacingErrorMessage sanitizes)
  console.error('[Proxy] Upstream error:', error);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Get sanitized user-friendly message
  const userFriendlyMessage = getUserFacingErrorMessage(error);

  // Write Anthropic-format error event
  res.write(
    `event: error\ndata: ${JSON.stringify({
      type: 'error',
      error: { type: 'api_error', message: userFriendlyMessage },
    })}\n\n`,
  );
  res.end();
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
  let modelName = body.model || 'claude-opus-4-20250514';
  let resolution: RouteResolution | null = null;

  // Decode gateway model IDs: "anthropic/{providerName}/{targetModel}"
  if (modelName.startsWith('anthropic/')) {
    const parts = modelName.split('/');
    if (parts.length >= 3) {
      const providerName = parts[1];
      const targetModel = parts.slice(2).join('/');
      const provider = providerService.getProvider(providerName);
      if (provider) {
        resolution = {
          provider,
          targetModel,
          originalModel: modelName,
        };
      }
    }
  }

  // 2. Resolve route via ProviderService
  if (!resolution) {
    // First try direct model lookup (custom model names)
    resolution = providerService.resolveCustomModel(modelName);
    // Fall back to tier-based routing (claude-opus-* → opus → route)
    if (!resolution) {
      resolution = providerService.resolveModelRoute(modelName);
    }
  }
  if (!resolution) {
    return emitAnthropicError(
      res,
      `No route configured for model: ${modelName}`,
    );
  }

  // Enrich request log with route resolution data (per D-45, 04-01)
  (req as any)._logContext = {
    claudeTier: resolution.claudeTier,
    providerName: resolution.provider.name,
    targetModel: resolution.targetModel,
  };

  // 3. Get API key from Keychain
  const apiKey = await getKey(resolution.provider.name);
  if (!apiKey) {
    return emitAnthropicError(
      res,
      `API key not found for provider: ${resolution.provider.name}`,
    );
  }

  // 4. Select adapter — use providerType if available, fall back to provider name
  const providerType =
    resolution.provider.providerType || resolution.provider.name;
  const adapter = getOrCreateAdapter(
    providerType,
    resolution.provider.baseUrl,
  );

  // 5. Transform request body (Anthropic → provider format)
  const providerBody = adapter.transformRequest(body, resolution);

  // Boost max_tokens for models with high reasoning overhead (e.g. DeepSeek)
  // These models spend tokens on chain-of-thought before producing a response.
  // The auto-mode classifier uses small max_tokens (1-50) which gets consumed
  // entirely by reasoning, leaving no tokens for the actual response.
  const highReasoningModels = ['deepseek', 'deepseek-r1', 'deepseek-v4'];
  const needsBoost = highReasoningModels.some(m => 
    resolution.targetModel.toLowerCase().includes(m)
  );
  const originalMaxTokens = (providerBody as any).max_tokens;
  if (needsBoost && originalMaxTokens !== undefined && originalMaxTokens < 200) {
    // DeepSeek uses chain-of-thought that consumes ~150-500+ tokens.
    // The auto-mode classifier sends 1-50 tokens which gets entirely consumed
    // by reasoning, leaving 0 tokens for the actual response.
    // Only boost for small max_tokens (classifier-style requests).
    const boosted = 2048;
    (providerBody as any).max_tokens = boosted;
    
    // Add system instruction to suppress chain-of-thought reasoning
    // DeepSeek defaults to verbose analysis even for simple requests
    (providerBody as any).messages = [
      { role: 'system', content: 'Answer directly and concisely. Do NOT analyze, think step by step, or explain. Just give the answer.' },
      ...((providerBody as any).messages || [])
    ];
    
    console.log(`[Proxy] Boosted max_tokens from ${originalMaxTokens} to ${boosted} for ${resolution.targetModel} (reasoning overhead)`);
  }

  // 6. Make upstream request with retry (D-66 to D-69)
  let retryAttempt = 0;

  try {
    const upstreamResponse = await fetchWithRetry(
      resolution.provider.name,
      async (attemptNumber) => {
        retryAttempt = attemptNumber;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), adapter.timeouts.streaming);

          const response = await fetch(
            `${resolution.provider.baseUrl}${adapter.apiPath}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                Accept: 'text/event-stream',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              },
              body: JSON.stringify(providerBody),
              signal: controller.signal,
            },
          );

        clearTimeout(timeout);
        return response;
      },
    );

    // Signal retry count to request logger (D-69)
    if (retryAttempt > 0) {
      (req as any)._retryAttempt = retryAttempt;
    }

    // 7. Check if client wants streaming (only true = streaming; absent/false = JSON)
    const wantsStream = body.stream === true;

    // 8. Transform and stream response (provider SSE → Anthropic SSE)
    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Batch writes to reduce overhead from DeepSeek's many tiny reasoning chunks
      const buf: string[] = [];
      for await (const event of adapter.transformResponse(upstreamResponse, {
        messageId: `msg_${crypto.randomUUID()}`,
        model: body.model,
        inputTokens: 0,
      })) {
        buf.push(event);
        // Flush in batches of 15 events or on message boundaries
        if (buf.length >= 15 || event.includes('message_') || event.includes('"error"')) {
          res.write(buf.join(''));
          buf.length = 0;
        }
      }
      if (buf.length > 0) res.write(buf.join(''));
      res.end();
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
        inputTokens: 0,
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
      if (toolUseId) {
        try {
          content.push({
            type: 'tool_use',
            id: toolUseId,
            name: toolUseName,
            input: JSON.parse(toolUseInput || '{}'),
          });
        } catch {
          content.push({
            type: 'tool_use',
            id: toolUseId,
            name: toolUseName,
            input: {},
          });
        }
      }

      res.json({
        id: `msg_${crypto.randomUUID()}`,
        type: 'message',
        role: 'assistant',
        content,
        model: body.model,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: Math.max(1, Math.round(contentText.length / 4)) },
      });
    }
  } catch (error) {
    emitAnthropicError(res, error);
  }
}

export { emitAnthropicError };
