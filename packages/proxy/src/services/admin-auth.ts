/**
 * Admin API token — generated on first startup, stored on disk.
 */

import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Request } from 'express';

function dataDir(): string {
  return join(homedir(), '.claude', 'claude-code-proxy', 'data');
}

function tokenFile(): string {
  return join(dataDir(), 'admin.token');
}

let cachedToken: string | null = null;

function ensureDataDir(): void {
  const dir = dataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/** Load or create the admin API token. */
export function ensureAdminToken(): string {
  if (cachedToken) return cachedToken;

  ensureDataDir();
  const file = tokenFile();

  if (existsSync(file)) {
    cachedToken = readFileSync(file, 'utf-8').trim();
    return cachedToken;
  }

  cachedToken = randomBytes(32).toString('hex');
  writeFileSync(file, cachedToken, { mode: 0o600 });
  console.log('[AdminAuth] Generated admin API token');
  return cachedToken;
}

/** Validate admin token from request headers or ?token= query (SSE/WebSocket). */
export function validateAdminToken(req: Request): boolean {
  const expected = ensureAdminToken();
  const authHeader = req.headers.authorization;
  const headerToken = req.headers['x-admin-token'];
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;

  if (typeof headerToken === 'string' && headerToken === expected) return true;
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === expected) return true;
  if (queryToken && queryToken === expected) return true;

  return false;
}

/** Validate a raw token string (WebSocket auth). */
export function validateAdminTokenFromString(token: string): boolean {
  return token === ensureAdminToken();
}

/** True when request originates from localhost. */
export function isLocalhostRequest(req: Request): boolean {
  const addr = req.socket.remoteAddress || '';
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '::ffff:127.0.0.1'
  );
}
