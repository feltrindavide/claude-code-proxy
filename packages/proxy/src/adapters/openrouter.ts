/**
 * OpenRouter adapter — native Anthropic API passthrough
 * Phase: 02-sse-streaming-integration
 * Plan: 02-01
 *
 * OpenRouter supports the native Anthropic messages API (POST /v1/messages
 * with anthropic-version header), so transformRequest() is mostly passthrough
 * and transformResponse() passes through SSE events with minimal transformation
 * (filtering terminal noise like [DONE]).
 *
 * Per D-21: Timeouts: 120s streaming / 30s non-streaming
 * Per D-23: Per-adapter validation logic
 * Per D-24: GET /v1/models as default validation
 */

import type {
  ProviderAdapter,
  AnthropicMessagesBody,
  TransformOptions,
  ValidationResult,
} from './interface.js';
import type { RouteResolution } from '../types/index.js';
import { buildProviderHeaders, type HeaderOptions } from './base-headers.js';
import { upstreamFetch } from '../services/upstream-http.js';
import { createParser } from 'eventsource-parser';
import type { EventSourceMessage } from 'eventsource-parser';

export class OpenRouterAdapter implements ProviderAdapter {
  readonly providerType: string = 'openrouter';
  readonly apiPath = '/v1/messages';
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };

  buildHeaders(apiKey: string, opts: HeaderOptions): Record<string, string> {
    return buildProviderHeaders(this.providerType, apiKey, opts);
  }

  /**
   * OpenRouter supports native Anthropic endpoint — passthrough with stream flag
   */
  transformRequest(
    body: AnthropicMessagesBody,
    route: RouteResolution,
  ): Record<string, unknown> {
    return {
      ...body,
      model: route.targetModel, // Use mapped model, not the original
      stream: true,
    };
  }

  /**
   * OpenRouter returns native Anthropic SSE — pass through with filtering:
   * - [DONE] events removed
   * - thinking/redacted_thinking content blocks removed
   * - errors caught and converted to graceful SSE error events
   */
  async *transformResponse(
    upstreamResponse: Response,
    options: TransformOptions,
  ): AsyncIterable<string> {
    if (!upstreamResponse.body) {
      yield this.emitError('Empty response body from provider');
      return;
    }

    const reader = upstreamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events: string[] = [];
    let inThinking = false;
    let eos = false;

    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (eos) return;
        if (event.data === '[DONE]') return;

        try {
          const parsed = JSON.parse(event.data);

          // If the model emits content_block_start with type "thinking", stay in
          // thinking passthrough for the rest of this block. This way even when
          // Claude Code didn't request high-effort mode, if the upstream provider
          // sends native thinking events we preserve them for Claude Code's UI.
          if (parsed.type === 'content_block_start') {
            const blockType = parsed.content_block?.type;
            if (blockType === 'thinking' || blockType === 'redacted_thinking') {
              inThinking = true;
            } else {
              inThinking = false;
            }
          }

          // When thinking is enabled (either by client request or because the
          // provider sent thinking blocks), passthrough native thinking_delta
          // events so Claude Code displays them semi-transparent.
          if (options.thinkingEnabled || inThinking) {
            // Passthrough thinking blocks as-is
            if (parsed.type === 'content_block_start') {
              const blockType = parsed.content_block?.type;
              if (blockType === 'thinking' || blockType === 'redacted_thinking') {
                inThinking = true;
              } else {
                inThinking = false;
              }
            }
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'signature_delta') {
              return; // Skip signature deltas regardless
            }
            if (inThinking && parsed.type === 'content_block_stop') {
              inThinking = false;
            }
            // Forward the event unchanged
            const eventType = event.event || 'message';
            events.push(`event: ${eventType}\ndata: ${event.data}\n\n`);
            return;
          }

          // When thinking is NOT enabled: convert thinking blocks to text blocks
          if (parsed.type === 'content_block_start') {
            const blockType = parsed.content_block?.type;
            if (blockType === 'thinking' || blockType === 'redacted_thinking') {
              inThinking = true;
              // Rewrite as text block
              const rewritten = {
                ...parsed,
                content_block: { type: 'text', text: parsed.content_block?.thinking || '' }
              };
              const eventType = event.event || 'message';
              events.push(`event: ${eventType}\ndata: ${JSON.stringify(rewritten)}\n\n`);
              return;
            }
            inThinking = false;
          }

          // Convert thinking deltas to text deltas
          if (inThinking && parsed.type === 'content_block_delta') {
            if (parsed.delta?.type === 'thinking_delta') {
              const rewritten = {
                ...parsed,
                delta: { type: 'text_delta', text: parsed.delta.thinking || '' }
              };
              const eventType = event.event || 'message';
              events.push(`event: ${eventType}\ndata: ${JSON.stringify(rewritten)}\n\n`);
              return;
            }
            // Skip non-thinking deltas during thinking block (e.g. signature_delta)
            if (parsed.delta?.type === 'signature_delta') return;
          }

          if (inThinking && parsed.type === 'content_block_stop') {
            inThinking = false;
            // Pass through content_block_stop (the client sees a text block stop)
          }
        } catch {
          if (inThinking) return;
        }

        const eventType = event.event || 'message';
        events.push(`event: ${eventType}\ndata: ${event.data}\n\n`);
      },
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            parser.feed(buffer);
          }
          for (const evt of events.splice(0)) {
            yield evt;
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        parser.feed(buffer);
        buffer = '';
        for (const evt of events.splice(0)) {
          yield evt;
        }
      }
    } catch (error) {
      // Mid-stream error: emit graceful error event
      eos = true;
      const msg = error instanceof Error ? error.message : 'Stream error';
      yield this.emitError(`OpenRouter stream error: ${msg}`);
    }
  }

  /**
   * Validate OpenRouter connectivity via GET /v1/models
   */
  async validate(baseUrl: string, apiKey: string): Promise<ValidationResult> {
    try {
      const resp = await upstreamFetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          data?: Array<{ id: string; context_length?: number; max_output_tokens?: number }>;
        };
        const models = data.data?.map((m) => m.id) ?? [];
        const modelContexts: Record<string, { context: number; max_output: number }> = {};
        for (const m of data.data ?? []) {
          if (m.context_length) {
            modelContexts[m.id] = { context: m.context_length, max_output: m.max_output_tokens ?? 8192 };
          }
        }
        return {
          valid: true,
          models,
          modelContexts: Object.keys(modelContexts).length > 0 ? modelContexts : undefined,
        };
      }
      return { valid: false, error: `Validation failed: ${resp.status}` };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private emitError(message: string): string {
    return `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message } })}\n\n`;
  }
}
