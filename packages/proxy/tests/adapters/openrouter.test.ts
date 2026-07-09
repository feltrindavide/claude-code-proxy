import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAdapter } from '../../src/adapters/index.js';
import { OpenRouterAdapter } from '../../src/adapters/openrouter.js';
import { upstreamFetch } from '../../src/services/upstream-http.js';

vi.mock('../../src/services/upstream-http.js', () => ({
  upstreamFetch: vi.fn(),
}));

const route = {
  provider: {
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api',
    keyId: 'openrouter',
    models: ['test-model'],
    enabled: true,
    priority: 1,
    providerType: 'openrouter',
  },
  targetModel: 'anthropic/claude-sonnet-4',
  originalModel: 'claude-sonnet-4-20250514',
};

describe('OpenRouterAdapter', () => {
  beforeEach(() => {
    vi.mocked(upstreamFetch).mockReset();
  });

  it('is registered in the adapter registry', () => {
    expect(getAdapter('openrouter')).toBeDefined();
    expect(getAdapter('openrouter')?.providerType).toBe('openrouter');
  });

  it('passthrough transformRequest overrides model and stream flag', () => {
    const adapter = new OpenRouterAdapter();
    const body = adapter.transformRequest(
      {
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      route,
    );

    expect(body.model).toBe('anthropic/claude-sonnet-4');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('filters [DONE] from SSE stream', async () => {
    const adapter = new OpenRouterAdapter();
    const sse = [
      'event: message',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
      '',
      '',
      'event: message',
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
      model: 'claude-sonnet-4-20250514',
      inputTokens: 10,
      thinkingEnabled: false,
    })) {
      events.push(evt);
    }

    expect(events.some((e) => e.includes('[DONE]'))).toBe(false);
    expect(events.join('')).toContain('text_delta');
  });

  it('validate returns models on success', async () => {
    vi.mocked(upstreamFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'model-a', context_length: 128000, max_output_tokens: 4096 }],
        }),
        { status: 200 },
      ),
    );

    const adapter = new OpenRouterAdapter();
    const result = await adapter.validate('https://openrouter.ai/api', 'sk-test');

    expect(result.valid).toBe(true);
    expect(result.models).toEqual(['model-a']);
    expect(result.modelContexts?.['model-a']).toEqual({ context: 128000, max_output: 4096 });
  });
});
