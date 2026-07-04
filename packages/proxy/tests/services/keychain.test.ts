/**
 * Keychain / SecretStore tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SecretStore', () => {
  let tempHome: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'ccp-keychain-test-'));
    process.env.HOME = tempHome;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('setKey() stores and getKey() retrieves API key', async () => {
    const { setKey, getKey } = await import('../../src/services/keychain.js');
    await setKey('openrouter', 'sk-test-key-12345');
    const key = await getKey('openrouter');
    expect(key).toBe('sk-test-key-12345');
  });

  it('hasKey() returns true when key exists', async () => {
    const { setKey, hasKey } = await import('../../src/services/keychain.js');
    await setKey('openrouter', 'sk-test-key');
    expect(await hasKey('openrouter')).toBe(true);
    expect(await hasKey('missing')).toBe(false);
  });

  it('deleteKey() removes stored key', async () => {
    const { setKey, deleteKey, hasKey } = await import('../../src/services/keychain.js');
    await setKey('openrouter', 'sk-test-key');
    await deleteKey('openrouter');
    expect(await hasKey('openrouter')).toBe(false);
  });

  it('maskKey() returns **** for keys shorter than 8 chars', async () => {
    const { maskKey } = await import('../../src/services/keychain.js');
    expect(maskKey('short')).toBe('••••');
  });

  it('maskKey() returns first 4 + last 4 chars for longer keys', async () => {
    const { maskKey } = await import('../../src/services/keychain.js');
    expect(maskKey('sk-ant-api-key-12345')).toBe('sk-a...2345');
  });

  it('stores secrets in AES-GCM format (v2)', async () => {
    const { setKey } = await import('../../src/services/keychain.js');
    const { readFileSync } = await import('fs');
    await setKey('test', 'my-secret-key');
    const secretsPath = join(tempHome, '.claude', 'claude-code-proxy', 'data', 'secrets.json');
    expect(existsSync(secretsPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(secretsPath, 'utf-8'));
    expect(parsed.test.v).toBe(2);
    expect(parsed.test.iv).toBeDefined();
    expect(parsed.test.tag).toBeDefined();
    expect(parsed.test.data).toBeDefined();
  });

  it('migrates legacy XOR format to AES-GCM on load', async () => {
    const { writeFileSync, mkdirSync } = await import('fs');
    const { join } = await import('path');

    // Write legacy XOR-encoded secret
    const plain = 'legacy-api-key';
    const buf = Buffer.from(plain, 'utf-8');
    const key = 'ccp-2024-local-proxy-key-do-not-share';
    for (let i = 0; i < buf.length; i++) {
      buf[i] ^= key.charCodeAt(i % key.length);
    }
    const legacyEncoded = buf.toString('base64');

    const dataDir = join(tempHome, '.claude', 'claude-code-proxy', 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, 'secrets.json'),
      JSON.stringify({ legacy: legacyEncoded }),
      { mode: 0o600 },
    );

    vi.resetModules();
    const { getKey } = await import('../../src/services/keychain.js');
    const retrieved = await getKey('legacy');
    expect(retrieved).toBe(plain);

    const { readFileSync } = await import('fs');
    const migrated = JSON.parse(readFileSync(join(dataDir, 'secrets.json'), 'utf-8'));
    expect(migrated.legacy.v).toBe(2);
  });
});
