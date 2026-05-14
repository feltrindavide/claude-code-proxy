/**
 * SecretStore — stores API keys in ~/.claude-code-proxy/secrets.json
 * Replaces macOS Keychain (keytar) with a local encrypted file.
 * 
 * Uses XOR + base64 encoding for basic obfuscation at rest.
 * The file has 0o600 permissions (owner read/write only).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.claude', 'claude-code-proxy');
const SECRETS_FILE = join(CONFIG_DIR, 'data', 'secrets.json');

// Simple XOR key for obfuscation (not cryptographic security)
// This prevents casual reading of keys in the file while allowing
// the proxy to access them. Real security is provided by file permissions.
const OBFUSCATION_KEY = 'ccp-2024-local-proxy-key-do-not-share';

function obfuscate(text: string): string {
  const buf = Buffer.from(text, 'utf-8');
  for (let i = 0; i < buf.length; i++) {
    buf[i] ^= OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
  }
  return buf.toString('base64');
}

function deobfuscate(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  for (let i = 0; i < buf.length; i++) {
    buf[i] ^= OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
  }
  return buf.toString('utf-8');
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadSecrets(): Record<string, string> {
  ensureDir();
  try {
    if (existsSync(SECRETS_FILE)) {
      const content = readFileSync(SECRETS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = deobfuscate(value as string);
      }
      return result;
    }
  } catch {
    console.error('[SecretStore] Failed to load secrets, starting fresh');
  }
  return {};
}

function saveSecrets(secrets: Record<string, string>): void {
  ensureDir();
  const encoded: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    encoded[key] = obfuscate(value);
  }
  writeFileSync(SECRETS_FILE, JSON.stringify(encoded, null, 2), {
    mode: 0o600,
  });
}

/**
 * Store an API key
 */
export async function setKey(providerName: string, apiKey: string): Promise<void> {
  const secrets = loadSecrets();
  secrets[providerName] = apiKey;
  saveSecrets(secrets);
}

/**
 * Retrieve an API key
 */
export async function getKey(providerName: string): Promise<string | null> {
  const secrets = loadSecrets();
  return secrets[providerName] || null;
}

/**
 * Check if a key exists
 */
export async function hasKey(providerName: string): Promise<boolean> {
  const secrets = loadSecrets();
  return providerName in secrets;
}

/**
 * Delete an API key
 */
export async function deleteKey(providerName: string): Promise<void> {
  const secrets = loadSecrets();
  delete secrets[providerName];
  saveSecrets(secrets);
}
