/**
 * ModelEnvService — writes ANTHROPIC_DEFAULT_* env vars to ~/.claude/claude-code-proxy/models.sh
 * and syncs Claude Code settings (modelOverrides + gateway env).
 *
 * Enterprise orgs deliver server-managed availableModels, so the /model picker often stays
 * on native Opus/Sonnet/Haiku/Fable rows. modelOverrides route those IDs to upstream targets
 * via the proxy; NAME/DESCRIPTION customize labels when ANTHROPIC_BASE_URL is the gateway.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ClaudeTier, ModelRoute } from '../types/index.js';
import { providerService } from './provider.js';

/** Current Claude tier IDs (org-compatible aliases). */
export const CLAUDE_TIER_IDS = {
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5-20251001',
  fable: 'claude-fable-5',
} as const;

/** Legacy + current Anthropic IDs mapped to each tier for modelOverrides. */
export const CLAUDE_TIER_OVERRIDE_IDS: Record<ClaudeTier, readonly string[]> = {
  opus: [
    'claude-opus-4-8',
    'claude-opus-4-20250514',
    'claude-opus-4-7',
    'claude-opus-4-6',
  ],
  sonnet: [
    'claude-sonnet-5',
    'claude-sonnet-4-6',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5',
  ],
  haiku: [
    'claude-haiku-4-5-20251001',
    'claude-haiku-4-5',
    'claude-haiku-4-20250514',
    'claude-haiku-3-20250514',
  ],
  fable: ['claude-fable-5'],
};

const TIER_PICKER_LABELS: Record<ClaudeTier, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  fable: 'Fable 5',
};

const PROXY_BASE_URL = 'http://127.0.0.1:3456';

function configDir(): string {
  return join(homedir(), '.claude', 'claude-code-proxy');
}

function envFile(): string {
  return join(configDir(), 'models.sh');
}

function settingsFile(): string {
  return join(homedir(), '.claude', 'settings.json');
}

/** Short label for picker display (e.g. google/gemma-4-31b-it → gemma-4-31b-it). */
export function shortModelLabel(targetModel: string): string {
  const slash = targetModel.lastIndexOf('/');
  return slash >= 0 ? targetModel.slice(slash + 1) : targetModel;
}

/** Unique picker name: tier + upstream model (avoids duplicate rows when tiers share a model). */
export function tierModelName(tier: ClaudeTier, targetModel: string): string {
  return `${TIER_PICKER_LABELS[tier]} · ${shortModelLabel(targetModel)}`;
}

/** Picker description with provider routing context. */
export function tierModelDescription(providerName: string, targetModel: string): string {
  return `Claude Code Proxy → ${providerName} · ${targetModel}`;
}

function shellEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

type TierPrefix = 'OPUS' | 'SONNET' | 'HAIKU' | 'FABLE';

const TIER_TO_PREFIX: Record<ClaudeTier, TierPrefix> = {
  opus: 'OPUS',
  sonnet: 'SONNET',
  haiku: 'HAIKU',
  fable: 'FABLE',
};

/** Build modelOverrides: Anthropic picker IDs → upstream target models. */
export function buildModelOverrides(
  routesByTier: Map<ClaudeTier, ModelRoute>,
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const tier of Object.keys(CLAUDE_TIER_OVERRIDE_IDS) as ClaudeTier[]) {
    const route = routesByTier.get(tier);
    if (!route) continue;
    for (const anthropicId of CLAUDE_TIER_OVERRIDE_IDS[tier]) {
      overrides[anthropicId] = route.targetModel;
    }
  }
  return overrides;
}

