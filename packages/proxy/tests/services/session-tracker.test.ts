/**
 * Session tracker tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('session-tracker', () => {
  let tempHome: string;
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    tempHome = mkdtempSync(join(tmpdir(), 'ccp-session-'));
    process.env.HOME = tempHome;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  async function loadModule() {
    return import('../../src/services/session-tracker.js');
  }

  it('extractSessionId from user_session format', async () => {
    const { extractSessionId } = await loadModule();
    expect(
      extractSessionId({ metadata: { user_id: 'user_abc_session_sess-123' } }),
    ).toBe('sess-123');
  });

  it('extractSessionId from JSON string metadata', async () => {
    const { extractSessionId } = await loadModule();
    expect(
      extractSessionId({
        metadata: { user_id: JSON.stringify({ session_id: 'desktop-sess' }) },
      }),
    ).toBe('desktop-sess');
  });

  it('extractSessionId from object metadata', async () => {
    const { extractSessionId } = await loadModule();
    expect(
      extractSessionId({
        metadata: { user_id: { session_id: 'obj-sess' } },
      }),
    ).toBe('obj-sess');
  });

  it('updateSessionUsage and getSessionUsage round-trip', async () => {
    const { updateSessionUsage, getSessionUsage, getLastActiveSessionId } = await loadModule();
    const usage = {
      inputTokens: 100,
      outputTokens: 50,
      model: 'claude-sonnet-4-20250514',
      provider: 'openrouter',
      tier: 'sonnet',
      inflation: 1,
    };

    updateSessionUsage('sess-1', usage);
    expect(getSessionUsage('sess-1')).toEqual(usage);
    expect(getLastActiveSessionId()).toBe('sess-1');
  });

  it('getSessionUsage returns null for unknown session', async () => {
    const { getSessionUsage } = await loadModule();
    expect(getSessionUsage('missing')).toBeNull();
  });

  it('uses __default__ key when sessionId is null', async () => {
    const { updateSessionUsage, getSessionUsage } = await loadModule();
    updateSessionUsage(null, {
      inputTokens: 1,
      outputTokens: 2,
      model: 'm',
      provider: 'p',
      inflation: 1,
    });
    expect(getSessionUsage('__default__')).toMatchObject({ model: 'm' });
  });
});
