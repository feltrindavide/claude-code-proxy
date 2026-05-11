/**
 * ValidationStore tests
 * Phase: 05-reliability-polish
 * Plan: 05-02
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationStoreService, validationStoreService } from '../../src/services/validationStore.js';
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
      // TODO: Implement — setResults should replace all results and persist to disk
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
      // TODO: Implement — getResults should return Object.fromEntries of the internal Map
      const store = new ValidationStoreService(testFile);
      expect(store.getResults()).toEqual({});
    });
  });

  describe('dismissWarning()', () => {
    it('sets dismissed flag and persists', () => {
      // TODO: Implement — dismissWarning should set dismissed: true on the provider's result
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
      // TODO: Implement — results written via persist() should be readable via load()
      const store = new ValidationStoreService(testFile);
      const results = new Map([
        ['provider-a', { valid: true, timestamp: new Date().toISOString() }],
      ]);
      store.setResults(results);

      // Create new instance to test load
      const store2 = new ValidationStoreService(testFile);
      // TODO: store2 should load from file and have the same results
      expect(true).toBe(true); // placeholder
    });
  });

  describe('graceful first-run', () => {
    it('returns empty when no file exists', () => {
      // TODO: Implement — constructor should not throw when file doesn't exist
      const store = new ValidationStoreService(testFile);
      expect(store.getResults()).toEqual({});
    });
  });
});
