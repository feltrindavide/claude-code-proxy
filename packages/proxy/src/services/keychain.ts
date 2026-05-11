/**
 * KeychainService — secure API key storage via macOS Keychain
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 2
 * 
 * Per D-08: API keys stored in macOS Keychain via keytar
 * Per D-09: Keys never appear in config files or logs
 */

import keytar from 'keytar';

// Service name for Keychain entries (per D-08)
const SERVICE = 'claude-code-proxy';

/**
 * Custom error for Keychain operations
 */
export class ProxyKeychainError extends Error {
  constructor(message: string) {
    // Sanitize message — never expose actual key values
    const sanitized = message.replace(/sk-[a-zA-Z0-9-]+/g, '[KEY]');
    super(sanitized);
    this.name = 'ProxyKeychainError';
  }
}

/**
 * KeychainService — wraps keytar for secure API key storage
 */
export class KeychainService {
  /**
   * Store API key in macOS Keychain
   * Provider name serves as the account name
   */
  async setKey(providerName: string, apiKey: string): Promise<void> {
    try {
      await keytar.setPassword(SERVICE, providerName, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ProxyKeychainError(`Failed to store key: ${message}`);
    }
  }

  /**
   * Retrieve API key from macOS Keychain
   * Returns null if not found
   */
  async getKey(providerName: string): Promise<string | null> {
    try {
      return await keytar.getPassword(SERVICE, providerName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ProxyKeychainError(`Failed to retrieve key: ${message}`);
    }
  }

  /**
   * Delete API key from macOS Keychain
   * Returns true if deleted, false if not found
   */
  async deleteKey(providerName: string): Promise<boolean> {
    try {
      return await keytar.deletePassword(SERVICE, providerName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ProxyKeychainError(`Failed to delete key: ${message}`);
    }
  }

  /**
   * Check if API key exists in Keychain
   */
  async hasKey(providerName: string): Promise<boolean> {
    const key = await this.getKey(providerName);
    return key !== null;
  }

  /**
   * Mask API key for display (AUTH-03 requirement)
   * Returns format: first 4 chars + ... + last 4 chars
   * Examples:
   *   - 'sk-ant-api-key-12345' → 'sk-an...2345'
   *   - 'short' → '****'
   */
  maskKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) {
      return '****';
    }
    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  }
}

// Singleton instance
export const keychainService = new KeychainService();