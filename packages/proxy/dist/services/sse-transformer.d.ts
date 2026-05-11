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
import type { EventSourceMessage } from 'eventsource-parser';
/**
 * Format a single SSE event in the standard `event:` / `data:` format
 */
export declare function formatSSEEvent(eventType: string, data: Record<string, unknown>): string;
/**
 * Map OpenAI finish_reason to Anthropic stop_reason
 */
export declare function mapStopReason(openaiReason: string | null): string;
export declare class ContentBlockManager {
    private nextIndex;
    private textStarted;
    private textIndex;
    /** Allocate the next block index and increment the counter */
    allocateIndex(): number;
    /** Ensure a text content block has been started; returns events to emit if it wasn't */
    ensureTextBlock(): string[];
    /** Create a content_block_start event for a text block */
    private startTextBlock;
    /** Close any open content blocks — returns events to emit */
    closeContentBlocks(): string[];
}
export declare class SSEBuilder {
    private messageId;
    private model;
    private inputTokens;
    private blocks;
    constructor(messageId: string, model: string, inputTokens: number);
    /** Emit message_start with id, model, role=assistant, content=[], usage */
    message_start(): string;
    /** Emit message_delta with stop_reason and usage */
    message_delta(stopReason: string, outputTokens: number): string;
    /** Emit message_stop terminal event */
    message_stop(): string;
    /** Ensure text block is open; returns events array (may be empty) */
    ensureTextBlock(): string[];
    /** Emit a content_block_delta with text_delta */
    emitTextDelta(content: string): string;
    /** Close any open content blocks; returns events array */
    closeContentBlocks(): string[];
    /** Emit a top-level error event in Anthropic error format (per D-26) */
    emitTopLevelError(errorMessage: string): string;
}
/**
 * Parse a ReadableStream of SSE text into ParsedEvent objects
 * Uses eventsource-parser to handle edge cases (multi-line data, BOM, etc.)
 */
export declare function parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncIterable<EventSourceMessage>;
/**
 * Sanitize an error for user display — never expose API keys or upstream internals
 */
export declare function getUserFacingErrorMessage(error: unknown, timeoutMs?: number): string;
//# sourceMappingURL=sse-transformer.d.ts.map