function pushModelEnv(
  lines: string[],
  envVars: Record<string, string>,
  tier: ClaudeTier,
  route: ModelRoute,
): void {
  const prefix = TIER_TO_PREFIX[tier];
  const { providerName, targetModel } = route;
  const claudeId = CLAUDE_TIER_IDS[tier];
  const name = tierModelName(tier, targetModel);
  const description = tierModelDescription(providerName, targetModel);

  // Tier Claude ID in env (org allowlist-safe); upstream via modelOverrides.
  lines.push(`export ANTHROPIC_DEFAULT_${prefix}_MODEL="${shellEscape(claudeId)}"`);
  lines.push(`export ANTHROPIC_DEFAULT_${prefix}_MODEL_NAME="${shellEscape(name)}"`);
  lines.push(`export ANTHROPIC_DEFAULT_${prefix}_MODEL_DESCRIPTION="${shellEscape(description)}"`);

  envVars[`ANTHROPIC_DEFAULT_${prefix}_MODEL`] = claudeId;
  envVars[`ANTHROPIC_DEFAULT_${prefix}_MODEL_NAME`] = name;
  envVars[`ANTHROPIC_DEFAULT_${prefix}_MODEL_DESCRIPTION`] = description;
}

/**
 * Sync ~/.claude/settings.json: gateway env, modelOverrides, optional picker allowlist.
 */
export function syncClaudeCodePickerSettings(
  envVars: Record<string, string>,
  modelOverrides: Record<string, string>,
): void {
  const settingsPath = settingsFile();
  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  }

  // Non-org installs: hide native catalog noise. Org server-managed settings override this.
  settings.availableModels = ['default', 'opus', 'sonnet', 'haiku', 'fable'];
  settings.enforceAvailableModels = true;

  const existingOverrides = (settings.modelOverrides as Record<string, string>) || {};
  settings.modelOverrides = { ...existingOverrides, ...modelOverrides };

  const env = (settings.env as Record<string, string>) || {};
  env.ANTHROPIC_BASE_URL = PROXY_BASE_URL;
  env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = '0';
  Object.assign(env, envVars);
  settings.env = env;

  const proxyMeta = (settings._claudeCodeProxy as Record<string, unknown>) || {};
  proxyMeta.pickerManaged = true;
  proxyMeta.orgNote =
    'Enterprise org settings may keep native picker labels; modelOverrides route traffic to your mapped models.';
  proxyMeta.updatedAt = new Date().toISOString();
  settings._claudeCodeProxy = proxyMeta;

  mkdirSync(join(homedir(), '.claude'), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Write model env vars file based on current route configuration.
 */
export function writeModelEnvFile(): void {
  try {
    const routes = providerService.getRoutes();
    const routesByTier = new Map<ClaudeTier, ModelRoute>();
    for (const route of routes) {
      if (!route.providerName?.trim() || !route.targetModel?.trim()) continue;
      routesByTier.set(route.claudeTier, route);
    }

    const defaultModel = CLAUDE_TIER_IDS.sonnet;
    const modelOverrides = buildModelOverrides(routesByTier);

    const lines = [
      '#!/bin/bash',
      '# Auto-generated by Claude Code Proxy',
      '# Updates when Model Mapping is saved in the UI',
      '# Tier aliases use Claude IDs; modelOverrides (in settings.json) map them to upstream models.',
      `export ANTHROPIC_BASE_URL="${PROXY_BASE_URL}"`,
      'export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY="0"',
      `export ANTHROPIC_DEFAULT_MODEL="${shellEscape(defaultModel)}"`,
    ];
    const envVars: Record<string, string> = {
      ANTHROPIC_DEFAULT_MODEL: defaultModel,
    };

    const tierOrder: ClaudeTier[] = ['opus', 'fable', 'sonnet', 'haiku'];
    for (const tier of tierOrder) {
      const route = routesByTier.get(tier);
      if (route) pushModelEnv(lines, envVars, tier, route);
    }

    if (!existsSync(configDir())) {
      mkdirSync(configDir(), { recursive: true });
    }

    writeFileSync(envFile(), lines.join('\n') + '\n', { mode: 0o644 });
    syncClaudeCodePickerSettings(envVars, modelOverrides);
    console.log(`[ModelEnv] Wrote ${envFile()} and synced Claude Code picker settings`);
  } catch (error) {
    console.error('[ModelEnv] Error writing env file:', error);
  }
}
