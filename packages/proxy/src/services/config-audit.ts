/**
 * Append-only config audit log with snapshot files for one-click rollback.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import type { AppConfig } from '../types/index.js';

const AUDIT_DIR = join(homedir(), '.claude', 'claude-code-proxy', 'config-audit');
const AUDIT_LOG = join(AUDIT_DIR, 'audit.jsonl');
const MAX_SNAPSHOTS = 100;

export interface ConfigAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  summary?: string;
  snapshotFile: string;
}

function ensureAuditDir(): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true, mode: 0o700 });
  }
}

export function recordConfigAudit(
  config: AppConfig,
  action: string,
  summary?: string,
): ConfigAuditEntry {
  ensureAuditDir();
  const id = randomBytes(8).toString('hex');
  const snapshotFile = `snapshot-${id}.json`;
  writeFileSync(join(AUDIT_DIR, snapshotFile), JSON.stringify(config, null, 2), { mode: 0o600 });

  const entry: ConfigAuditEntry = {
    id,
    timestamp: new Date().toISOString(),
    action,
    summary,
    snapshotFile,
  };
  appendFileSync(AUDIT_LOG, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  pruneOldSnapshots();
  return entry;
}

function pruneOldSnapshots(): void {
  try {
    const snapshots = readdirSync(AUDIT_DIR)
      .filter((f) => f.startsWith('snapshot-') && f.endsWith('.json'))
      .sort()
      .reverse();
    for (const file of snapshots.slice(MAX_SNAPSHOTS)) {
      unlinkSync(join(AUDIT_DIR, file));
    }
  } catch {
    // non-fatal
  }
}

export function listConfigAudit(limit = 50): ConfigAuditEntry[] {
  if (!existsSync(AUDIT_LOG)) return [];
  const lines = readFileSync(AUDIT_LOG, 'utf-8').trim().split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .map((line) => JSON.parse(line) as ConfigAuditEntry)
    .reverse();
}

export function loadConfigSnapshot(id: string): AppConfig {
  ensureAuditDir();
  const entries = listConfigAudit(500);
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Audit entry not found: ${id}`);

  const snapshotPath = join(AUDIT_DIR, entry.snapshotFile);
  if (!existsSync(snapshotPath)) throw new Error(`Snapshot file missing: ${entry.snapshotFile}`);

  return JSON.parse(readFileSync(snapshotPath, 'utf-8')) as AppConfig;
}
