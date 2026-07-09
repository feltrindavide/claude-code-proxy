import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAdapter } from '../../src/adapters/index.js';
import { OllamaAdapter } from '../../src/adapters/ollama.js';
import { upstreamFetch } from '../../src/services/upstream-http.js';

vi.mock('../../src/services/upstream-http.js', () => ({
  upstreamFetch: vi.fn(),
}));

const route = {
  provider: {
    name: 'ollama',
    baseUrl: 'http://localhost:11434',
    keyId: 'ollama',
    models: ['llama3'],
    enabled: true,
    priority: 1,
    providerType: 'ollama',
  },
  targetModel: 'llama3',
  originalModel: 'claude-haiku-4-20250514',
};

describe('OllamaAdapter', () => {
  beforeEach(() => {
    vi.mocked(upstreamFetch).mockReset();
  });

  it('is registered in the adapter registry', () => {
    expect(getAdapter('ollama')).toBeDefined();
    expect(getAdapter('Ollama')?.providerType).toBe('ollama');
  });

  it('transformRequest sets mapped model and stream flag', () => {
    const adapter = new OllamaAdapter();
    const body = adapter.transformRequest(
      {
        model: 'claude-haiku-4-20250514',
        messages: [{ role: 'user', content: 'ping' }],
      },
      route,
    );

    expect(body.model).toBe('llama3');
    expect(body.stream).toBe(false);
  });

  it('passthrough SSE filters [DONE]', async () => {
    const adapter = new OllamaAdapter();
    const sse = [
      'event: message',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
      '',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n');

    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      }),
    );

    const events: string[] = [];
    for await (const evt of adapter.transformResponse(response, {
      messageId: 'msg_test',
      model: 'claude-haiku-4-20250514',
      inputTokens: 5,
      thinkingEnabled: false,
    })) {
      events.push(evt);
    }

    expect(events.join('')).not.toContain('[DONE]');
    expect(events.join('')).toContain('ok');
  });

  it('validate uses /api/tags without API key', async () => {
    vi.mocked(upstreamFetch).mockResolvedValue(new Response('{}', { status: 200 }));

    const adapter = new OllamaAdapter();
    const result = await adapter.validate('http://localhost:11434', '');

    expect(result.valid).toBe(true);
    expect(upstreamFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
