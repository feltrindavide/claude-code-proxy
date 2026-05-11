import { describe, it, expect, beforeEach } from 'vitest';
import { handleProxyRequest } from '../../src/proxy.js';
import { providerService } from '../../src/services/provider.js';
import type { LLMProvider, ModelRoute } from '../../src/types/index.js';

describe('Proxy Middleware', () => {
  beforeEach(() => {
    // Reset provider service with test data
    providerService.registerProvider({
      name: 'opencode',
      baseUrl: 'https://opencode.ai/v1',
      keyId: 'opencode-key',
      models: ['qwen3.6'],
      enabled: true,
      priority: 1,
    });
    providerService.setRoutes([
      { claudeTier: 'opus', providerName: 'opencode', targetModel: 'qwen3.6' },
    ]);
  });

  describe('handleProxyRequest', () => {
    it('exported as a function', () => {
      expect(typeof handleProxyRequest).toBe('function');
    });
  });

  describe('route resolution through proxy', () => {
    it('resolves opus tier model to opencode provider', () => {
      const resolution = providerService.resolveModelRoute('claude-opus-4-20250514');
      expect(resolution).not.toBeNull();
      expect(resolution?.provider.baseUrl).toBe('https://opencode.ai/v1');
      expect(resolution?.targetModel).toBe('qwen3.6');
    });
  });
});