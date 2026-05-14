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

const adapters = new Map<string, ProviderAdapter>();

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
  // Check for format suffix
  if (providerType.toLowerCase().endsWith('-anthropic')) {
    return new CustomAdapter({ apiFormat: 'anthropic' });
  }
  // Fallback to custom OpenAI-compatible adapter
  return new CustomAdapter({ apiFormat: 'openai' });
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
      const resp = await fetch(`${baseUrl}/v1/messages`, {
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
