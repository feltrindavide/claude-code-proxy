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

  it('writes Claude tier IDs not upstream target models', async () => {
    const { writeModelEnvFile, CLAUDE_TIER_IDS } = await import('../../src/services/modelEnv.js');
    writeModelEnvFile();

    const envPath = join(tempHome, '.claude', 'claude-code-proxy', 'models.sh');
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, 'utf-8');
    expect(content).toContain(`ANTHROPIC_DEFAULT_OPUS_MODEL="${CLAUDE_TIER_IDS.opus}"`);
    expect(content).toContain(`ANTHROPIC_DEFAULT_SONNET_MODEL="${CLAUDE_TIER_IDS.sonnet}"`);
    expect(content).toContain(`ANTHROPIC_DEFAULT_HAIKU_MODEL="${CLAUDE_TIER_IDS.haiku}"`);
    expect(content).not.toContain('qwen');
  });
});
