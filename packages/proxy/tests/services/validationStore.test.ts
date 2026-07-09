/**
 * ValidationStore tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationStoreService } from '../../src/services/validationStore.js';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

const testDir = join(os.tmpdir(), 'claude-code-proxy-test');
const testFile = join(testDir, 'validation-store-test.json');

describe('ValidationStoreService', () => {
  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    if (existsSync(testFile)) {
      rmSync(testFile);
    }
  });

  afterEach(() => {
    if (existsSync(testFile)) {
      rmSync(testFile);
    }
  });

  describe('setResults()', () => {
    it('stores and persists results', () => {
      const store = new ValidationStoreService(testFile);
      const results = new Map([
        ['provider-a', { valid: true, timestamp: new Date().toISOString() }],
        ['provider-b', { valid: false, error: 'Connection failed', timestamp: new Date().toISOString() }],
      ]);
      store.setResults(results);
      expect(Object.keys(store.getResults())).toHaveLength(2);
      expect(existsSync(testFile)).toBe(true);
    });
  });

  describe('getResults()', () => {
    it('returns all results as a plain object', () => {
      const store = new ValidationStoreService(testFile);
      expect(store.getResults()).toEqual({});
    });
  });

  describe('dismissWarning()', () => {
    it('sets dismissed flag and persists', () => {
      const store = new ValidationStoreService(testFile);
      const results = new Map([
        ['provider-b', { valid: false, error: 'Connection failed', timestamp: new Date().toISOString() }],
      ]);
      store.setResults(results);
      store.dismissWarning('provider-b');
      const result = store.getResults()['provider-b'];
      expect(result.dismissed).toBe(true);
    });
  });

  describe('load/persist round-trip', () => {
    it('persists and reloads results via atomic writes', () => {
      const store = new ValidationStoreService(testFile);
      const timestamp = new Date().toISOString();
      const results = new Map([
        ['provider-a', { valid: true, timestamp }],
      ]);
      store.setResults(results);

      const store2 = new ValidationStoreService(testFile);
      const loaded = store2.getResults();
      expect(loaded['provider-a']).toMatchObject({ valid: true, timestamp });
      expect(readFileSync(testFile, 'utf-8')).toContain('provider-a');
    });
  });

  describe('graceful first-run', () => {
    it('returns empty when no file exists', () => {
      const store = new ValidationStoreService(testFile);
      expect(store.getResults()).toEqual({});
    });
  });

  describe('updateResult()', () => {
    it('updates a single provider and persists', () => {
      const store = new ValidationStoreService(testFile);
      store.updateResult('provider-x', { valid: true });
      expect(store.getResults()['provider-x'].valid).toBe(true);
      expect(existsSync(testFile)).toBe(true);
    });
  });
});
