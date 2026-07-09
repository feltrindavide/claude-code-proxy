/**
 * Model env file tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('writeModelEnvFile', () => {
  let tempHome: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'ccp-model-env-'));
    process.env.HOME = tempHome;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('uses Claude tier IDs in env and modelOverrides for upstream routing', async () => {
    const { providerService } = await import('../../src/services/provider.js');
    providerService.setRoutes([
      { claudeTier: 'opus', providerName: 'opencode', targetModel: 'qwen3.6' },
      { claudeTier: 'sonnet', providerName: 'opencode', targetModel: 'qwen3.6' },
      { claudeTier: 'haiku', providerName: 'opencode', targetModel: 'nemotron' },
      { claudeTier: 'fable', providerName: 'opencode', targetModel: 'qwen3.6' },
    ]);

    const { writeModelEnvFile, CLAUDE_TIER_IDS } = await import('../../src/services/modelEnv.js');
    writeModelEnvFile();

    const envPath = join(tempHome, '.claude', 'claude-code-proxy', 'models.sh');
    const content = readFileSync(envPath, 'utf-8');
    expect(content).toContain(`ANTHROPIC_DEFAULT_OPUS_MODEL="${CLAUDE_TIER_IDS.opus}"`);
    expect(content).toContain('ANTHROPIC_DEFAULT_OPUS_MODEL_NAME="Opus · qwen3.6"');
    expect(content).toContain('ANTHROPIC_DEFAULT_FABLE_MODEL_NAME="Fable 5 · qwen3.6"');
    expect(content).not.toContain('ANTHROPIC_DEFAULT_OPUS_MODEL="qwen3.6"');

    const settings = JSON.parse(
      readFileSync(join(tempHome, '.claude', 'settings.json'), 'utf-8'),
    );
    expect(settings.modelOverrides['claude-opus-4-8']).toBe('qwen3.6');
    expect(settings.modelOverrides['claude-fable-5']).toBe('qwen3.6');
    expect(settings.modelOverrides['claude-haiku-4-5-20251001']).toBe('nemotron');
    expect(settings.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:3456');
  });
});

describe('buildModelOverrides', () => {
  it('maps all known Anthropic IDs for a tier', async () => {
    const { buildModelOverrides } = await import('../../src/services/modelEnv.js');
    const routes = new Map([
      ['opus', { claudeTier: 'opus', providerName: 'p', targetModel: 'm-opus' }],
    ] as const);
    const overrides = buildModelOverrides(routes as any);
    expect(overrides['claude-opus-4-8']).toBe('m-opus');
    expect(overrides['claude-opus-4-20250514']).toBe('m-opus');
  });
});

describe('tierModelName', () => {
  it('prefixes tier so duplicate upstream models stay distinct', async () => {
    const { tierModelName } = await import('../../src/services/modelEnv.js');
    expect(tierModelName('opus', 'qwen3.6')).toBe('Opus · qwen3.6');
    expect(tierModelName('fable', 'qwen3.6')).toBe('Fable 5 · qwen3.6');
  });
});
