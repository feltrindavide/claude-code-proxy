/**
 * Custom adapter — generic OpenAI-compatible fallback
 * Phase: 02-sse-streaming-integration
 * Plan: 02-02, Task 3
 *
 * Generic OpenAI-compatible adapter for any provider that supports
 * /v1/chat/completions with SSE streaming. Same bidirectional transform
 * as OpenCodeAdapter but intended for arbitrary providers.
 *
 * Per D-15: Provider-specific adapter (generic fallback)
 * Per D-16: Bidirectional transforms
 * Per D-21: Timeouts: 120s streaming / 30s non-streaming
 * Per D-25: POST /v1/chat/completions fallback for validation
 * Per D-26/D-27: Error transformation to Anthropic format
 * Per D-28: User-friendly error messages
 *
 * Threat mitigations:
 * - T-02-07: AbortController with 120s streaming timeout
 */

import type {
  ProviderAdapter,
  AnthropicMessagesBody,
  TransformOptions,
  ValidationResult,
} from './interface.js';
import type { RouteResolution } from '../types/index.js';
import {
  SSEBuilder,
  parseSSEStream,
  mapStopReason,
  getUserFacingErrorMessage,
} from '../services/sse-transformer.js';

export class CustomAdapter implements ProviderAdapter {
  readonly providerType = 'custom';
  readonly apiPath = '/v1/chat/completions';
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };

  /**
   * Transform Anthropic messages → OpenAI chat/completions format
   * (Same as OpenCodeAdapter — generic OpenAI-compatible)
   */
  transformRequest(
    body: AnthropicMessagesBody,
    route: RouteResolution,
  ): Record<string, unknown> {
    const messages: Record<string, unknown>[] = [];

    for (const msg of body.messages) {
      if (msg.role === 'assistant') {
        let textContent = '';
        const toolCalls: Array<Record<string, unknown>> = [];

        if (typeof msg.content === 'string') {
          textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              textContent += block.text ?? '';
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                id: block.id,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input ?? {}),
                },
              });
            }
          }
        }

        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: textContent,
        };
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }
        messages.push(assistantMsg);
      } else if (msg.role === 'user') {
        let textContent = '';
        const toolResults: Array<Record<string, unknown>> = [];

        if (typeof msg.content === 'string') {
          textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              textContent += block.text ?? '';
            } else if (block.type === 'tool_result') {
              const resultContent = typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? block.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
                  : '';
              toolResults.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: resultContent,
              });
            }
          }
        }

        if (textContent) {
          messages.push({ role: 'user', content: textContent });
        }
        for (const tr of toolResults) {
          messages.push(tr);
        }
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const result: Record<string, unknown> = {
      model: route.targetModel,
      messages,
      stream: true,
    };

    if (body.max_tokens !== undefined) {
      result.max_tokens = body.max_tokens;
    }
    if (body.temperature !== undefined) {
      result.temperature = body.temperature;
    }

    // Map Anthropic tools → OpenAI tools
    if (body.tools && body.tools.length > 0) {
      result.tools = body.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    return result;
  }

  /**
   * Transform OpenAI SSE → Anthropic SSE via SSEBuilder
   * (Same as OpenCodeAdapter)
   */
  async *transformResponse(
    upstreamResponse: Response,
    options: TransformOptions,
  ): AsyncIterable<string> {
    if (!upstreamResponse.body) {
      yield this.emitError('Empty response body from provider');
      return;
    }

    const sse = new SSEBuilder(options.messageId, options.model, options.inputTokens);
    yield sse.message_start();

    try {
      for await (const event of parseSSEStream(upstreamResponse.body)) {
        // Skip [DONE] terminal event
        if (event.data === '[DONE]') continue;

        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(event.data);
        } catch {
          continue; // Skip malformed chunks
        }

        const choice = (chunk as { choices?: Array<Record<string, unknown>> })
          .choices?.[0];
        if (!choice) continue;

        const delta = choice.delta as
          | {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            }
          | undefined;
        const finishReason = choice.finish_reason as string | null | undefined;

        // Handle text content deltas
        if (delta?.content) {
          for (const evt of sse.ensureTextBlock()) {
            yield evt;
          }
          yield sse.emitTextDelta(delta.content);
        }

        // Handle tool call deltas
        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          for (const tc of delta.tool_calls) {
            if (tc.id) {
              // New tool call — emit content_block_start for tool_use
              const toolIndex = tc.index ?? sse['blocks'].allocateIndex();
              yield this.formatSSEEvent('content_block_start', {
                type: 'content_block_start',
                index: toolIndex,
                content_block: {
                  type: 'tool_use',
                  id: tc.id,
                  name: tc.function?.name ?? 'unknown',
                  input: {},
                },
              });
            }
            // Emit input_json_delta for arguments fragment
            if (tc.function?.arguments) {
              const toolIndex = tc.index ?? 0;
              yield this.formatSSEEvent('content_block_delta', {
                type: 'content_block_delta',
                index: toolIndex,
                delta: {
                  type: 'input_json_delta',
                  partial_json: tc.function.arguments,
                },
              });
            }
          }
        }

        // Handle finish_reason — close stream
        if (finishReason) {
          for (const evt of sse.closeContentBlocks()) {
            yield evt;
          }
          yield sse.message_delta(mapStopReason(finishReason), 0);
          yield sse.message_stop();
          return;
        }
      }
    } catch (error) {
      // Mid-stream error — close blocks and emit error
      for (const evt of sse.closeContentBlocks()) {
        yield evt;
      }
      const userMsg = getUserFacingErrorMessage(error);
      yield sse.emitTopLevelError(userMsg);
      yield sse.message_delta('end_turn', 0);
      yield sse.message_stop();
      return;
    }

    // If stream ended without finish_reason, close gracefully
    for (const evt of sse.closeContentBlocks()) {
      yield evt;
    }
    yield sse.message_delta('end_turn', 0);
    yield sse.message_stop();
  }

  /**
   * Validate connectivity — GET /v1/models with POST /v1/chat/completions fallback
   */
  async validate(baseUrl: string, apiKey: string): Promise<ValidationResult> {
    try {
      // Try GET /v1/models first
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

      // Fallback: POST /v1/chat/completions with minimal request
      const testResp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'test',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      // 200 or 400 means endpoint works (400 = "test" model not found)
      if (testResp.ok || testResp.status === 400) {
        return { valid: true };
      }
      return { valid: false, error: `Validation failed: ${testResp.status}` };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private emitError(message: string): string {
    return this.formatSSEEvent('error', {
      type: 'error',
      error: { type: 'api_error', message },
    });
  }

  private formatSSEEvent(
    eventType: string,
    data: Record<string, unknown>,
  ): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}
