/**
 * Streaming token tracking tests
 */

import { describe, it, expect } from 'vitest';
import { extractOutputTokensFromEvent } from '../../src/proxy.js';

describe('extractOutputTokensFromEvent', () => {
  it('reads output_tokens from message_delta event', () => {
    const event = `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 42 },
    })}\n\n`;

    expect(extractOutputTokensFromEvent(event)).toBe(42);
  });

  it('returns 0 for non-usage events', () => {
    const event = `event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'hello' },
    })}\n\n`;

    expect(extractOutputTokensFromEvent(event)).toBe(0);
  });
});
