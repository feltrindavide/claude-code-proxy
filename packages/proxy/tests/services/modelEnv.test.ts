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

  it('writes upstream target models and Fable mapping from routes', async () => {
    const { providerService } = await import('../../src/services/provider.js');
    providerService.setRoutes([
      { claudeTier: 'opus', providerName: 'nvidia-nim', targetModel: 'google/gemma-4-31b-it' },
      { claudeTier: 'sonnet', providerName: 'nvidia-nim', targetModel: 'z-ai/glm-5.2' },
      { claudeTier: 'haiku', providerName: 'nvidia-nim', targetModel: 'moonshotai/kimi-k2.6' },
      { claudeTier: 'fable', providerName: 'nvidia-nim', targetModel: 'deepseek-ai/deepseek-v4-pro' },
    ]);

    const { writeModelEnvFile } = await import('../../src/services/modelEnv.js');
    writeModelEnvFile();

    const envPath = join(tempHome, '.claude', 'claude-code-proxy', 'models.sh');
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, 'utf-8');
    expect(content).toContain('ANTHROPIC_DEFAULT_MODEL="z-ai/glm-5.2"');
    expect(content).toContain('ANTHROPIC_DEFAULT_OPUS_MODEL="google/gemma-4-31b-it"');
    expect(content).toContain('ANTHROPIC_DEFAULT_SONNET_MODEL="z-ai/glm-5.2"');
    expect(content).toContain('ANTHROPIC_DEFAULT_HAIKU_MODEL="moonshotai/kimi-k2.6"');
    expect(content).toContain('ANTHROPIC_DEFAULT_FABLE_MODEL="deepseek-ai/deepseek-v4-pro"');
    expect(content).toContain('ANTHROPIC_DEFAULT_OPUS_MODEL_NAME="gemma-4-31b-it"');
    expect(content).not.toContain('claude-opus-4-20250514');
  });
});

describe('shortModelLabel', () => {
  it('strips provider namespace from model id', async () => {
    const { shortModelLabel } = await import('../../src/services/modelEnv.js');
    expect(shortModelLabel('google/gemma-4-31b-it')).toBe('gemma-4-31b-it');
    expect(shortModelLabel('plain-model')).toBe('plain-model');
  });
});
