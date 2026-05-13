/**
 * ContextRegistry — gestisce proxy-context.json per tracciamento contesto modelli
 * Phase: 07-context-tracker
 *
 * Salva in ~/.claude-code-proxy/proxy-context.json la mappa dei modelli con
 * contesto massimo e max output tokens. Usato per token inflation.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelContextEntry {
  id: string;
  provider: string;
  context: number;
  max_output: number;
}

export interface ProxyContext {
  version: number;
  default_context: number;
  default_max_output: number;
  models: ModelContextEntry[];
  claude: Record<string, number>;
}

export interface LastContextUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  tier?: string;
  inflation: number;
}

// ---------------------------------------------------------------------------
// Percorsi e default
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), '.claude-code-proxy');
const CONFIG_FILE = join(CONFIG_DIR, 'proxy-context.json');

const DEFAULT_CONTEXT: ProxyContext = {
  version: 1,
  default_context: 200_000,
  default_max_output: 8192,
  models: [],
  claude: {
    opus: 1_000_000,
    sonnet: 1_000_000,
    haiku: 200_000,
  },
};

// ---------------------------------------------------------------------------
// Classe
// ---------------------------------------------------------------------------

export class ContextRegistry {
  private cache: ProxyContext | null = null;

  /** Carica proxy-context.json (o default se non esiste) */
  load(): ProxyContext {
    try {
      if (existsSync(CONFIG_FILE)) {
        const raw = readFileSync(CONFIG_FILE, 'utf-8');
        this.cache = JSON.parse(raw) as ProxyContext;
        return this.cache!;
      }
    } catch {
      console.warn('[ContextRegistry] Errore lettura proxy-context.json, uso default');
    }
    this.cache = { ...DEFAULT_CONTEXT, models: [...DEFAULT_CONTEXT.models] };
    return this.cache!;
  }

  /** Salva proxy-context.json */
  save(ctx: ProxyContext): void {
    this.cache = ctx;
    try {
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      }
      writeFileSync(CONFIG_FILE, JSON.stringify(ctx, null, 2), { mode: 0o600 });
    } catch (err) {
      console.error('[ContextRegistry] Errore salvataggio:', err);
    }
  }

  /** Ottiene contesto per un modello specifico */
  getModelContext(modelId: string, providerName: string): ModelContextEntry | null {
    const ctx = this.load();
    return ctx.models.find(m => m.id === modelId && m.provider === providerName) ?? null;
  }

  /** Ottiene contesto Claude per tier */
  getClaudeContext(tier: string): number {
    const ctx = this.load();
    return ctx.claude[tier] ?? 200_000;
  }

  /**
   * Sincronizza modelli con quelli appena validati:
   * - Aggiunge nuovi modelli con default_context
   * - Rimuove modelli di provider cancellati
   * - Mantiene valori personalizzati dall'utente
   */
  syncModels(validated: Map<string, string[]>): void {
    const ctx = this.load();
    const known = new Map<string, ModelContextEntry>();
    for (const m of ctx.models) {
      known.set(`${m.provider}:${m.id}`, m);
    }

    const nuovi: ModelContextEntry[] = [];
    for (const [provider, ids] of validated) {
      for (const id of ids) {
        const key = `${provider}:${id}`;
        if (known.has(key)) {
          nuovi.push(known.get(key)!);
        } else {
          nuovi.push({
            id,
            provider,
            context: ctx.default_context,
            max_output: ctx.default_max_output,
          });
        }
      }
    }

    ctx.models = nuovi;
    this.save(ctx);
  }

  /** Crea file di default se non esiste */
  ensureDefaults(): void {
    if (!existsSync(CONFIG_FILE)) {
      this.save({ ...DEFAULT_CONTEXT, models: [...DEFAULT_CONTEXT.models] });
    }
  }
}

// Istanza globale
export const contextRegistry = new ContextRegistry();
