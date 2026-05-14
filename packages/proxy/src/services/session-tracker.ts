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
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

const SESSIONS_FILE = join(homedir(), '.claude', 'claude-code-proxy', 'data', 'sessions.json');

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let store: SessionStore = load();

function load(): SessionStore {
  try {
    if (existsSync(SESSIONS_FILE)) {
      return JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8')) as SessionStore;
    }
  } catch {}
  return { sessions: {}, lastActive: null };
}

function save(): void {
  try {
    const dir = join(homedir(), '.claude', 'claude-code-proxy', 'data');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(SESSIONS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  } catch {}
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Estrae il sessionId dal body della richiesta.
 * Claude Code invia metadata.user_id nel formato "utente_sessionId".
 */
export function extractSessionId(body: Record<string, unknown>): string | null {
  try {
    const metadata = body.metadata as Record<string, unknown> | undefined;
    if (!metadata) return null;
    const userId = metadata.user_id as string | undefined;
    if (!userId) return null;
    // Formato: "user_sessionId"
    const parts = userId.split('_session_');
    if (parts.length > 1) {
      return parts[1];
    }
    return userId; // Fallback: usa tutto come sessionId
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

  // Limita a 50 sessioni per evitare memory leak
  const keys = Object.keys(store.sessions);
  if (keys.length > 50) {
    const toRemove = keys.slice(0, keys.length - 50);
    for (const k of toRemove) delete store.sessions[k];
  }

  save();
}

/**
 * Restituisce l'utilizzo per una sessione specifica.
 * Se sessionId è esplicito ma non ha dati, ritorna null (non l'ultima attiva).
 * Se sessionId non è specificato, ritorna l'ultima attiva.
 */
export function getSessionUsage(sessionId?: string | null): SessionUsage | null {
  // Se è richiesta una sessione specifica, torna SOLO quella
  if (sessionId) {
    return store.sessions[sessionId] || null;
  }
  // Nessuna sessione specifica: torna l'ultima attiva
  if (store.lastActive && store.sessions[store.lastActive]) {
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
