/**
 * ConfigService export/import/backup tests
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-02, Task 3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '../../src/services/config.js';
import { existsSync, rmSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

const testDir = join(os.tmpdir(), 'claude-code-proxy-export-test');
const testFile = join(testDir, 'config-test.json');

function validConfig() {
  return {
    providers: [
      {
        name: 'test-provider',
        baseUrl: 'https://api.example.com',
        keyId: 'test-key-id',
        models: ['model-1'],
        enabled: true,
        priority: 1,
      },
    ],
    routes: [
      { claudeTier: 'opus' as const, providerName: 'test-provider', targetModel: 'model-1' },
    ],
  };
}

describe('ConfigService export/import', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    if (existsSync(testFile)) {
      rmSync(testFile);
    }
    // Clean up any previous backup files
    try {
      const files = readdirSync(testDir).filter(f => f.startsWith('config-backup-'));
      files.forEach(f => rmSync(join(testDir, f)));
    } catch {
      // Directory might not exist yet
    }
  });

  afterEach(() => {
    // Clean up test files
    try {
      const files = readdirSync(testDir).filter(f => f.startsWith('config-test') || f.startsWith('config-backup-'));
      files.forEach(f => rmSync(join(testDir, f)));
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('exportConfig()', () => {
    it('should mask all provider keyId values', () => {
      const svc = new ConfigService(testFile);
      svc.save(validConfig());
      const result = svc.exportConfig();
      expect((result.providers as any[])[0].keyId).toBe('••••');
    });

    it('should include providers, routes, and settings keys', () => {
      const svc = new ConfigService(testFile);
      svc.save(validConfig());
      const result = svc.exportConfig();
      expect(Object.keys(result)).toEqual(['providers', 'routes', 'settings']);
    });

    it('should include settings with port 3456', () => {
      const svc = new ConfigService(testFile);
      svc.save(validConfig());
      const result = svc.exportConfig();
      expect(result.settings.port).toBe(3456);
    });
  });

  describe('importConfig()', () => {
    it('should return validated data with replace strategy', () => {
      const svc = new ConfigService(testFile);
      const config = validConfig();
      const result = svc.importConfig(config, 'replace');
      expect(result).toEqual(config);
    });

    it('should merge providers from both current and incoming configs', () => {
      const svc = new ConfigService(testFile);
      const current = {
        providers: [
          { name: 'provider-a', baseUrl: 'https://a.com', keyId: 'key-a', models: [], enabled: true, priority: 1 },
        ],
        routes: [{ claudeTier: 'opus' as const, providerName: 'provider-a', targetModel: 'model-a' }],
      };
      svc.save(current);

      const incoming = {
        providers: [
          { name: 'provider-b', baseUrl: 'https://b.com', keyId: 'key-b', models: [], enabled: true, priority: 2 },
        ],
        routes: [{ claudeTier: 'sonnet' as const, providerName: 'provider-b', targetModel: 'model-b' }],
      };

      const result = svc.importConfig(incoming, 'merge');
      expect(result.providers).toHaveLength(2);
      expect(result.providers.find((p: any) => p.name === 'provider-a')).toBeDefined();
      expect(result.providers.find((p: any) => p.name === 'provider-b')).toBeDefined();
    });

    it('should deduplicate providers by name with incoming winning', () => {
      const svc = new ConfigService(testFile);
      const current = {
        providers: [
          { name: 'provider-a', baseUrl: 'https://old.com', keyId: 'key-old', models: [], enabled: true, priority: 1 },
        ],
        routes: [{ claudeTier: 'opus' as const, providerName: 'provider-a', targetModel: 'model-a' }],
      };
      svc.save(current);

      const incoming = {
        providers: [
          { name: 'provider-a', baseUrl: 'https://new.com', keyId: 'key-new', models: [], enabled: true, priority: 1 },
        ],
        routes: [{ claudeTier: 'opus' as const, providerName: 'provider-a', targetModel: 'model-a' }],
      };

      const result = svc.importConfig(incoming, 'merge');
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].baseUrl).toBe('https://new.com');
    });

    it('should replace routes entirely in merge strategy', () => {
      const svc = new ConfigService(testFile);
      const current = {
        providers: [],
        routes: [{ claudeTier: 'opus' as const, providerName: 'old', targetModel: 'old-model' }],
      };
      svc.save(current);

      const incoming = {
        providers: [],
        routes: [{ claudeTier: 'sonnet' as const, providerName: 'new', targetModel: 'new-model' }],
      };

      const result = svc.importConfig(incoming, 'merge');
      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].claudeTier).toBe('sonnet');
    });

    it('should reject invalid config with descriptive error', () => {
      const svc = new ConfigService(testFile);
      expect(() => svc.importConfig({ invalid: true }, 'replace')).toThrow('Invalid config:');
    });

    it('should reject missing claudeTier in route', () => {
      const svc = new ConfigService(testFile);
      const badConfig = {
        providers: [],
        routes: [{ providerName: 'test', targetModel: 'model' }],
      };
      expect(() => svc.importConfig(badConfig, 'replace')).toThrow('claudeTier');
    });
  });

  describe('createBackup()', () => {
    it('should write timestamped file', () => {
      const svc = new ConfigService(testFile);
      svc.save(validConfig());
      // Override configDir to use test directory for backup
      (svc as any).configDir = testDir;
      const backupPath = svc.createBackup();
      expect(backupPath).toContain('config-backup-');
      expect(existsSync(backupPath)).toBe(true);
    });

    it('should contain valid JSON config in backup file', () => {
      const svc = new ConfigService(testFile);
      svc.save(validConfig());
      (svc as any).configDir = testDir;
      const backupPath = svc.createBackup();
      const content = readFileSync(backupPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(Array.isArray(parsed.providers)).toBe(true);
      expect(Array.isArray(parsed.routes)).toBe(true);
    });
  });
});
