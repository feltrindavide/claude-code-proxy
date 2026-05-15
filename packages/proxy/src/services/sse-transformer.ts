/**
 * SSE Transformer Service — SSEBuilder, ContentBlockManager, and stream parsing utilities
 * Phase: 02-sse-streaming-integration
 * Plan: 02-02, Task 1
 *
 * Per D-19: Custom SSE handler — detect format, transform to Anthropic events
 * Per D-20: SSE transformation in adapter's transformResponse()
 * Per D-26: Anthropic-compatible error format
 * Per D-28: Log internally + user-friendly response
 *
 * Threat mitigations:
 * - T-02-05: Use eventsource-parser for all SSE parsing — never forward raw upstream text
 * - T-02-06: Sanitize all error messages — remove sk-* patterns, never expose API keys
 */

import { createParser } from 'eventsource-parser';
import type { EventSourceMessage } from 'eventsource-parser';

// ---------------------------------------------------------------------------
// SSE event formatting
// ---------------------------------------------------------------------------

/**
 * Format a single SSE event in the standard `event:` / `data:` format
 */
export function formatSSEEvent(
  eventType: string,
  data: Record<string, unknown>,
): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// Stop reason mapping (OpenAI → Anthropic)
// ---------------------------------------------------------------------------

const STOP_REASON_MAP: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'end_turn',
};

/**
 * Map OpenAI finish_reason to Anthropic stop_reason
 */
export function mapStopReason(openaiReason: string | null): string {
  return STOP_REASON_MAP[openaiReason ?? ''] ?? 'end_turn';
}

// ---------------------------------------------------------------------------
// ContentBlockManager — tracks open content blocks, synthesizes missing events
// Addresses Pitfall #1: SSE Event Ordering Violations
// ---------------------------------------------------------------------------

export class ContentBlockManager {
  private nextIndex = 0;
  private textStarted = false;
  private textIndex = -1;
  private toolStarted = false;
  private toolIndex = -1;
  private thinkingStarted = false;
  private thinkingIndex = -1;

  /** Allocate the next block index and increment the counter */
  allocateIndex(): number {
    return this.nextIndex++;
  }

  /** Ensure a text content block has been started; returns events to emit if it wasn't */
  ensureTextBlock(): string[] {
    const events: string[] = [];
    // Close any open thinking or tool block before starting text
    for (const evt of this.closeOpenThinkingBlock()) { events.push(evt); }
    for (const evt of this.closeOpenToolBlock()) { events.push(evt); }
    if (!this.textStarted) {
      events.push(this.startTextBlock());
    }
    return events;
  }

  /** Create a content_block_start event for a text block */
  private startTextBlock(): string {
    this.textIndex = this.allocateIndex();
    this.textStarted = true;
    return formatSSEEvent('content_block_start', {
      type: 'content_block_start',
      index: this.textIndex,
      content_block: { type: 'text', text: '' },
    });
  }

  /** Ensure a thinking content block has been started; returns events to emit if it wasn't */
  ensureThinkingBlock(): string[] {
    const events: string[] = [];
    // Close any open text or tool block before starting thinking
    for (const evt of this.closeOpenTextBlock()) { events.push(evt); }
    for (const evt of this.closeOpenToolBlock()) { events.push(evt); }
    if (!this.thinkingStarted) {
      events.push(this.startThinkingBlock());
    }
    return events;
  }

  /** Close the open text block if any; returns events to emit */
  closeOpenTextBlock(): string[] {
    const events: string[] = [];
    if (this.textStarted) {
      events.push(formatSSEEvent('content_block_stop', {
        type: 'content_block_stop',
        index: this.textIndex,
      }));
      this.textStarted = false;
      this.textIndex = -1;
    }
    return events;
  }

  /** Create a content_block_start event for a thinking block */
  private startThinkingBlock(): string {
    this.thinkingIndex = this.allocateIndex();
    this.thinkingStarted = true;
    return formatSSEEvent('content_block_start', {
      type: 'content_block_start',
      index: this.thinkingIndex,
      content_block: { type: 'thinking', thinking: '' },
    });
  }

