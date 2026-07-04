/**
 * Route resolution — shared logic for proxy handler and middleware.
 */

import type { ClaudeTier, ResolveRequestResult, RouteResolution } from '../types/index.js';
import { providerService } from './provider.js';
import { configService } from './config.js';
import { circuitBreakerService } from './circuit-breaker.js';
import { buildSmartRoute } from './smart-router.js';
import { logger } from '../lib/logger.js';

const SUBAGENT_TAG_RE = /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s;

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
  if (extractSubagentModel(body)) return true;

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

function resolveAlias(modelName: string): string {
  const config = configService.load();
  const aliases = config.aliases;
  if (!aliases) return modelName;
  const mapped = aliases[modelName];
  return mapped || modelName;
}

function resolveModelToRoute(modelName: string): RouteResolution | null {
  if (modelName.startsWith('anthropic/')) {
    const parts = modelName.split('/');
    if (parts.length >= 3) {
      const providerName = parts[1];
      const targetModel = parts.slice(2).join('/');
      const provider = providerService.getProvider(providerName);
      if (provider?.enabled) {
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

function applyCircuitBreaker(resolution: RouteResolution): RouteResolution | null {
  if (circuitBreakerService.canRequest(resolution.provider.name)) {
    return resolution;
  }
  return null;
}

function buildStickyKey(
  body: Record<string, unknown>,
  modelName: string,
  preference?: 'session' | 'user',
): string {
  const metadata = body.metadata as Record<string, unknown> | undefined;

  if (preference === 'session') {
    const sessionId = metadata?.session_id ?? metadata?.sessionId;
    if (typeof sessionId === 'string' && sessionId.length > 0) return sessionId;
    return modelName;
  }

  if (preference === 'user') {
    const userId = metadata?.user_id;
    if (typeof userId === 'string' && userId.length > 0) return userId;
    const sessionId = metadata?.session_id ?? metadata?.sessionId;
    if (typeof sessionId === 'string' && sessionId.length > 0) return sessionId;
    return modelName;
  }

  const userId = metadata?.user_id;
  if (typeof userId === 'string' && userId.length > 0) return userId;

  const sessionId = metadata?.session_id ?? metadata?.sessionId;
  if (typeof sessionId === 'string' && sessionId.length > 0) return sessionId;

  return modelName;
}

export function resolveRequest(body: Record<string, unknown>): ResolveRequestResult {
  let modelName = (body.model as string) || 'claude-opus-4-20250514';
  modelName = resolveAlias(modelName);

  const taggedModel = extractSubagentModel(body);
  if (taggedModel) {
    modelName = resolveAlias(taggedModel);
  } else {
    const config = configService.load();
    if (config.subagentModel && isSubagentRequest(body)) {
      modelName = resolveAlias(config.subagentModel);
      logger.info({ modelName }, 'Subagent model from config');
    }
  }

  const primary = resolveModelToRoute(modelName);
  if (!primary) {
    return { modelName, resolution: null, candidates: [] };
  }

  const circuitOk = applyCircuitBreaker(primary);
  const config = configService.load();
  const experiment = primary.claudeTier
    ? config.experiments?.find((e) => e.enabled && e.tier === primary.claudeTier)
    : undefined;
  const stickyKey = buildStickyKey(body, modelName, experiment?.stickyKey);
  const smart = buildSmartRoute(modelName, primary, { stickyKey });

  let candidates = smart.candidates;
  if (!circuitOk && candidates.length > 0) {
    candidates = candidates.filter((c) => circuitBreakerService.canRequest(c.provider.name));
  }

  const resolution = candidates[0] ?? circuitOk ?? null;

  return {
    modelName,
    resolution,
    candidates: resolution ? candidates : [],
    experimentId: smart.experimentId,
    experimentVariant: smart.experimentVariant,
  };
}

export { extractTier };
