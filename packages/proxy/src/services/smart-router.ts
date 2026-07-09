/**
 * Smart routing — candidate ordering by circuit, latency, cost tier, and A/B experiments.
 */

import crypto from 'crypto';
import type {
  ClaudeTier,
  CostTier,
  ModelRoute,
  RouteCandidate,
  RouteExperiment,
  RouteResolution,
} from '../types/index.js';
import { providerService } from './provider.js';
import { circuitBreakerService } from './circuit-breaker.js';
import { latencyTracker } from './latency-tracker.js';
import { configService } from './config.js';
import { logger } from '../lib/logger.js';

const DEFAULT_TIER_FALLBACK: ClaudeTier[] = ['opus', 'sonnet', 'haiku'];

const COST_ORDER: Record<CostTier, number> = {
  free: 0,
  cheap: 1,
  standard: 2,
  premium: 3,
};

const TIER_COST_PREFERENCE: Record<ClaudeTier, CostTier[]> = {
  haiku: ['free', 'cheap', 'standard', 'premium'],
  sonnet: ['cheap', 'standard', 'free', 'premium'],
  opus: ['premium', 'standard', 'cheap', 'free'],
  fable: ['premium', 'standard', 'cheap', 'free'],
};

export function inferCostTier(modelId: string, explicit?: CostTier): CostTier {
  if (explicit) return explicit;
  const lower = modelId.toLowerCase();
  if (lower.includes(':free') || lower.endsWith('/free')) return 'free';
  if (lower.includes('haiku') || lower.includes('flash') || lower.includes('mini')) return 'cheap';
  if (lower.includes('opus') || lower.includes('pro') || lower.includes('gpt-4')) return 'premium';
  return 'standard';
}

function costPreferenceScore(tier: ClaudeTier, costTier: CostTier): number {
  const prefs = TIER_COST_PREFERENCE[tier];
  const idx = prefs.indexOf(costTier);
  return idx === -1 ? prefs.length : idx;
}

