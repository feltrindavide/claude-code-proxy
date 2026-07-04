/**
 * OpenRouter catalog import — fetch /v1/models and merge into provider config.
 */

import { getKey } from './keychain.js';
import { providerService } from './provider.js';
import { configService } from './config.js';
import { contextRegistry } from './context-registry.js';
import { upstreamFetch } from './upstream-http.js';
import { inferCostTier } from './smart-router.js';

export type OpenRouterImportFilter = 'all' | 'free' | 'paid';

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  costTier: ReturnType<typeof inferCostTier>;
  contextLength?: number;
}

export interface OpenRouterImportResult {
  providerName: string;
  added: string[];
  total: number;
  catalogSize: number;
  filter: OpenRouterImportFilter;
}

interface OpenRouterApiModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

export async function importOpenRouterCatalog(
  providerName: string,
  filter: OpenRouterImportFilter = 'all',
): Promise<OpenRouterImportResult> {
  const provider = providerService.getProvider(providerName);
  if (!provider) {
    throw new Error(`Provider not found: ${providerName}`);
  }

  const type = (provider.providerType || provider.name).toLowerCase();
  if (!type.includes('openrouter')) {
    throw new Error('Provider is not OpenRouter');
  }

  const apiKey = await getKey(providerName);
  if (!apiKey) {
    throw new Error('API key required for OpenRouter import');
  }

  const response = await upstreamFetch('https://openrouter.ai/api/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/feltrindavide/claude-code-proxy',
      'X-Title': 'Claude Code Proxy',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const payload = await response.json() as { data?: OpenRouterApiModel[] };
  const catalog = payload.data ?? [];

  const filtered = catalog.filter((m) => {
    const id = m.id.toLowerCase();
    const isFree = id.includes(':free') || id.endsWith('/free');
    if (filter === 'free') return isFree;
    if (filter === 'paid') return !isFree;
    return true;
  });

  const ids = filtered.map((m) => m.id).sort();
  const existing = new Set(provider.models);
  const added = ids.filter((id) => !existing.has(id));

  const mergedModels = [...provider.models, ...added];
  providerService.registerProvider({ ...provider, models: mergedModels });

  const config = configService.load();
  const idx = config.providers.findIndex((p) => p.name === providerName);
  const entry = {
    name: provider.name,
    baseUrl: provider.baseUrl,
    keyId: provider.keyId || provider.name,
    providerType: provider.providerType,
    models: mergedModels,
    enabled: provider.enabled,
    priority: provider.priority,
  };
  if (idx >= 0) {
    config.providers[idx] = entry;
  } else {
    config.providers.push(entry);
  }
  configService.save(config);
  contextRegistry.syncFromConfig(providerService.getProviders());

  return {
    providerName,
    added,
    total: mergedModels.length,
    catalogSize: ids.length,
    filter,
  };
}

export function listOpenRouterCatalogPreview(
  models: OpenRouterApiModel[],
  filter: OpenRouterImportFilter,
): OpenRouterModelInfo[] {
  return models
    .filter((m) => {
      const id = m.id.toLowerCase();
      const isFree = id.includes(':free') || id.endsWith('/free');
      if (filter === 'free') return isFree;
      if (filter === 'paid') return !isFree;
      return true;
    })
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      costTier: inferCostTier(m.id),
      contextLength: m.context_length,
    }));
}
