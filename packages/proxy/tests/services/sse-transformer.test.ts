import { describe, it, expect } from 'vitest';
import {
  formatSSEEvent,
  mapStopReason,
  ContentBlockManager,
  SSEBuilder,
  parseSSEStream,
  getUserFacingErrorMessage,
} from '../../src/services/sse-transformer.js';

describe('formatSSEEvent', () => {
  it('formats event and data lines', () => {
    const event = formatSSEEvent('message_start', { type: 'message_start', message: { id: 'x' } });
    expect(event).toContain('event: message_start');
    expect(event).toContain('"type":"message_start"');
    expect(event.endsWith('\n\n')).toBe(true);
  });
});

describe('mapStopReason', () => {
  it('maps OpenAI finish reasons to Anthropic stop reasons', () => {
    expect(mapStopReason('stop')).toBe('end_turn');
    expect(mapStopReason('length')).toBe('max_tokens');
    expect(mapStopReason('tool_calls')).toBe('tool_use');
    expect(mapStopReason(null)).toBe('end_turn');
    expect(mapStopReason('unknown')).toBe('end_turn');
  });
});

describe('ContentBlockManager', () => {
  it('opens and closes text blocks in order', () => {
    const mgr = new ContentBlockManager();
    const start = mgr.ensureTextBlock();
    expect(start).toHaveLength(1);
    expect(start[0]).toContain('content_block_start');

    const stop = mgr.closeOpenTextBlock();
    expect(stop).toHaveLength(1);
    expect(stop[0]).toContain('content_block_stop');
  });

  it('closes thinking before starting text', () => {
    const mgr = new ContentBlockManager();
    mgr.ensureThinkingBlock();
    const events = mgr.ensureTextBlock();
    expect(events.some((e) => e.includes('content_block_stop'))).toBe(true);
    expect(events.some((e) => e.includes('"type":"text"'))).toBe(true);
  });
});

describe('SSEBuilder', () => {
  it('emits message_start with usage', () => {
    const builder = new SSEBuilder('msg_1', 'claude-sonnet', 42);
    const event = builder.message_start();
    expect(event).toContain('message_start');
    expect(event).toContain('"input_tokens":42');
  });

  it('tracks text output and emits deltas', () => {
    const builder = new SSEBuilder('msg_1', 'claude-sonnet', 10);
    builder.ensureTextBlock();
    const delta = builder.emitTextDelta('hello');
    expect(delta).toContain('text_delta');
    expect(delta).toContain('hello');
    expect(builder.hasTextContent()).toBe(true);
  });

  it('sanitizes top-level errors', () => {
    const builder = new SSEBuilder('msg_1', 'claude-sonnet', 10);
    const err = builder.emitTopLevelError('upstream failed');
    expect(err).toContain('event: error');
    expect(err).toContain('upstream failed');
  });
});

describe('parseSSEStream', () => {
  it('parses SSE chunks into events', async () => {
    const payload = 'event: ping\ndata: {"ok":true}\n\n';
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('ping');
    expect(JSON.parse(events[0].data)).toEqual({ ok: true });
  });
});

describe('getUserFacingErrorMessage', () => {
  it('sanitizes API keys in error messages', () => {
    const msg = getUserFacingErrorMessage(new Error('Auth failed for sk-secretkey123'));
    expect(msg).not.toContain('sk-secretkey123');
    expect(msg).toContain('[KEY]');
  });

  it('returns timeout message for AbortError', () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    expect(getUserFacingErrorMessage(err, 30_000)).toContain('timed out after 30s');
  });

  it('returns connection message for fetch TypeError', () => {
    expect(getUserFacingErrorMessage(new TypeError('fetch failed'))).toBe('Could not connect to provider.');
  });
});
