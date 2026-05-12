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
import { createParser } from 'eventsource-parser';
import type { EventSourceMessage } from 'eventsource-parser';

export class OpenRouterAdapter implements ProviderAdapter {
  readonly providerType = 'openrouter';
  readonly apiPath = '/v1/messages';
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };


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
   * - thinking content blocks removed (some models emit only thinking, no text)
   * - extra fields in message_start cleaned up
   */
  async *transformResponse(
    upstreamResponse: Response,
    _options: TransformOptions,
  ): AsyncIterable<string> {
    if (!upstreamResponse.body) {
      yield this.emitError('Empty response body from provider');
      return;
    }

    const reader = upstreamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events: string[] = [];

    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (event.data === '[DONE]') return;

        // Skip thinking/redacted_thinking content blocks and their deltas
        // These are internal reasoning that Claude Code can't use
        if (event.data.includes('"thinking"') || 
            event.data.includes('"thinking_delta"') ||
            event.data.includes('"redacted_thinking"') ||
            event.data.includes('"signature"')) {
          return;
        }

        const eventType = event.event || 'message';
        events.push(`event: ${eventType}\ndata: ${event.data}\n\n`);
      },
    });

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
  }

  /**
   * Validate OpenRouter connectivity via GET /v1/models
   */
  async validate(baseUrl: string, apiKey: string): Promise<ValidationResult> {
    try {
      const resp = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          data?: Array<{ id: string }>;
        };
        return {
          valid: true,
          models: data.data?.map((m) => m.id),
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
