/**
 * RequestLogService tests
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RequestLogService } from '../../src/services/requestLog.js';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';
import type { RequestLogEntry } from '../../src/types/index.js';

const testDir = join(os.tmpdir(), 'claude-code-proxy-test');
const testFile = join(testDir, 'request-log-test.json');

function makeEntry(n: number): RequestLogEntry {
  return {
    timestamp: new Date(Date.now() + n).toISOString(),
    requestModel: `test-model-${n}`,
    status: 'success',
    durationMs: n * 10,
    statusCode: 200,
  };
}

describe('RequestLogService', () => {
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

  describe('load()', () => {
    it('returns empty array when file does not exist', () => {
      const service = new RequestLogService(testFile);
      expect(service.getAll()).toEqual([]);
    });
  });

  describe('addEntry() and persist()', () => {
    it('adds entry and persists to file', () => {
      const service = new RequestLogService(testFile);
      const entry = makeEntry(1);
      service.addEntry(entry);

      expect(service.getAll()).toHaveLength(1);
      expect(service.getAll()[0].requestModel).toBe('test-model-1');
      expect(existsSync(testFile)).toBe(true);

      // Verify file content
      const content = readFileSync(testFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].requestModel).toBe('test-model-1');
    });
  });

  describe('ring buffer', () => {
    it('drops oldest entry when exceeding 50 entries', () => {
      const service = new RequestLogService(testFile);

      // Add 51 entries
      for (let i = 1; i <= 51; i++) {
        service.addEntry(makeEntry(i));
      }

      expect(service.getAll()).toHaveLength(50);

      // First entry should be the 2nd added (not the 1st — 1st was dropped)
      expect(service.getAll()[0].requestModel).toBe('test-model-2');
      // Last entry should be the 51st
      expect(service.getAll()[49].requestModel).toBe('test-model-51');
    });
  });

  describe('atomic write', () => {
    it('uses atomic write pattern (temp file + rename)', () => {
      const service = new RequestLogService(testFile);
      service.addEntry(makeEntry(1));

      // Temp file should not exist after persist completes
      expect(existsSync(`${testFile}.tmp`)).toBe(false);
      // Final file should exist
      expect(existsSync(testFile)).toBe(true);
    });
  });

  describe('enrichLastEntry()', () => {
    it('updates the most recent entry', () => {
      const service = new RequestLogService(testFile);
      service.addEntry(makeEntry(1));
      service.enrichLastEntry({
        providerName: 'test-provider',
        claudeTier: 'sonnet',
        targetModel: 'test-model',
      });

      const entries = service.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].providerName).toBe('test-provider');
      expect(entries[0].claudeTier).toBe('sonnet');
      expect(entries[0].targetModel).toBe('test-model');
    });

    it('does nothing when no entries exist', () => {
      const service = new RequestLogService(testFile);
      // Should not throw
      service.enrichLastEntry({ providerName: 'test' });
      expect(service.getAll()).toHaveLength(0);
    });
  });

  describe('truncateBody()', () => {
    it('limits output to 2KB', () => {
      const service = new RequestLogService(testFile);
      // Create a body with ~5KB of data
      const largeBody = { data: 'x'.repeat(5000) };
      const result = service.truncateBody(largeBody);

      expect(result.length).toBeLessThanOrEqual(2048 + 3); // 2048 + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('returns full string when under limit', () => {
      const service = new RequestLogService(testFile);
      const smallBody = { model: 'claude-sonnet-4' };
      const result = service.truncateBody(smallBody);

      expect(result).toBe(JSON.stringify(smallBody));
      expect(result.endsWith('...')).toBe(false);
    });
  });
});
