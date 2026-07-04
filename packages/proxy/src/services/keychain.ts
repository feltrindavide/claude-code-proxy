/**
 * SecretStore — stores API keys in ~/.claude/claude-code-proxy/data/secrets.json
 * Encrypted with AES-256-GCM; master key stored in macOS Keychain.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const KEYCHAIN_SERVICE = 'claude-code-proxy';
const KEYCHAIN_ACCOUNT = 'secrets-master-key';

// Legacy XOR obfuscation (v1) — migrated on load
const LEGACY_OBFUSCATION_KEY = 'ccp-2024-local-proxy-key-do-not-share';

function configDir(): string {
  return join(homedir(), '.claude', 'claude-code-proxy');
}

function secretsFile(): string {
  return join(configDir(), 'data', 'secrets.json');
}

interface EncryptedEntry {
  v: 2;
  iv: string;
  tag: string;
  data: string;
}

type StoredSecrets = Record<string, string | EncryptedEntry>;

function ensureDataDir(): void {
  const dir = join(configDir(), 'data');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function getMasterKey(): Buffer {
  // Avoid slow Keychain prompts in vitest / headless environments
  if (process.env.VITEST === 'true') {
    return scryptSync(configDir(), 'ccp-fallback-salt-v2', 32);
  }

  try {
    const existing = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 2000 },
    ).trim();
    if (existing && /^[0-9a-f]{64}$/i.test(existing)) {
      return Buffer.from(existing, 'hex');
    }
  } catch {
    // Keychain miss — create or fall through
  }

  const key = randomBytes(32);
  try {
    execSync(
      `security add-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w "${key.toString('hex')}" -U`,
      { timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return key;
  } catch {
    console.warn('[SecretStore] Keychain unavailable — using machine-derived fallback key');
    return scryptSync(configDir(), 'ccp-fallback-salt-v2', 32);
  }
}

function legacyDeobfuscate(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  for (let i = 0; i < buf.length; i++) {
    buf[i] ^= LEGACY_OBFUSCATION_KEY.charCodeAt(i % LEGACY_OBFUSCATION_KEY.length);
  }
  return buf.toString('utf-8');
}

function encrypt(plaintext: string, masterKey: Buffer): EncryptedEntry {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    v: 2,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  };
}

function decrypt(entry: EncryptedEntry, masterKey: Buffer): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    masterKey,
    Buffer.from(entry.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.data, 'base64')),
    decipher.final(),
  ]).toString('utf-8');
}

function decodeEntry(value: string | EncryptedEntry, masterKey: Buffer): string {
  if (typeof value === 'string') {
    return legacyDeobfuscate(value);
  }
  if (value.v === 2) {
    return decrypt(value, masterKey);
  }
  throw new Error('Unknown secret format');
}

function loadSecretsRaw(): StoredSecrets {
  ensureDataDir();
  const file = secretsFile();
  try {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf-8')) as StoredSecrets;
    }
  } catch {
    console.error('[SecretStore] Failed to load secrets, starting fresh');
  }
  return {};
}

function loadSecrets(): Record<string, string> {
  const raw = loadSecretsRaw();
  const masterKey = getMasterKey();
  const result: Record<string, string> = {};
  let needsMigration = false;

  for (const [name, value] of Object.entries(raw)) {
    result[name] = decodeEntry(value, masterKey);
    if (typeof value === 'string') {
      needsMigration = true;
    }
  }

  if (needsMigration && Object.keys(result).length > 0) {
    saveSecrets(result);
    console.log('[SecretStore] Migrated secrets from legacy XOR to AES-256-GCM');
  }

  return result;
}

function saveSecrets(secrets: Record<string, string>): void {
  ensureDataDir();
  const masterKey = getMasterKey();
  const encoded: Record<string, EncryptedEntry> = {};
  for (const [name, value] of Object.entries(secrets)) {
    encoded[name] = encrypt(value, masterKey);
  }
  if (existsSync(secretsFile())) {
    copyFileSync(secretsFile(), `${secretsFile()}.bak`);
  }
  writeFileSync(secretsFile(), JSON.stringify(encoded, null, 2), { mode: 0o600 });
}

/** Mask API key for display */
export function maskKey(key: string): string {
  if (key.length < 8) return '••••';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export async function setKey(providerName: string, apiKey: string): Promise<void> {
  const secrets = loadSecrets();
  secrets[providerName] = apiKey;
  saveSecrets(secrets);
}

export async function getKey(providerName: string): Promise<string | null> {
  const secrets = loadSecrets();
  return secrets[providerName] || null;
}

export async function hasKey(providerName: string): Promise<boolean> {
  const secrets = loadSecrets();
  return providerName in secrets;
}

export async function deleteKey(providerName: string): Promise<void> {
  const secrets = loadSecrets();
  delete secrets[providerName];
  saveSecrets(secrets);
}
