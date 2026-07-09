/**
 * Integration test: POST /v1/messages with mock upstream
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { providerService } from '../../src/services/provider.js';

vi.mock('../../src/services/upstream-http.js', () => ({
  upstreamFetch: vi.fn(),
}));

vi.mock('../../src/services/keychain.js', () => ({
  getKey: vi.fn().mockResolvedValue('test-api-key'),
}));

import { upstreamFetch } from '../../src/services/upstream-http.js';

function mockUpstreamSse(text: string): Response {
  const sse = [
    'event: message',
    `data: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })}`,
    '',
    '',
    'event: message',
    `data: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 3 },
    })}`,
    '',
    '',
  ].join('\n');

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('POST /v1/messages (mock upstream)', () => {
  beforeEach(() => {
    vi.mocked(upstreamFetch).mockReset();

    providerService.registerProvider({
      name: 'ollama',
      baseUrl: 'http://localhost:11434',
      keyId: 'ollama',
      models: ['llama3'],
      enabled: true,
      priority: 1,
      providerType: 'ollama',
    });
    providerService.setRoutes([
      { claudeTier: 'haiku', providerName: 'ollama', targetModel: 'llama3' },
    ]);

    vi.mocked(upstreamFetch).mockResolvedValue(mockUpstreamSse('Hello from mock'));
  });

  it('returns Anthropic JSON for non-streaming request', async () => {
    const { createApp } = await import('../../src/index.js');
    const app = createApp({ mountAdmin: false });

    const response = await request(app)
      .post('/v1/messages')
      .send({
        model: 'claude-haiku-4-20250514',
        max_tokens: 256,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('assistant');
    expect(response.body.content?.[0]?.text).toContain('Hello from mock');
    expect(upstreamFetch).toHaveBeenCalled();
  });

  it('streams Anthropic SSE for streaming request', async () => {
    const { createApp } = await import('../../src/index.js');
    const app = createApp({ mountAdmin: false });

    const response = await request(app)
      .post('/v1/messages')
      .send({
        model: 'claude-haiku-4-20250514',
        max_tokens: 256,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('text_delta');
  });
});
