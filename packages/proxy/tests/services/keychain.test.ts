/**
 * KeychainService tests
 * Phase: 01-core-proxy-server
 * Plan: 01-02, Task 2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock keytar - use vi.hoisted for proper mocking
const { mockKeytarFn } = vi.hoisted(() => ({
  mockKeytarFn: vi.fn().mockImplementation(() => ({
    setPassword: vi.fn().mockResolvedValue(undefined),
    getPassword: vi.fn().mockResolvedValue('test-api-key-12345'),
    deletePassword: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('keytar', () => ({ default: mockKeytarFn() }));

describe('KeychainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setKey()', () => {
    it('should store API key in Keychain', async () => {
      const { KeychainService } = await import('../../src/services/keychain.js');
      const keychainService = new KeychainService();
      
      await keychainService.setKey('openrouter', 'sk-test-key-12345');
      
      expect(keychainService).toBeDefined();
    });
  });

  describe('getKey()', () => {
    it('should retrieve API key from Keychain', async () => {
      const { KeychainService } = await import('../../src/services/keychain.js');
      const keychainService = new KeychainService();
      
      const key = await keychainService.getKey('openrouter');
      
      expect(key).toBe('test-api-key-12345');
    });
  });

  describe('maskKey()', () => {
    it('should return **** for keys shorter than 8 chars', async () => {
      const { KeychainService } = await import('../../src/services/keychain.js');
      const keychainService = new KeychainService();
      
      expect(keychainService.maskKey('short')).toBe('****');
    });

    it('should return first 4 + last 4 chars for longer keys', async () => {
      const { KeychainService } = await import('../../src/services/keychain.js');
      const keychainService = new KeychainService();
      
      // 'sk-ant-api-key-12345' slice(0,4)='sk-a', slice(-4)='2345'
      expect(keychainService.maskKey('sk-ant-api-key-12345')).toBe('sk-a...2345');
    });
  });

  describe('hasKey()', () => {
    it('should return true when key exists', async () => {
      const { KeychainService } = await import('../../src/services/keychain.js');
      const keychainService = new KeychainService();
      
      const hasKey = await keychainService.hasKey('openrouter');
      
      expect(hasKey).toBe(true);
    });
  });
});