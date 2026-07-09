import { describe, it, expect } from 'vitest';
import { stripAnthropicOnlyChatFields } from '../../src/services/openai-body-sanitize.js';

describe('stripAnthropicOnlyChatFields', () => {
  it('removes context_management and other Anthropic-only fields', () => {
    const body: Record<string, unknown> = {
      model: 'google/gemma-4-31b-it',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1024,
      context_management: [{ type: 'compact', maxTokens: 100000 }],
      metadata: { user_id: 'sess_123' },
      system: 'ignored',
      thinking: { type: 'enabled' },
    };

    stripAnthropicOnlyChatFields(body);

    expect(body.context_management).toBeUndefined();
    expect(body.metadata).toBeUndefined();
    expect(body.system).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(body.model).toBe('google/gemma-4-31b-it');
    expect(body.messages).toHaveLength(1);
  });
});
