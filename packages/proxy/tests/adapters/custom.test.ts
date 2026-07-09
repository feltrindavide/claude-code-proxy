import { describe, it, expect } from 'vitest';
import { CustomAdapter } from '../../src/adapters/custom.js';

const route = {
  provider: {
    name: 'custom',
    baseUrl: 'https://api.example.com/v1',
    keyId: 'custom',
    models: ['my-model'],
    enabled: true,
    priority: 1,
    providerType: 'custom',
  },
  targetModel: 'my-model',
  originalModel: 'claude-sonnet-4-20250514',
};

describe('CustomAdapter', () => {
  it('defaults to OpenAI chat/completions path', () => {
    const adapter = new CustomAdapter();
    expect(adapter.apiPath).toBe('/v1/chat/completions');
    expect(adapter.providerType).toBe('custom');
  });

  it('uses anthropic path when apiFormat is anthropic', () => {
    const adapter = new CustomAdapter({ apiFormat: 'anthropic', providerType: 'custom-anthropic' });
    expect(adapter.apiPath).toBe('/v1/messages');
    expect(adapter.providerType).toBe('custom-anthropic');
  });

  it('anthropic format passthrough overrides model', () => {
    const adapter = new CustomAdapter({ apiFormat: 'anthropic' });
    const body = adapter.transformRequest(
      {
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'test' }],
        stream: true,
      },
      route,
    );

    expect(body.model).toBe('my-model');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: 'user', content: 'test' }]);
  });

  it('openai format converts user messages', () => {
    const adapter = new CustomAdapter({ apiFormat: 'openai' });
    const body = adapter.transformRequest(
      {
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'hello' }],
      },
      route,
    );

    expect(body.model).toBe('my-model');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(body.stream).toBe(false);
  });
});
