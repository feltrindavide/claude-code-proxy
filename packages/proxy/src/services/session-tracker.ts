/**
 * Session tracker — per-session context usage tracking
 *
 * Ogni sessione Claude Code ha il proprio tracciamento (model, tokens, etc).
 * Il sessionId viene estratto da body.metadata.user_id nel formato "user_sessionId".
 *
 * Persistenza su ~/.claude/claude-code-proxy/data/sessions.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  tier?: string;
  inflation: number;
}

interface SessionStore {
  sessions: Record<string, SessionUsage>;
  lastActive: string | null;
  /** LRU access order — most recent at end */
  accessOrder: string[];
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

const SESSIONS_FILE = join(homedir(), '.claude', 'claude-code-proxy', 'data', 'sessions.json');
const MAX_SESSIONS = 50;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let store: SessionStore = load();
let writeChain: Promise<void> = Promise.resolve();

function load(): SessionStore {
  try {
    if (existsSync(SESSIONS_FILE)) {
      const parsed = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8')) as SessionStore;
      if (!parsed.accessOrder) {
        parsed.accessOrder = Object.keys(parsed.sessions);
      }
      return parsed;
    }
  } catch {}
  return { sessions: {}, lastActive: null, accessOrder: [] };
}

function persistSync(): void {
  try {
    const dir = join(homedir(), '.claude', 'claude-code-proxy', 'data');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(SESSIONS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  } catch {}
}

function enqueuePersist(): void {
  writeChain = writeChain.then(() => {
    persistSync();
  }).catch(() => {
    persistSync();
  });
}

function touchSession(key: string): void {
  store.accessOrder = store.accessOrder.filter((k) => k !== key);
  store.accessOrder.push(key);
}

function evictIfNeeded(): void {
  while (store.accessOrder.length > MAX_SESSIONS) {
    const oldest = store.accessOrder.shift();
    if (oldest) {
      delete store.sessions[oldest];
      if (store.lastActive === oldest) {
        store.lastActive = store.accessOrder[store.accessOrder.length - 1] ?? null;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Estrae il sessionId dal body della richiesta.
 */
export function extractSessionId(body: Record<string, unknown>): string | null {
  try {
    const metadata = body.metadata as Record<string, unknown> | undefined;
    if (!metadata) return null;
    const userId = metadata.user_id;

    if (typeof userId === 'string') {
      if (userId.startsWith('{')) {
        try {
          const parsed = JSON.parse(userId);
          const sid = parsed.session_id as string | undefined;
          if (sid) return sid;
        } catch {}
        return null;
      }
      const parts = userId.split('_session_');
      if (parts.length > 1) return parts[1];
      return userId;
    }

    if (typeof userId === 'object' && userId !== null) {
      const obj = userId as Record<string, unknown>;
      const sid = obj.session_id as string | undefined;
      if (sid) return sid;
      const did = obj.device_id as string | undefined;
      if (did) return did.substring(0, 12);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Aggiorna l'utilizzo per una sessione.
 */
export function updateSessionUsage(
  sessionId: string | null,
  usage: SessionUsage,
): void {
  const key = sessionId || '__default__';

  store.sessions[key] = usage;
  store.lastActive = key;
  touchSession(key);
  evictIfNeeded();

  enqueuePersist();
}

/**
 * Restituisce l'utilizzo per una sessione specifica.
 */
export function getSessionUsage(sessionId?: string | null): SessionUsage | null {
  if (sessionId) {
    const usage = store.sessions[sessionId] || null;
    if (usage) touchSession(sessionId);
    return usage;
  }
  if (store.lastActive && store.sessions[store.lastActive]) {
    touchSession(store.lastActive);
    return store.sessions[store.lastActive];
  }
  return null;
}

/**
 * Restituisce l'ultimo sessionId attivo.
 */
export function getLastActiveSessionId(): string | null {
  return store.lastActive;
}

/** @internal test helper — wait for pending writes */
export async function flushSessionWritesForTests(): Promise<void> {
  await writeChain;
}

/** @internal test helper */
export function resetSessionStoreForTests(): void {
  store = { sessions: {}, lastActive: null, accessOrder: [] };
  writeChain = Promise.resolve();
}
