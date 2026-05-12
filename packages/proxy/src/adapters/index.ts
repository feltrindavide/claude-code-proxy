/**
 * Adapter registry — factory and registration for provider adapters
 * Phase: 02-sse-streaming-integration
 * Plan: 02-01
 *
 * Map-based registry like ProviderService — adapters register on import
 */

import type { ProviderAdapter } from './interface.js';
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
registerAdapter(new CustomAdapter({ apiFormat: 'anthropic' }));
