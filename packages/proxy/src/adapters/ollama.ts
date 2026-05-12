/**
 * Ollama adapter — native Anthropic passthrough
 * Phase: 02-sse-streaming-integration
 * Plan: 02-02, Task 3
 *
 * Ollama 4.x+ supports native Anthropic /v1/messages endpoint,
 * so minimal transformation is needed — just pass through with [DONE] filtering.
 *
 * Per D-21: Timeouts: 120s streaming / 30s non-streaming
 * Per D-23: Ollama is local, use GET /api/tags for validation
 * Per T-02-09: Ollama is local-only — no API key required, low spoofing risk
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

export class OllamaAdapter implements ProviderAdapter {
  readonly providerType = 'ollama';
  readonly apiPath = '/v1/messages';
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };

  /**
   * Ollama supports native Anthropic endpoint — passthrough with stream flag
   */
  transformRequest(
    body: AnthropicMessagesBody,
    route: RouteResolution,
  ): Record<string, unknown> {
    return {
      ...body,
      model: route.targetModel,
      stream: true,
    };
  }

  /**
   * Pass through native Anthropic SSE, filter [DONE] terminal events
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
      const msg = error instanceof Error ? error.message : 'Stream error';
      yield this.emitError(`Ollama stream error: ${msg}`);
    }
  }

  /**
   * Validate Ollama connectivity — Ollama is local, use /api/tags endpoint
   * No API key needed (apiKey parameter ignored)
   */
  async validate(baseUrl: string, _apiKey: string): Promise<ValidationResult> {
    try {
      const resp = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      return { valid: resp.ok };
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
