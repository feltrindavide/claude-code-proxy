import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderService } from '../../src/services/provider.js';
import type { LLMProvider, ModelRoute } from '../../src/types/index.js';

describe('ProviderService', () => {
  let providerService: ProviderService;

  const mockProviders: LLMProvider[] = [
    {
      name: 'opencode',
      baseUrl: 'https://opencode.ai/v1',
      keyId: 'opencode-key',
      models: ['qwen3.6', 'nemotron-3-super-120b-a12b:free'],
      enabled: true,
      priority: 1,
    },
    {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/v1',
      keyId: 'openrouter-key',
      models: ['mimo-v2-flash'],
      enabled: true,
      priority: 2,
    },
  ];

  const mockRoutes: ModelRoute[] = [
    { claudeTier: 'opus', providerName: 'opencode', targetModel: 'qwen3.6' },
    { claudeTier: 'sonnet', providerName: 'openrouter', targetModel: 'mimo-v2-flash' },
    { claudeTier: 'haiku', providerName: 'opencode', targetModel: 'nemotron-3-super-120b-a12b:free' },
  ];

  beforeEach(() => {
    providerService = new ProviderService();
    mockProviders.forEach((p) => providerService.registerProvider(p));
    providerService.setRoutes(mockRoutes);
  });

  describe('registerProvider', () => {
    it('adds provider to registry Map', () => {
      const newProvider: LLMProvider = {
        name: 'ollama',
        baseUrl: 'http://localhost:11434',
        keyId: 'ollama-key',
        models: ['llama3'],
        enabled: true,
        priority: 3,
      };
      providerService.registerProvider(newProvider);
      expect(providerService.getProvider('ollama')).toEqual(newProvider);
    });

    it('overwrites existing provider with same name', () => {
      const updatedProvider: LLMProvider = {
        name: 'opencode',
        baseUrl: 'https://opencode.ai/v1',
        keyId: 'opencode-key',
        models: ['new-model'],
        enabled: false,
        priority: 10,
      };
      providerService.registerProvider(updatedProvider);
      const retrieved = providerService.getProvider('opencode');
      expect(retrieved?.enabled).toBe(false);
      expect(retrieved?.models).toEqual(['new-model']);
    });
  });

  describe('resolveModelRoute', () => {
    it('resolves claude-opus-4-20250514 to opus tier route', () => {
      const resolution = providerService.resolveModelRoute('claude-opus-4-20250514');
      expect(resolution).not.toBeNull();
      expect(resolution?.provider.name).toBe('opencode');
      expect(resolution?.targetModel).toBe('qwen3.6');
      expect(resolution?.originalModel).toBe('claude-opus-4-20250514');
    });

    it('resolves claude-sonnet-4-20250514 to sonnet tier route', () => {
      const resolution = providerService.resolveModelRoute('claude-sonnet-4-20250514');
      expect(resolution).not.toBeNull();
      expect(resolution?.provider.name).toBe('openrouter');
      expect(resolution?.targetModel).toBe('mimo-v2-flash');
    });

    it('resolves claude-haiku-3-20250514 to haiku tier route', () => {
      const resolution = providerService.resolveModelRoute('claude-haiku-3-20250514');
      expect(resolution).not.toBeNull();
      expect(resolution?.provider.name).toBe('opencode');
      expect(resolution?.targetModel).toBe('nemotron-3-super-120b-a12b:free');
    });

    it('returns null when no route configured for model', () => {
      const resolution = providerService.resolveModelRoute('unknown-model');
      expect(resolution).toBeNull();
    });

    it('returns null when provider not found', () => {
      // Create a service with routes pointing to non-existent provider
      const ps = new ProviderService();
      ps.setRoutes([{ claudeTier: 'opus', providerName: 'nonexistent', targetModel: 'model' }]);
      const resolution = ps.resolveModelRoute('claude-opus-4-20250514');
      expect(resolution).toBeNull();
    });

    it('returns null when provider is disabled', () => {
      const ps = new ProviderService();
      ps.registerProvider({
        name: 'disabled-provider',
        baseUrl: 'https://disabled.com/v1',
        keyId: 'key',
        models: ['model'],
        enabled: false,
        priority: 1,
      });
      ps.setRoutes([{ claudeTier: 'opus', providerName: 'disabled-provider', targetModel: 'model' }]);
      const resolution = ps.resolveModelRoute('claude-opus-4-20250514');
      expect(resolution).toBeNull();
    });
  });

  describe('getProviders', () => {
    it('returns all providers sorted by priority (lower = higher priority)', () => {
      const providers = providerService.getProviders();
      expect(providers[0].name).toBe('opencode'); // priority 1
      expect(providers[1].name).toBe('openrouter'); // priority 2
    });

    it('returns empty array when no providers registered', () => {
      const ps = new ProviderService();
      expect(ps.getProviders()).toEqual([]);
    });
  });

  describe('setRoutes', () => {
    it('replaces existing route mappings', () => {
      const newRoutes: ModelRoute[] = [
        { claudeTier: 'opus', providerName: 'openrouter', targetModel: 'different-model' },
      ];
      providerService.setRoutes(newRoutes);
      const resolution = providerService.resolveModelRoute('claude-opus-4-20250514');
      expect(resolution?.targetModel).toBe('different-model');
    });
  });

  describe('getProvider', () => {
    it('returns provider by name', () => {
      const provider = providerService.getProvider('opencode');
      expect(provider?.name).toBe('opencode');
    });

    it('returns undefined for non-existent provider', () => {
      const provider = providerService.getProvider('nonexistent');
      expect(provider).toBeUndefined();
    });
  });

  describe('reload', () => {
    it('atomically replaces providers and routes', () => {
      const newProviders: LLMProvider[] = [
        {
          name: 'new-provider',
          baseUrl: 'https://new.com/v1',
          keyId: 'key',
          models: ['model-a'],
          enabled: true,
          priority: 1,
        },
      ];
      const newRoutes: ModelRoute[] = [
        { claudeTier: 'opus', providerName: 'new-provider', targetModel: 'model-a' },
      ];

      providerService.reload(newProviders, newRoutes);

      expect(providerService.getProvider('opencode')).toBeUndefined();
      expect(providerService.getProvider('new-provider')?.name).toBe('new-provider');
      const resolution = providerService.resolveModelRoute('claude-opus-4-20250514');
      expect(resolution?.targetModel).toBe('model-a');
    });
  });
});