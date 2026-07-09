import { describe, it, expect } from 'vitest';
import { getAdapter } from '../../src/adapters/index.js';
import { OpenCodeAdapter } from '../../src/adapters/opencode.js';

const route = {
  provider: {
    name: 'opencode',
    baseUrl: 'https://opencode.ai/zen',
    keyId: 'opencode',
    models: ['qwen3.6'],
    enabled: true,
    priority: 1,
    providerType: 'opencode',
  },
  targetModel: 'qwen3.6',
  originalModel: 'claude-opus-4-20250514',
};

describe('OpenCodeAdapter', () => {
  it('is registered in the adapter registry', () => {
    expect(getAdapter('opencode')).toBeDefined();
    expect(getAdapter('opencode')?.apiPath).toBe('/v1/chat/completions');
  });

  it('converts Anthropic user message to OpenAI chat format', () => {
    const adapter = new OpenCodeAdapter();
    const body = adapter.transformRequest(
      {
        model: 'claude-opus-4-20250514',
        messages: [{ role: 'user', content: 'Hello world' }],
        stream: true,
      },
      route,
    );

    expect(body.model).toBe('qwen3.6');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello world' }]);
  });

  it('converts assistant tool_use blocks to OpenAI tool_calls', () => {
    const adapter = new OpenCodeAdapter();
    const body = adapter.transformRequest(
      {
        model: 'claude-opus-4-20250514',
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: '/tmp/a' } },
            ],
          },
        ],
      },
      route,
    );

    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0].tool_calls).toEqual([
      {
        id: 'toolu_1',
        type: 'function',
        function: { name: 'read_file', arguments: JSON.stringify({ path: '/tmp/a' }) },
      },
    ]);
  });

  it('injects system prompt when body.system is a string', () => {
    const adapter = new OpenCodeAdapter();
    const body = adapter.transformRequest(
      {
        model: 'claude-opus-4-20250514',
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hi' }],
      },
      route,
    );

    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });
});
