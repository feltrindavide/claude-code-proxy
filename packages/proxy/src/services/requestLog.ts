/**
 * RequestLogService — JSON file ring buffer for request logging
 * Phase: 04-model-mapping-ui-routing-log
 * Plan: 04-01
 *
 * Persists the last 50 request log entries at ~/.claude/claude-code-proxy/request-log.json
 * Uses atomic write pattern (temp file + renameSync) matching ConfigService
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  readdirSync,
} from 'fs';
import { join } from 'path';
import os from 'os';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from 'crypto';
import type { RequestLogEntry } from '../types/index.js';
import { broadcastLogEntry } from './log-broadcast.js';
import { configService } from './config.js';

const LOG_DIR = join(os.homedir(), '.claude', 'claude-code-proxy');
const LOG_FILE = join(LOG_DIR, 'data', 'request-log.json');
const REPLAY_DIR = join(LOG_DIR, 'data', 'replay');
const MAX_ENTRIES = 50;
const MAX_REPLAY_BODIES = 30;
const BODY_TRUNCATE_LIMIT = 2048;

function replayEncryptionKey(): Buffer {
  return scryptSync(LOG_DIR, 'ccp-replay-bodies-v1', 32);
}

function encryptReplayPayload(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', replayEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptReplayPayload(raw: string): string {
  const parsed = JSON.parse(raw) as { v: number; iv: string; tag: string; data: string };
  if (parsed.v !== 1) throw new Error('Unsupported replay encryption version');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    replayEncryptionKey(),
    Buffer.from(parsed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]).toString('utf-8');
}

export function redactLogBody(body: unknown): unknown {
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
      } else if (key === 'tools') {
        out[key] = Array.isArray(value)
          ? `[${value.length} tools redacted]`
          : '[tools redacted]';
      } else if (key === 'metadata') {
        out[key] = '[metadata redacted]';
      } else if (key === 'tool_choice') {
        out[key] = '[tool_choice redacted]';
      } else {
        out[key] = redactLogBody(value);
      }
    }
    return out;
  }
  return body;
}

export class RequestLogService {
  private entries: RequestLogEntry[] = [];
  private logFile: string;
  private pendingEnrichments = new Map<string, Partial<RequestLogEntry>>();

  constructor(logFile?: string) {
    this.logFile = logFile || LOG_FILE;
  }

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

  isReplayEnabled(): boolean {
    const config = configService.load();
    return config.replayBodies === true || process.env.PROXY_REPLAY_BODIES === 'true';
  }

  enrichEntry(requestId: string, update: Partial<RequestLogEntry>): void {
    const existing = this.pendingEnrichments.get(requestId) || {};
    this.pendingEnrichments.set(requestId, { ...existing, ...update });

    const idx = this.entries.findIndex((e) => e.requestId === requestId);
    if (idx >= 0) {
      this.entries[idx] = { ...this.entries[idx], ...update };
      this.persist();
    }
  }

  /** @deprecated use enrichEntry(requestId, ...) */
  enrichLastEntry(update: Partial<RequestLogEntry>): void {
    if (this.entries.length > 0) {
      const lastIndex = this.entries.length - 1;
      this.entries[lastIndex] = { ...this.entries[lastIndex], ...update };
      this.persist();
    }
  }

  addEntry(entry: RequestLogEntry): void {
    const requestId = entry.requestId;
    if (requestId && this.pendingEnrichments.has(requestId)) {
      entry = { ...entry, ...this.pendingEnrichments.get(requestId) };
      this.pendingEnrichments.delete(requestId);
    }

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.persist();
    broadcastLogEntry(entry);
  }

  getAll(): RequestLogEntry[] {
    return [...this.entries];
  }

  truncateBody(body: unknown): string {
    const redacted = redactLogBody(body);
    const serialized = JSON.stringify(redacted);
    if (serialized.length > BODY_TRUNCATE_LIMIT) {
      return serialized.slice(0, BODY_TRUNCATE_LIMIT) + '...';
    }
    return serialized;
  }

  storeReplayBody(body: unknown): string | undefined {
    if (!this.isReplayEnabled()) return undefined;

    if (!existsSync(REPLAY_DIR)) {
      mkdirSync(REPLAY_DIR, { recursive: true, mode: 0o700 });
    }
    const id = randomBytes(8).toString('hex');
    const payload = encryptReplayPayload(JSON.stringify(body));
    writeFileSync(join(REPLAY_DIR, `${id}.json`), payload, { mode: 0o600 });
    this.pruneReplayBodies();
    return id;
  }

  getReplayBody(replayId: string): unknown {
    const filePath = join(REPLAY_DIR, `${replayId}.json`);
    if (!existsSync(filePath)) throw new Error(`Replay body not found: ${replayId}`);
    const raw = readFileSync(filePath, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.v === 1) {
        return JSON.parse(decryptReplayPayload(raw));
      }
    } catch {
      // fall through — legacy plaintext replay files
    }
    return JSON.parse(raw);
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

export const requestLogService = new RequestLogService();

export function redactLogEntry(entry: RequestLogEntry): RequestLogEntry {
  return {
    ...entry,
    requestBodyPreview: entry.requestBodyPreview
      ? String(entry.requestBodyPreview)
      : entry.requestBodyPreview,
  };
}
