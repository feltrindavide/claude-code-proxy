/**
 * SecretStore — stores API keys in ~/.claude/claude-code-proxy/data/secrets.json
 * Encrypted with AES-256-GCM; master key stored in macOS Keychain.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const KEYCHAIN_SERVICE = 'claude-code-proxy';
const KEYCHAIN_ACCOUNT = 'secrets-master-key';

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

type StoredSecrets = Record<string, EncryptedEntry>;

function ensureDataDir(): void {
  const dir = join(configDir(), 'data');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

class KeychainUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeychainUnavailableError';
  }
}

function getMasterKey(): Buffer {
  if (process.env.VITEST === 'true') {
    const testKey = process.env.CCP_TEST_MASTER_KEY;
    if (testKey && /^[0-9a-f]{64}$/i.test(testKey)) {
      return Buffer.from(testKey, 'hex');
    }
    const generated = randomBytes(32);
    process.env.CCP_TEST_MASTER_KEY = generated.toString('hex');
    return generated;
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
    // Keychain miss — create below
  }

  const key = randomBytes(32);
  try {
    execSync(
      `security add-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w "${key.toString('hex')}" -U`,
      { timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return key;
  } catch {
    throw new KeychainUnavailableError(
      'macOS Keychain is required to store API secrets. Grant Keychain access or run on macOS.',
    );
  }
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

function loadSecretsRaw(): StoredSecrets {
  ensureDataDir();
  const file = secretsFile();
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
      for (const value of Object.values(parsed)) {
        if (typeof value === 'string') {
          throw new KeychainUnavailableError(
            'Legacy XOR-encoded secrets detected. Re-enter API keys via the admin dashboard.',
          );
        }
      }
      return parsed as StoredSecrets;
    }
  } catch (err) {
    if (err instanceof KeychainUnavailableError) throw err;
    console.error('[SecretStore] Failed to load secrets, starting fresh');
  }
  return {};
}

function loadSecrets(): Record<string, string> {
  const raw = loadSecretsRaw();
  const masterKey = getMasterKey();
  const result: Record<string, string> = {};

  for (const [name, value] of Object.entries(raw)) {
    if (value.v !== 2) {
      throw new KeychainUnavailableError(`Unsupported secret format for provider "${name}"`);
    }
    result[name] = decrypt(value, masterKey);
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

export { KeychainUnavailableError };
