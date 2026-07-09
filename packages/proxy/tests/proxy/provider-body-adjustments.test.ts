import { describe, it, expect } from 'vitest';
import {
  applyProviderBodyAdjustments,
  shouldBoostSmallTokenBudget,
} from '../../src/proxy.js';
import type { RouteResolution } from '../../src/types/index.js';
import { createRequestLogger } from '../../src/lib/logger.js';

function resolution(
  partial: Pick<RouteResolution, 'targetModel' | 'claudeTier' | 'provider'>,
): RouteResolution {
  return {
    originalModel: 'claude-haiku-4-20250514',
    ...partial,
    provider: partial.provider,
  } as RouteResolution;
}

describe('shouldBoostSmallTokenBudget', () => {
  it('boosts haiku-tier automode classifier requests', () => {
    expect(
      shouldBoostSmallTokenBudget(
        resolution({
          claudeTier: 'haiku',
          targetModel: 'moonshotai/kimi-k2.6',
          provider: { name: 'nvidia-nim' } as RouteResolution['provider'],
        }),
        32,
      ),
    ).toBe(true);
  });

  it('does not boost large budgets on sonnet', () => {
    expect(
      shouldBoostSmallTokenBudget(
        resolution({
          claudeTier: 'sonnet',
          targetModel: 'z-ai/glm-5.2',
          provider: { name: 'nvidia-nim' } as RouteResolution['provider'],
        }),
        8192,
      ),
    ).toBe(false);
  });
});

describe('applyProviderBodyAdjustments', () => {
  it('prepends concise system prompt and raises max_tokens for haiku classifier', () => {
    const body: Record<string, unknown> = {
      max_tokens: 20,
      messages: [{ role: 'user', content: 'classify' }],
    };
    const reqLog = createRequestLogger('test');

    applyProviderBodyAdjustments(
      body,
      resolution({
        claudeTier: 'haiku',
        targetModel: 'moonshotai/kimi-k2.6',
        provider: { name: 'nvidia-nim' } as RouteResolution['provider'],
      }),
      reqLog,
    );

    expect(body.max_tokens).toBe(4096);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Answer directly and concisely');
  });
});
