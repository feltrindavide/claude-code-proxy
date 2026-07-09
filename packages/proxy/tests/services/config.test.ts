/**
 * ConfigService tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigService', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccp-config-test-'));
    configPath = join(tempDir, 'config.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('should return defaults when config file does not exist', async () => {
      const { ConfigService } = await import('../../src/services/config.js');
      const configService = new ConfigService(configPath);
      const config = configService.load();

      expect(config.providers).toEqual([]);
      expect(config.routes).toHaveLength(3);
      expect(config.routes.find((r) => r.claudeTier === 'opus')).toEqual({
        claudeTier: 'opus',
        providerName: 'opencode',
        targetModel: 'qwen3.6',
      });
    });

    it('should parse and return existing config file', async () => {
      const { ConfigService } = await import('../../src/services/config.js');
      const { writeFileSync } = await import('fs');
      writeFileSync(
        configPath,
        JSON.stringify({
          providers: [
            {
              name: 'test',
              baseUrl: 'https://api.test.com',
              keyId: 'test',
              models: ['model-a'],
              enabled: true,
              priority: 1,
            },
          ],
          routes: [{ claudeTier: 'opus', providerName: 'test', targetModel: 'model-a' }],
        }),
        'utf-8',
      );

      const configService = new ConfigService(configPath);
      const config = configService.load();

      expect(config.providers).toHaveLength(1);
      expect(config.providers[0].name).toBe('test');
      expect(config.routes[0].targetModel).toBe('model-a');
    });
  });

  describe('save()', () => {
    it('should persist config to the configured path', async () => {
      const { ConfigService } = await import('../../src/services/config.js');
      const configService = new ConfigService(configPath);
      const defaults = configService.getDefaults();

      configService.save(defaults);

      expect(existsSync(configPath)).toBe(true);
      const saved = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(saved.routes).toHaveLength(3);
    });
  });

  describe('getDefaults()', () => {
    it('should return default routes per D-07', async () => {
      const { ConfigService } = await import('../../src/services/config.js');
      const configService = new ConfigService(configPath);
      const defaults = configService.getDefaults();

      expect(defaults.routes).toHaveLength(3);
      expect(defaults.providers).toEqual([]);

      const opusRoute = defaults.routes.find((r) => r.claudeTier === 'opus');
      expect(opusRoute?.providerName).toBe('opencode');
      expect(opusRoute?.targetModel).toBe('qwen3.6');

      const sonnetRoute = defaults.routes.find((r) => r.claudeTier === 'sonnet');
      expect(sonnetRoute?.providerName).toBe('openrouter');
      expect(sonnetRoute?.targetModel).toBe('mimo-v2-flash');

      const haikuRoute = defaults.routes.find((r) => r.claudeTier === 'haiku');
      expect(haikuRoute?.providerName).toBe('opencode');
      expect(haikuRoute?.targetModel).toBe('nvidia/nemotron-3-super-120b-a12b:free');
    });
  });

  describe('validateProvider()', () => {
    it('rejects invalid provider names', async () => {
      const { ConfigService } = await import('../../src/services/config.js');
      const configService = new ConfigService(configPath);
      const result = configService.validateProvider({
        name: 'bad name!',
        baseUrl: 'https://api.test.com',
        keyId: 'test',
        models: [],
        enabled: true,
        priority: 1,
      });
      expect(result.valid).toBe(false);
    });
  });
});
