import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAdapter } from '../src/adapters/index.js';
import { NvidiaNimAdapter } from '../src/adapters/nvidia-nim.js';
import { joinProviderUrl } from '../src/services/provider-url.js';
import { upstreamFetch } from '../src/services/upstream-http.js';

vi.mock('../src/services/upstream-http.js', () => ({
  upstreamFetch: vi.fn(),
}));

describe('NvidiaNimAdapter', () => {
  beforeEach(() => {
    vi.mocked(upstreamFetch).mockReset();
  });

  it('is registered in the adapter registry', () => {
    expect(getAdapter('nvidia-nim')).toBeDefined();
    expect(getAdapter('nvidia-nim')?.providerType).toBe('nvidia-nim');
  });

  it('defaults max_tokens when missing (NVIDIA requirement)', () => {
    const adapter = new NvidiaNimAdapter();
    const body = adapter.transformRequest(
      {
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hello' }],
      },
      {
        provider: {
          name: 'nvidia-nim',
          baseUrl: 'https://integrate.api.nvidia.com',
          keyId: 'nvidia-nim',
          models: [],
          enabled: true,
          priority: 1,
          providerType: 'nvidia-nim',
        },
        targetModel: 'meta/llama-3.1-8b-instruct',
        originalModel: 'claude-sonnet-4-20250514',
      },
    );

    expect(body.max_tokens).toBe(8192);
    expect(body.model).toBe('meta/llama-3.1-8b-instruct');
    expect(body.stream).toBe(true);
  });

  it('preserves explicit max_tokens', () => {
    const adapter = new NvidiaNimAdapter();
    const body = adapter.transformRequest(
      {
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 4096,
      },
      {
        provider: {
          name: 'nvidia-nim',
          baseUrl: 'https://integrate.api.nvidia.com',
          keyId: 'nvidia-nim',
          models: [],
          enabled: true,
          priority: 1,
        },
        targetModel: 'nvidia/nemotron-4-340b-instruct',
        originalModel: 'claude-sonnet-4-20250514',
      },
    );

    expect(body.max_tokens).toBe(4096);
  });

  it('validates via GET /v1/models', async () => {
    vi.mocked(upstreamFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { id: 'meta/llama-3.1-8b-instruct', context_length: 131072 },
            { id: 'nvidia/nemotron-4-340b-instruct', max_model_len: 131072 },
          ],
        }),
        { status: 200 },
      ),
    );

    const adapter = new NvidiaNimAdapter();
    const result = await adapter.validate('https://integrate.api.nvidia.com', 'nvapi-test');

    expect(result.valid).toBe(true);
    expect(result.models).toEqual([
      'meta/llama-3.1-8b-instruct',
      'nvidia/nemotron-4-340b-instruct',
    ]);
    expect(result.modelContexts?.['meta/llama-3.1-8b-instruct']).toEqual({
      context: 131072,
      max_output: 131072,
    });
    expect(vi.mocked(upstreamFetch).mock.calls[0]?.[0]).toBe(
      'https://integrate.api.nvidia.com/v1/models',
    );
  });

  it('builds chat URL correctly when base URL ends with /v1', () => {
    expect(
      joinProviderUrl('https://integrate.api.nvidia.com/v1', '/v1/chat/completions'),
    ).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
  });
});
