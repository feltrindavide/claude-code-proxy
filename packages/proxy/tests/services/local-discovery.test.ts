/**
 * Local discovery callback tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderService } from '../../src/services/provider.js';

describe('Discovery provider callback logic', () => {
  let providerService: ProviderService;

  beforeEach(() => {
    providerService = new ProviderService();
  });

  function discoveryCallback(
    provider: {
      name: string;
      baseUrl: string;
      providerType: string;
      models: string[];
      enabled: boolean;
      priority: number;
      autoDiscovered?: boolean;
    },
  ): void {
    const existing = providerService.getProvider(provider.name);
    if (existing && !existing.autoDiscovered) return;
    providerService.registerProvider({
      ...provider,
      keyId: provider.name,
      autoDiscovered: true,
    });
  }

  it('does not overwrite manually configured provider', () => {
    providerService.registerProvider({
      name: 'Ollama',
      baseUrl: 'http://localhost:11434',
      keyId: 'Ollama',
      providerType: 'ollama',
      models: ['llama3'],
      enabled: true,
      priority: 1,
      autoDiscovered: false,
    });

    discoveryCallback({
      name: 'Ollama',
      baseUrl: 'http://localhost:11434',
      providerType: 'ollama',
      models: ['mistral'],
      enabled: true,
      priority: 99,
      autoDiscovered: true,
    });

    const p = providerService.getProvider('Ollama');
    expect(p?.models).toEqual(['llama3']);
    expect(p?.priority).toBe(1);
    expect(p?.autoDiscovered).toBeFalsy();
  });

  it('registers new auto-discovered provider', () => {
    discoveryCallback({
      name: 'Ollama',
      baseUrl: 'http://localhost:11434',
      providerType: 'ollama',
      models: ['llama3'],
      enabled: true,
      priority: 1,
      autoDiscovered: true,
    });

    const p = providerService.getProvider('Ollama');
    expect(p).toBeDefined();
    expect(p?.autoDiscovered).toBe(true);
  });

  it('updates existing auto-discovered provider', () => {
    providerService.registerProvider({
      name: 'Ollama',
      baseUrl: 'http://localhost:11434',
      keyId: 'Ollama',
      providerType: 'ollama',
      models: ['old-model'],
      enabled: true,
      priority: 1,
      autoDiscovered: true,
    });

    discoveryCallback({
      name: 'Ollama',
      baseUrl: 'http://localhost:11434',
      providerType: 'ollama',
      models: ['new-model'],
      enabled: true,
      priority: 1,
      autoDiscovered: true,
    });

    expect(providerService.getProvider('Ollama')?.models).toEqual(['new-model']);
  });
});