  /** Close the open thinking block if any; returns events to emit */
  closeOpenThinkingBlock(): string[] {
    const events: string[] = [];
    if (this.thinkingStarted) {
      events.push(formatSSEEvent('content_block_stop', {
        type: 'content_block_stop',
        index: this.thinkingIndex,
      }));
      this.thinkingStarted = false;
      this.thinkingIndex = -1;
    }
    return events;
  }

  /** Emit a content_block_delta with thinking_delta */
  emitThinkingDelta(thinking: string, index?: number): string {
    const idx = index ?? this.thinkingIndex;
    return formatSSEEvent('content_block_delta', {
      type: 'content_block_delta',
      index: idx,
      delta: { type: 'thinking_delta', thinking },
    });
  }

  /** Register that a tool_use block has started and return its index */
  startToolBlock(index?: number): number {
    // Close any open text/thinking/tool blocks first (Anthropic blocks are sequential)
    const events = this.closeOpenTextBlock();
    for (const evt of this.closeOpenThinkingBlock()) { events.push(evt); }
    for (const evt of this.closeOpenToolBlock()) { events.push(evt); }
    if (events.length > 0) {
      console.warn('[SSE] Closed open blocks when starting tool block');
    }
    this.toolIndex = index ?? this.allocateIndex();
    this.toolStarted = true;
    return this.toolIndex;
  }

  /** Close the open tool_use block if any; returns events to emit */
  closeOpenToolBlock(): string[] {
    const events: string[] = [];
    if (this.toolStarted) {
      events.push(
        formatSSEEvent('content_block_stop', {
          type: 'content_block_stop',
          index: this.toolIndex,
        }),
      );
      this.toolStarted = false;
      this.toolIndex = -1;
    }
    return events;
  }

  /** Close any open content blocks — returns events to emit */
  closeContentBlocks(): string[] {
    const events: string[] = [];
    for (const evt of this.closeOpenTextBlock()) { events.push(evt); }
    for (const evt of this.closeOpenThinkingBlock()) { events.push(evt); }
    for (const evt of this.closeOpenToolBlock()) { events.push(evt); }
    return events;
  }
}

// ---------------------------------------------------------------------------
// SSEBuilder — generates correct Anthropic SSE event sequence
// Sequence: message_start → content_block_start → content_block_delta →
//           content_block_stop → message_delta → message_stop
// ---------------------------------------------------------------------------

export class SSEBuilder {
  private blocks = new ContentBlockManager();
  private totalOutputChars = 0;
  private totalReasoningChars = 0;

  constructor(
    private messageId: string,
    private model: string,
    private inputTokens: number,
  ) {}

  /** Returns total reasoning characters emitted so far */
  getTotalReasoningChars(): number {
    return this.totalReasoningChars;
  }

  /** Returns true if any text content (non-reasoning) has been emitted */
  hasTextContent(): boolean {
    return this.totalOutputChars > this.totalReasoningChars;
  }

  /** Estimate output tokens from accumulated content (rough: ~4 chars/token) */
  private estimateOutputTokens(): number {
    return Math.max(1, Math.round(this.totalOutputChars / 4));
  }

