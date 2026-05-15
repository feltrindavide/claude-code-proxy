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
  readonly providerType: string;
  readonly apiPath: string;
  timeouts = { streaming: 120_000, nonStreaming: 30_000 };

  constructor(options?: { apiFormat?: 'openai' | 'anthropic'; providerType?: string }) {
    const format = options?.apiFormat || 'openai';
    this.providerType = options?.providerType || 'custom';
    this.apiPath = format === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';
  }

  /**
   * Transform request: passthrough for Anthropic format, convert for OpenAI format
   */
  transformRequest(
    body: AnthropicMessagesBody,
    route: RouteResolution,
  ): Record<string, unknown> {
    // Native Anthropic passthrough (just override model and enable streaming)
    if (this.apiPath === '/v1/messages') {
      return {
        ...body,
        model: route.targetModel,
        stream: true,
      };
    }

    // OpenAI format: convert Anthropic messages → OpenAI chat/completions format
    const messages: Record<string, unknown>[] = [];

    let deferredText: string | null = null;

    for (const msg of body.messages) {
      if (msg.role === 'assistant') {
        let textContent = '';
        const toolCalls: Array<Record<string, unknown>> = [];
        let foundToolUse = false;

        if (typeof msg.content === 'string') {
          textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              if (foundToolUse || deferredText !== null) {
                deferredText = (deferredText ?? '') + (block.text ?? '');
              } else {
                textContent += block.text ?? '';
              }
            } else if (block.type === 'tool_use') {
              foundToolUse = true;
              toolCalls.push({
                id: block.id,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input ?? {}),
                },
              });
            } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
              if (block.type === 'thinking' && block.thinking) {
                const thinkContent = block.thinking;
                if (foundToolUse || deferredText !== null) {
                  deferredText = (deferredText ?? '') + `<think>${thinkContent}</think>`;
                } else {
                  textContent += `<think>${thinkContent}</think>`;
                }
              }
            }
          }
        }

        const assistantMsg: Record<string, unknown> = { role: 'assistant', content: textContent };
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }
        // DeepSeek requires reasoning_content in ALL assistant messages
        if (route.targetModel?.toLowerCase().includes('deepseek')) {
          let rc = '';
          if (Array.isArray(msg.content)) {
            rc = msg.content
              .filter((b: any) => b.type === 'thinking' && b.thinking)
              .map((b: any) => b.thinking).join('');
          }
          if (!rc && typeof msg.content === 'string') {
            rc = msg.content;
          }
          if (!rc && textContent) rc = textContent;
          if (!rc) rc = ' ';
          assistantMsg.reasoning_content = rc;
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
              // Serialize tool_result content to string (matching free-claude-code)
              const resultContent = (() => {
                const c = block.content;
                if (c === null || c === undefined) return '';
                if (typeof c === 'string') return c;
                if (typeof c === 'object' && !Array.isArray(c)) return JSON.stringify(c);
                if (Array.isArray(c)) {
                  return c.map((item: any) => {
                    if (item?.type === 'text') return item.text ?? '';
                    if (typeof item === 'object') return JSON.stringify(item);
                    return String(item ?? '');
                  }).join('\n');
                }
                return String(c);
              })();
              toolResults.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: resultContent,
              });
            }
          }
        }

        // If no tool results, flush deferred text BEFORE user message
        if (deferredText !== null && toolResults.length === 0) {
          messages.push({ role: 'assistant', content: deferredText });
          deferredText = null;
        }

        if (textContent) {
          messages.push({ role: 'user', content: textContent });
        }
        for (const tr of toolResults) {
          messages.push(tr);
        }
        // Flush deferred text AFTER tool results (keeps tool results adjacent to tool_calls)
        if (deferredText !== null) {
          messages.push({ role: 'assistant', content: deferredText });
          deferredText = null;
        }
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    if (deferredText !== null) {
      messages.push({ role: 'assistant', content: deferredText });
      deferredText = null;
    }

    const result: Record<string, unknown> = { model: route.targetModel, messages, stream: true };

    if (body.system) {
      const systemText = typeof body.system === 'string'
        ? body.system
        : Array.isArray(body.system)
          ? body.system.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
          : '';
      if (systemText) {
        result.messages = [{ role: 'system', content: systemText }, ...messages];
      }
    }

    if (body.max_tokens !== undefined) result.max_tokens = body.max_tokens;
    if (body.temperature !== undefined) result.temperature = body.temperature;

    // Pass through context_management for providers that support it
    if (body.context_management) result.context_management = body.context_management;

    if (body.tools && body.tools.length > 0) {
      result.tools = body.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    return result;
  }

  /**
   * Transform response: passthrough for Anthropic SSE, convert OpenAI → Anthropic
   */
  async *transformResponse(
    upstreamResponse: Response,
    options: TransformOptions,
  ): AsyncIterable<string> {
    if (!upstreamResponse.body) {
      yield this.emitError('Empty response body from provider');
      return;
    }

    // Native Anthropic passthrough — just filter [DONE] terminal events
    if (this.apiPath === '/v1/messages') {
      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const events: string[] = [];

      const { createParser } = await import('eventsource-parser');
      const parser = createParser({
        onEvent: (event) => {
          if (event.data === '[DONE]') return;
          const eventType = event.event || 'message';
          events.push(`event: ${eventType}\ndata: ${event.data}\n\n`);
        },
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) parser.feed(buffer);
          for (const evt of events.splice(0)) yield evt;
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        parser.feed(buffer);
        buffer = '';
        for (const evt of events.splice(0)) yield evt;
      }
      return;
    }

    // OpenAI format: convert OpenAI SSE → Anthropic SSE
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

        // Handle reasoning/thinking content — cap to ~2048 tokens
        const reasoningContent = (delta as any)?.reasoning_content as string | undefined;
        if (reasoningContent) {
          if (options.thinkingEnabled) {
            const MAX_REASONING_CHARS = 8192;
            if (sse.getTotalReasoningChars() < MAX_REASONING_CHARS) {
              const remaining = MAX_REASONING_CHARS - sse.getTotalReasoningChars();
              const chunk = reasoningContent.length <= remaining ? reasoningContent : reasoningContent.slice(0, remaining);
              for (const evt of sse.ensureThinkingBlock()) { yield evt; }
              yield sse.emitThinkingDelta(chunk);
            }
          } else {
            for (const evt of sse.ensureTextBlock()) { yield evt; }
            yield sse.emitTextDelta(reasoningContent);
          }
        }

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
              // Close previous tool block (if any) before starting a new one
              for (const evt of sse.closeOpenToolBlock()) {
                yield evt;
              }
              // New tool call — emit content_block_start for tool_use
              const toolIndex = sse.startToolBlock(tc.index);
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
          yield sse.message_delta(mapStopReason(finishReason));
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
      yield sse.message_delta('end_turn');
      yield sse.message_stop();
      return;
    }

    // If stream ended without finish_reason, close gracefully
    for (const evt of sse.closeContentBlocks()) {
      yield evt;
    }
    yield sse.message_delta('end_turn');
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
