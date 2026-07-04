/**
 * Route resolver tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { providerService } from '../../src/services/provider.js';
import { resolveRequest, isSubagentRequest } from '../../src/services/route-resolver.js';
import { circuitBreakerService } from '../../src/services/circuit-breaker.js';

describe('resolveRequest', () => {
  beforeEach(() => {
    circuitBreakerService.resetForTests();
    providerService.reload(
      [{
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api',
        keyId: 'openrouter',
        models: ['z-ai/glm-4.5-air:free'],
        enabled: true,
        priority: 1,
      }],
      [
        { claudeTier: 'opus', providerName: 'openrouter', targetModel: 'z-ai/glm-4.5-air:free' },
        { claudeTier: 'sonnet', providerName: 'openrouter', targetModel: 'z-ai/glm-4.5-air:free' },
        { claudeTier: 'haiku', providerName: 'openrouter', targetModel: 'z-ai/glm-4.5-air:free' },
      ],
    );
  });

  it('resolves claude tier to configured provider', () => {
    const { resolution } = resolveRequest({ model: 'claude-opus-4-20250514', messages: [] });
    expect(resolution).not.toBeNull();
    expect(resolution?.provider.name).toBe('openrouter');
    expect(resolution?.claudeTier).toBe('opus');
  });

  it('resolves gateway model anthropic/provider/model', () => {
    const { resolution } = resolveRequest({
      model: 'anthropic/openrouter/z-ai/glm-4.5-air:free',
      messages: [],
    });
    expect(resolution?.targetModel).toBe('z-ai/glm-4.5-air:free');
  });

  it('extracts subagent model from system tag', () => {
    const body = {
      model: 'claude-sonnet-4-20250514',
      messages: [],
      system: 'Do work <CCR-SUBAGENT-MODEL>custom-model</CCR-SUBAGENT-MODEL>',
    };
    const { modelName, resolution } = resolveRequest(body);
    expect(modelName).toBe('custom-model');
    expect(body.system).not.toContain('CCR-SUBAGENT-MODEL');
  });
});

describe('resolveRequest circuit breaker fallback', () => {
  beforeEach(() => {
    circuitBreakerService.resetForTests();
    providerService.reload(
      [
        {
          name: 'bad-provider',
          baseUrl: 'https://bad.example.com',
          keyId: 'bad-provider',
          models: ['model-opus'],
          enabled: true,
          priority: 1,
        },
        {
          name: 'good-provider',
          baseUrl: 'https://good.example.com',
          keyId: 'good-provider',
          models: ['model-sonnet'],
          enabled: true,
          priority: 2,
        },
      ],
      [
        { claudeTier: 'opus', providerName: 'bad-provider', targetModel: 'model-opus' },
        { claudeTier: 'sonnet', providerName: 'good-provider', targetModel: 'model-sonnet' },
      ],
    );
  });

  it('falls back to lower tier when primary provider circuit is open', () => {
    for (let i = 0; i < 5; i++) circuitBreakerService.recordFailure('bad-provider');

    const { resolution } = resolveRequest({ model: 'claude-opus-4-20250514', messages: [] });
    expect(resolution?.claudeTier).toBe('sonnet');
    expect(resolution?.provider.name).toBe('good-provider');
    expect(resolution?.fallbackTier).toBe(true);
  });
});

describe('isSubagentRequest', () => {
  it('detects subagent in system prompt', () => {
    expect(isSubagentRequest({
      messages: [],
      system: 'You are a subagent working on a task',
    })).toBe(true);
  });

  it('returns false for normal requests', () => {
    expect(isSubagentRequest({
      messages: [{ role: 'user', content: 'hello' }],
    })).toBe(false);
  });
});

describe('resolveCustomModel partial match', () => {
  beforeEach(() => {
    providerService.reload(
      [{
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api',
        keyId: 'openrouter',
        models: ['z-ai/glm-4.5-air:free', 'anthropic/claude-sonnet'],
        enabled: true,
        priority: 1,
      }],
      [],
    );
  });

  it('matches partial model name with longest match', () => {
    const resolution = providerService.resolveCustomModel('glm-4.5-air');
    expect(resolution?.targetModel).toBe('z-ai/glm-4.5-air:free');
  });

  it('does not match short ambiguous names like sonnet', () => {
    const resolution = providerService.resolveCustomModel('sonnet');
    expect(resolution).toBeNull();
  });
});