  /** Emit message_start with id, model, role=assistant, content=[], usage */
  message_start(): string {
    return formatSSEEvent('message_start', {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: this.inputTokens, output_tokens: 1 },
      },
    });
  }

  /** Emit message_delta with stop_reason and usage */
  message_delta(stopReason: string, outputTokens?: number): string {
    const tokens = outputTokens ?? this.estimateOutputTokens();
    return formatSSEEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { input_tokens: this.inputTokens, output_tokens: tokens },
    });
  }

  /** Emit message_stop terminal event */
  message_stop(): string {
    return formatSSEEvent('message_stop', { type: 'message_stop' });
  }

  /** Ensure text block is open; returns events array (may be empty) */
  ensureTextBlock(): string[] {
    return this.blocks.ensureTextBlock();
  }

  /** Ensure thinking block is open; returns events array (may be empty) */
  ensureThinkingBlock(): string[] {
    return this.blocks.ensureThinkingBlock();
  }

  /** Close open text block; returns events array */
  closeOpenTextBlock(): string[] {
    return this.blocks.closeOpenTextBlock();
  }

  /** Close open thinking block; returns events array */
  closeOpenThinkingBlock(): string[] {
    return this.blocks.closeOpenThinkingBlock();
  }

  /** Close open tool_use block; returns events array */
  closeOpenToolBlock(): string[] {
    return this.blocks.closeOpenToolBlock();
  }

  /** Start a tool block and return its index */
  startToolBlock(index?: number): number {
    return this.blocks.startToolBlock(index);
  }

  /** Emit a content_block_delta with text_delta */
  emitTextDelta(content: string): string {
    this.totalOutputChars += content.length;
    const index = this.blocks['textIndex'] >= 0 ? this.blocks['textIndex'] : this.blocks.allocateIndex();
    return formatSSEEvent('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: content },
    });
  }

  /** Emit a content_block_delta with thinking_delta */
  emitThinkingDelta(thinking: string): string {
    this.totalOutputChars += thinking.length;
    this.totalReasoningChars += thinking.length;
    return this.blocks.emitThinkingDelta(thinking);
  }

  /** Close any open content blocks; returns events array */
  closeContentBlocks(): string[] {
    return this.blocks.closeContentBlocks();
  }

  /** Emit a top-level error event in Anthropic error format (per D-26) */
  emitTopLevelError(errorMessage: string): string {
    return formatSSEEvent('error', {
      type: 'error',
      error: { type: 'api_error', message: errorMessage },
    });
  }
}

// ---------------------------------------------------------------------------
// SSE stream parser — uses eventsource-parser for robust parsing
// Addresses T-02-05: Never forward raw upstream text
// ---------------------------------------------------------------------------

/**
 * Parse a ReadableStream of SSE text into ParsedEvent objects
 * Uses eventsource-parser to handle edge cases (multi-line data, BOM, etc.)
 */
export function parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<EventSourceMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    async *[Symbol.asyncIterator]() {
      const events: EventSourceMessage[] = [];
      const parser = createParser({
        onEvent: (event) => {
          events.push(event);
        },
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            parser.feed(buffer);
          }
          // Yield all collected events
          for (const event of events) {
            yield event;
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        parser.feed(buffer);
        buffer = '';
        // Yield events parsed from this chunk
        for (const event of events.splice(0)) {
          yield event;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// User-facing error message sanitization
// Addresses T-02-06: Sanitize errors — remove sk-* patterns, never expose keys
// Per D-28: Log internally + user-friendly response
// ---------------------------------------------------------------------------

/**
 * Sanitize an error for user display — never expose API keys or upstream internals
 */
export function getUserFacingErrorMessage(
  error: unknown,
  timeoutMs?: number,
): string {
  // Handle string errors (e.g. thrown directly or passed to emitAnthropicError)
  if (typeof error === 'string') {
    return error || 'Provider request failed.';
  }

  if (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.constructor.name === 'AbortSignal')
  ) {
    return timeoutMs
      ? `Provider request timed out after ${timeoutMs / 1000}s.`
      : 'Provider request timed out.';
  }

  // Node.js AbortError from AbortSignal.timeout
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.includes('The operation was aborted'))
  ) {
    return timeoutMs
      ? `Provider request timed out after ${timeoutMs / 1000}s.`
      : 'Provider request timed out.';
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Could not connect to provider.';
  }

  if (error instanceof Error) {
    // Sanitize — remove any potential key leakage (sk-* patterns)
    const sanitized = error.message.replace(/sk-[a-zA-Z0-9-]+/g, '[KEY]');
    return sanitized || 'Provider request failed.';
  }

  return 'Provider request failed unexpectedly.';
}
