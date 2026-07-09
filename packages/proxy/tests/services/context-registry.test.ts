/**
 * Context registry tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ContextRegistry', () => {
  let tempHome: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'ccp-context-'));
    process.env.HOME = tempHome;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  async function loadRegistry() {
    const mod = await import('../../src/services/context-registry.js');
    return mod.ContextRegistry;
  }

  it('loads defaults when file is missing', async () => {
    const ContextRegistry = await loadRegistry();
    const registry = new ContextRegistry();
    const ctx = registry.load();

    expect(ctx.version).toBe(1);
    expect(ctx.default_context).toBe(200_000);
    expect(ctx.claude.opus).toBe(1_000_000);
    expect(ctx.models).toEqual([]);
  });

  it('persists and reloads model contexts', async () => {
    const ContextRegistry = await loadRegistry();
    const registry = new ContextRegistry();
    const ctx = registry.load();
    ctx.models.push({
      id: 'qwen3.6',
      provider: 'opencode',
      context: 1_000_000,
      max_output: 65_536,
    });
    registry.save(ctx);

    const registry2 = new ContextRegistry();
    const loaded = registry2.load();
    expect(loaded.models).toHaveLength(1);
    expect(loaded.models[0].id).toBe('qwen3.6');
    expect(existsSync(join(tempHome, '.claude', 'claude-code-proxy', 'proxy-context.json'))).toBe(true);
  });

  it('getClaudeContext returns tier defaults', async () => {
    const ContextRegistry = await loadRegistry();
    const registry = new ContextRegistry();
    expect(registry.getClaudeContext('sonnet')).toBe(1_000_000);
    expect(registry.getClaudeContext('haiku')).toBe(200_000);
    expect(registry.getClaudeContext('unknown')).toBe(200_000);
  });

  it('syncFromConfig adds models with known defaults', async () => {
    const ContextRegistry = await loadRegistry();
    const registry = new ContextRegistry();
    registry.syncFromConfig([
      { name: 'openrouter', models: ['deepseek/deepseek-v4-flash'] },
    ]);

    const entry = registry.getModelContext('deepseek/deepseek-v4-flash', 'openrouter');
    expect(entry).not.toBeNull();
    expect(entry?.context).toBe(1_048_576);
  });

  it('updateModelContexts merges discovered contexts', async () => {
    const ContextRegistry = await loadRegistry();
    const registry = new ContextRegistry();
    registry.updateModelContexts('openrouter', {
      'new-model': { context: 32000, max_output: 4096 },
    });

    const entry = registry.getModelContext('new-model', 'openrouter');
    expect(entry?.context).toBe(32000);
    expect(entry?.max_output).toBe(4096);
  });
});
