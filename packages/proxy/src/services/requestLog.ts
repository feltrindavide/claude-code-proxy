/**
 * RequestLogService — JSON file ring buffer for request logging
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 *
 * Persists the last 50 request log entries at ~/.claude/claude-code-proxy/request-log.json
 * Uses atomic write pattern (temp file + renameSync) matching ConfigService
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import type { RequestLogEntry, ClaudeTier } from '../types/index.js';
import { broadcastLogEntry } from './log-broadcast.js';

// Log directory and file paths
const LOG_DIR = join(os.homedir(), '.claude', 'claude-code-proxy');
const LOG_FILE = join(LOG_DIR, 'data', 'request-log.json');
const REPLAY_DIR = join(LOG_DIR, 'data', 'replay');
const MAX_ENTRIES = 50;
const MAX_REPLAY_BODIES = 30;
const BODY_TRUNCATE_LIMIT = 2048; // 2KB truncation limit per D-48

/**
 * RequestLogService — manages request log persistence with ring buffer
 *
 * load: reads existing entries from disk on startup
 * addEntry: appends entry, drops oldest when exceeding MAX_ENTRIES, persists
 * getAll: returns a copy of all entries
 * enrichLastEntry: merges data into the most recent entry (for post-route-resolution data)
 * persist: atomic write via temp file + renameSync
 */
export class RequestLogService {
  private entries: RequestLogEntry[] = [];
  private logFile: string;

  constructor(logFile?: string) {
    this.logFile = logFile || LOG_FILE;
  }

  /**
   * Load existing log entries from disk
   * Returns empty array if file doesn't exist (graceful first-run)
   */
  load(): RequestLogEntry[] {
    try {
      if (!existsSync(this.logFile)) {
        return [];
      }
      const content = readFileSync(this.logFile, 'utf-8');
      this.entries = JSON.parse(content);
      return [...this.entries];
    } catch (error) {
      console.error('[RequestLog] Error loading log file:', error);
      this.entries = [];
      return [];
    }
  }

  /**
   * Add a new log entry and persist to disk
   * Ring buffer: drops oldest entries when exceeding MAX_ENTRIES
   */
  addEntry(entry: RequestLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.persist();
    broadcastLogEntry(entry);
  }

  /**
   * Return a copy of all log entries (not a reference)
   */
  getAll(): RequestLogEntry[] {
    return [...this.entries];
  }

  /**
   * Enrich the most recent log entry with additional data
   * Used by proxy handler to add claudeTier/providerName/targetModel after route resolution
   */
  enrichLastEntry(update: Partial<RequestLogEntry>): void {
    if (this.entries.length > 0) {
      const lastIndex = this.entries.length - 1;
      this.entries[lastIndex] = { ...this.entries[lastIndex], ...update };
      this.persist();
    }
  }

  /**
   * Truncate a request/response body to BODY_TRUNCATE_LIMIT chars
   * Returns JSON-stringified body, truncated with '...' suffix if over limit
   */
  truncateBody(body: unknown): string {
    const redacted = redactLogBody(body);
    const serialized = JSON.stringify(redacted);
    if (serialized.length > BODY_TRUNCATE_LIMIT) {
      return serialized.slice(0, BODY_TRUNCATE_LIMIT) + '...';
    }
    return serialized;
  }

  /** Store full request body for replay (ring buffer). */
  storeReplayBody(body: unknown): string {
    if (!existsSync(REPLAY_DIR)) {
      mkdirSync(REPLAY_DIR, { recursive: true, mode: 0o700 });
    }
    const id = randomBytes(8).toString('hex');
    writeFileSync(join(REPLAY_DIR, `${id}.json`), JSON.stringify(body), { mode: 0o600 });
    this.pruneReplayBodies();
    return id;
  }

  getReplayBody(replayId: string): unknown {
    const path = join(REPLAY_DIR, `${replayId}.json`);
    if (!existsSync(path)) throw new Error(`Replay body not found: ${replayId}`);
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  private pruneReplayBodies(): void {
    try {
      const files = readdirSync(REPLAY_DIR)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();
      for (const file of files.slice(MAX_REPLAY_BODIES)) {
        unlinkSync(join(REPLAY_DIR, file));
      }
    } catch {
      // non-fatal
    }
  }

  private persist(): void {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    }

    const tempPath = `${this.logFile}.tmp`;
    const content = JSON.stringify(this.entries, null, 2);
    writeFileSync(tempPath, content, { mode: 0o600 });
    renameSync(tempPath, this.logFile);
  }
}

function redactLogBody(body: unknown): unknown {
  if (Array.isArray(body)) {
    return body.map(redactLogBody);
  }
  if (body && typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key === 'messages' && Array.isArray(value)) {
        out[key] = `[${value.length} messages redacted]`;
      } else if (key === 'system') {
        out[key] = '[system prompt redacted]';
      } else {
        out[key] = redactLogBody(value);
      }
    }
    return out;
  }
  return body;
}

// Singleton instance
export const requestLogService = new RequestLogService();
