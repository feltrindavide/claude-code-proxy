/**
 * Route resolution — shared logic for proxy handler and middleware.
 */

import type { ClaudeTier, RouteResolution } from '../types/index.js';
import { providerService } from './provider.js';
import { configService } from './config.js';
import { circuitBreakerService } from './circuit-breaker.js';
import { logger } from '../lib/logger.js';

const SUBAGENT_TAG_RE = /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s;
const TIER_FALLBACK: ClaudeTier[] = ['opus', 'sonnet', 'haiku'];

function extractTier(modelName: string): ClaudeTier | null {
  const lower = modelName.toLowerCase();
  if (lower.startsWith('claude-opus')) return 'opus';
  if (lower.startsWith('claude-sonnet')) return 'sonnet';
  if (lower.startsWith('claude-haiku')) return 'haiku';
  return null;
}

function getSystemRaw(body: Record<string, unknown>): string {
  const system = body.system;
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .filter((b: { type?: string }) => b.type === 'text')
      .map((b: { text?: string }) => b.text || '')
      .join('\n');
  }
  return '';
}

export function extractSubagentModel(body: Record<string, unknown>): string | null {
  const systemStr = getSystemRaw(body);
  if (!systemStr) return null;

  const match = systemStr.match(SUBAGENT_TAG_RE);
  if (!match) return null;

  const modelName = match[1].trim();
  if (!modelName) return null;

  const cleaned = systemStr.replace(SUBAGENT_TAG_RE, '').trim();
  if (typeof body.system === 'string') {
    body.system = cleaned;
  } else if (Array.isArray(body.system)) {
    for (const b of body.system as Array<{ type?: string; text?: string }>) {
      if (b.type === 'text') {
        b.text = (b.text || '').replace(SUBAGENT_TAG_RE, '').trim();
        break;
      }
    }
  }

  logger.info({ modelName, original: body.model }, 'Subagent model tag resolved');
  return modelName;
}

export function isSubagentRequest(body: Record<string, unknown>): boolean {
  const sys = getSystemRaw(body).toLowerCase();
  if (sys.includes('ccr-subagent') || sys.includes('subagent')) return true;

  const metadata = body.metadata as Record<string, unknown> | undefined;
  if (metadata?.subagent === true || metadata?.is_subagent === true) return true;

  const messages = body.messages as Array<{ role: string; content: unknown }> | undefined;
  if (messages?.length) {
    const last = messages[messages.length - 1];
    const content = JSON.stringify(last.content ?? '').toLowerCase();
    if (content.includes('"name":"task"') || content.includes('"name":"agent"')) {
      return true;
    }
  }

  return false;
}

function resolveModelToRoute(modelName: string): RouteResolution | null {
  if (modelName.startsWith('anthropic/')) {
    const parts = modelName.split('/');
    if (parts.length >= 3) {
      const providerName = parts[1];
      const targetModel = parts.slice(2).join('/');
      const provider = providerService.getProvider(providerName);
      if (provider) {
        return {
          provider,
          targetModel,
          originalModel: modelName,
        };
      }
    }
  }

  const custom = providerService.resolveCustomModel(modelName);
  if (custom) return custom;

  return providerService.resolveModelRoute(modelName);
}

function resolveTierFallback(
  modelName: string,
  current: RouteResolution,
): RouteResolution | null {
  const tier = current.claudeTier || extractTier(modelName);
  if (!tier) return null;

  const startIdx = TIER_FALLBACK.indexOf(tier);
  for (let i = startIdx + 1; i < TIER_FALLBACK.length; i++) {
    const fallbackTier = TIER_FALLBACK[i];
    const route = providerService.getRoutes().find((r) => r.claudeTier === fallbackTier);
    if (!route) continue;

    const provider = providerService.getProvider(route.providerName);
    if (!provider?.enabled) continue;
    if (!circuitBreakerService.canRequest(provider.name)) continue;

    logger.warn(
      { from: tier, to: fallbackTier, provider: provider.name },
      'Circuit open — falling back to lower tier',
    );

    return {
      provider,
      targetModel: route.targetModel,
      originalModel: modelName,
      claudeTier: fallbackTier,
      fallbackTier: true,
    };
  }

  return null;
}

function applyCircuitBreaker(resolution: RouteResolution, modelName: string): RouteResolution | null {
  if (circuitBreakerService.canRequest(resolution.provider.name)) {
    return resolution;
  }
  return resolveTierFallback(modelName, resolution);
}

export interface ResolveRequestResult {
  modelName: string;
  resolution: RouteResolution | null;
}

export function resolveRequest(body: Record<string, unknown>): ResolveRequestResult {
  let modelName = (body.model as string) || 'claude-opus-4-20250514';

  const taggedModel = extractSubagentModel(body);
  if (taggedModel) {
    modelName = taggedModel;
  } else {
    const config = configService.load();
    if (config.subagentModel && isSubagentRequest(body)) {
      modelName = config.subagentModel;
      logger.info({ modelName }, 'Subagent model from config');
    }
  }

  let resolution = resolveModelToRoute(modelName);
  if (resolution) {
    resolution = applyCircuitBreaker(resolution, modelName);
  }

  return { modelName, resolution };
}
