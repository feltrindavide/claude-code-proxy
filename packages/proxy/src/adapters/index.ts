/**
 * Adapter registry — factory and registration for provider adapters
 * Phase: 02-sse-streaming-integration
 * Plan: 02-01
 *
 * Map-based registry like ProviderService — adapters register on import
 */

import type { ProviderAdapter, ValidationResult } from './interface.js';
import { OpenRouterAdapter } from './openrouter.js';
import { OpenCodeAdapter } from './opencode.js';
import { OllamaAdapter } from './ollama.js';
import { CustomAdapter } from './custom.js';
import { upstreamFetch } from '../services/upstream-http.js';
import { providerService } from '../services/provider.js';

const adapters = new Map<string, ProviderAdapter>();
const customAdapters = new Map<'openai' | 'anthropic', ProviderAdapter>();

/** Register a provider adapter */
export function registerAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.providerType, adapter);
}

/** Get a registered adapter by provider type (case-insensitive) */
export function getAdapter(providerType: string): ProviderAdapter | undefined {
  // Try exact match first
  const exact = adapters.get(providerType);
  if (exact) return exact;
  // Fall back to case-insensitive match
  const lower = providerType.toLowerCase();
  for (const [key, adapter] of adapters) {
    if (key.toLowerCase() === lower) return adapter;
  }
  return undefined;
}

/** Get existing adapter or fall back to format-appropriate CustomAdapter */
export function getOrCreateAdapter(
  providerType: string,
  _baseUrl: string,
): ProviderAdapter {
  const existing = getAdapter(providerType);
  if (existing) return existing;
  if (providerType.toLowerCase().endsWith('-anthropic')) {
    let a = customAdapters.get('anthropic');
    if (!a) {
      a = new CustomAdapter({ apiFormat: 'anthropic' });
      customAdapters.set('anthropic', a);
    }
    return a;
  }
  let o = customAdapters.get('openai');
  if (!o) {
    o = new CustomAdapter({ apiFormat: 'openai' });
    customAdapters.set('openai', o);
  }
  return o;
}

/** Pre-instantiate adapters for configured providers at boot. */
export function prewarmAdapters(): void {
  getOrCreateAdapter('openai', '');
  getOrCreateAdapter('anthropic', '');
  for (const p of providerService.getProviders()) {
    getOrCreateAdapter(p.providerType || p.name, p.baseUrl);
  }
}

// Register built-in adapters
// OpenRouter, Ollama, Custom, OpenCode (generic)
registerAdapter(new OpenRouterAdapter());
registerAdapter(new OpenCodeAdapter());
registerAdapter(new OllamaAdapter());
registerAdapter(new CustomAdapter({ apiFormat: 'openai' }));
// OpenCode Zen and Go (separate types with correct base URL hints for the UI)
registerAdapter(new (class extends OpenCodeAdapter {
  readonly providerType = 'opencode-zen';
})());
registerAdapter(new (class extends OpenCodeAdapter {
  readonly providerType = 'opencode-go';
})());
// Custom Anthropic format (passthrough like OpenRouter)
registerAdapter(new CustomAdapter({ apiFormat: 'anthropic', providerType: 'custom-anthropic' }));

// Google Gemini (OpenAI-compatible at /v1beta/openai/chat/completions)
registerAdapter(new (class extends OpenCodeAdapter {
  readonly providerType = 'google-gemini';
  readonly apiPath = '/v1beta/openai/chat/completions';
})());

// Anthropic native API (passthrough with custom validation)
registerAdapter(new (class extends OpenRouterAdapter {
  readonly providerType = 'anthropic';
  readonly apiPath = '/v1/messages';

  // Anthropic doesn't have GET /v1/models; validate via minimal POST
  async validate(baseUrl: string, apiKey: string): Promise<ValidationResult> {
    try {
      const resp = await upstreamFetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok || resp.status === 400) {
        return { valid: true };
      }
      return { valid: false, error: `Anthropic validation failed: ${resp.status}` };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
})());

// DeepSeek (OpenAI-compatible at /v1/chat/completions)
registerAdapter(new (class extends OpenCodeAdapter {
  readonly providerType = 'deepseek';
  // Uses default OpenCodeAdapter: /v1/chat/completions
})());