function hashSticky(input: string): number {
  const h = crypto.createHash('sha256').update(input).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

export function pickExperimentVariant(
  experiment: RouteExperiment,
  stickyKey: string,
): RouteExperiment['variants'][number] | null {
  if (!experiment.enabled || experiment.variants.length === 0) return null;

  const totalWeight = experiment.variants.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return experiment.variants[0];

  const roll = hashSticky(`${experiment.id}:${stickyKey}`) * totalWeight;
  let acc = 0;
  for (const variant of experiment.variants) {
    acc += variant.weight;
    if (roll <= acc) return variant;
  }
  return experiment.variants[experiment.variants.length - 1];
}

function buildCandidateResolution(
  modelName: string,
  candidate: RouteCandidate,
  claudeTier?: ClaudeTier,
  extras?: Partial<RouteResolution>,
): RouteResolution | null {
  const provider = providerService.getProvider(candidate.providerName);
  if (!provider?.enabled) return null;

  return {
    provider,
    targetModel: candidate.targetModel,
    originalModel: modelName,
    claudeTier,
    costTier: inferCostTier(candidate.targetModel, candidate.costTier),
    candidatePriority: candidate.priority ?? 0,
    ...extras,
  };
}

export function expandRouteCandidates(route: ModelRoute, modelName: string): RouteResolution[] {
  const tier = route.claudeTier;
  const primary: RouteCandidate = {
    providerName: route.providerName,
    targetModel: route.targetModel,
    priority: 0,
    costTier: route.candidates?.[0]?.costTier,
  };

  const rawCandidates: RouteCandidate[] = [
    primary,
    ...(route.candidates ?? []).filter(
      (c) => !(c.providerName === route.providerName && c.targetModel === route.targetModel),
    ),
  ];

  const resolutions: RouteResolution[] = [];
  for (const c of rawCandidates) {
    const res = buildCandidateResolution(modelName, c, tier);
    if (res) resolutions.push(res);
  }
  return resolutions;
}

export function sortCandidates(
  candidates: RouteResolution[],
  tier: ClaudeTier,
  routingPrefs?: { preferLowLatency?: boolean; preferLowCost?: boolean },
): RouteResolution[] {
  return [...candidates].sort((a, b) => {
    const aOpen = circuitBreakerService.canRequest(a.provider.name) ? 0 : 1;
    const bOpen = circuitBreakerService.canRequest(b.provider.name) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    const aLat = latencyTracker.latencyScore(a.provider.name, a.targetModel);
    const bLat = latencyTracker.latencyScore(b.provider.name, b.targetModel);

    if (routingPrefs?.preferLowLatency && aLat !== bLat) {
      return aLat - bLat;
    }

    const aCost = costPreferenceScore(tier, a.costTier ?? 'standard');
    const bCost = costPreferenceScore(tier, b.costTier ?? 'standard');
    if (routingPrefs?.preferLowCost && aCost !== bCost) {
      return aCost - bCost;
    }
    if (!routingPrefs?.preferLowLatency && aCost !== bCost) {
      return aCost - bCost;
    }

    if (!routingPrefs?.preferLowLatency && aLat !== bLat) {
      return aLat - bLat;
    }

    const aPri = a.candidatePriority ?? 0;
    const bPri = b.candidatePriority ?? 0;
    return aPri - bPri;
  });
}

export function resolveTierFallbackChain(
  modelName: string,
  current: RouteResolution,
  tierFallback: ClaudeTier[] = DEFAULT_TIER_FALLBACK,
): RouteResolution[] {
  const tier = current.claudeTier;
  if (!tier) return [];

  const startIdx = tierFallback.indexOf(tier);
  if (startIdx < 0) return [];

  const results: RouteResolution[] = [];

  for (let i = startIdx + 1; i < tierFallback.length; i++) {
    const fallbackTier = tierFallback[i];
    const route = providerService.getRoutes().find((r) => r.claudeTier === fallbackTier);
    if (!route) continue;

    const candidates = expandRouteCandidates(route, modelName);
    const sorted = sortCandidates(candidates, fallbackTier, configService.load().routing);
    for (const c of sorted) {
      if (!circuitBreakerService.canRequest(c.provider.name)) continue;
      results.push({ ...c, fallbackTier: true });
    }
  }

  return results;
}

export interface SmartRouteResult {
  candidates: RouteResolution[];
  experimentId?: string;
  experimentVariant?: string;
}

export function buildSmartRoute(
  modelName: string,
  primary: RouteResolution,
  opts?: { stickyKey?: string },
): SmartRouteResult {
  const tier = primary.claudeTier;
  if (!tier) {
    return { candidates: [primary] };
  }

  const config = configService.load();
  const route = providerService.getRoutes().find((r) => r.claudeTier === tier);
  const tierFallback = route?.tierFallback ?? config.routing?.tierFallback ?? DEFAULT_TIER_FALLBACK;

  let candidates: RouteResolution[] = [];
  let experimentId: string | undefined;
  let experimentVariant: string | undefined;

  const experiments = config.experiments ?? [];
  const experiment = experiments.find((e) => e.enabled && e.tier === tier);
  const stickyKey = opts?.stickyKey ?? modelName;

  if (experiment) {
    const variant = pickExperimentVariant(experiment, stickyKey);
    if (variant) {
      const expRes = buildCandidateResolution(modelName, {
        providerName: variant.providerName,
        targetModel: variant.targetModel,
      }, tier, {
        experimentId: experiment.id,
        experimentVariant: variant.name,
      });
      if (expRes) {
        experimentId = experiment.id;
        experimentVariant = variant.name;
        candidates.push(expRes);
        logger.info(
          { experimentId, variant: variant.name, provider: variant.providerName },
          'A/B experiment variant selected',
        );
      }
    }
  }

  const routingPrefs = config.routing;

  if (route) {
    const routeCandidates = expandRouteCandidates(route, modelName);
    candidates.push(...routeCandidates.filter(
      (c) => !candidates.some(
        (x) => x.provider.name === c.provider.name && x.targetModel === c.targetModel,
      ),
    ));
  } else {
    candidates.push(primary);
  }

  candidates = sortCandidates(candidates, tier, routingPrefs);

  const tierFallbackCandidates = resolveTierFallbackChain(modelName, primary, tierFallback);
  for (const fb of tierFallbackCandidates) {
    const dup = candidates.some(
      (c) => c.provider.name === fb.provider.name && c.targetModel === fb.targetModel,
    );
    if (!dup) candidates.push(fb);
  }

  if (candidates.length === 0) candidates = [primary];

  return {
    candidates,
    experimentId,
    experimentVariant,
  };
}
