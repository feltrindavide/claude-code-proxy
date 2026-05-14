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
// Mappa contesti noti (verificati su OpenRouter API)
// ---------------------------------------------------------------------------
const KNOWN_CONTEXTS: Record<string, { context: number; max_output: number }> = {
  // === DeepSeek ===
  // deepseek-v4-flash (paid, opencode-go) = 1,048,576 ctx / 131,072 max_out
  'deepseek-v4-flash': { context: 1_048_576, max_output: 131_072 },
  // deepseek/deepseek-v4-flash (openrouter) = same model
  'deepseek/deepseek-v4-flash': { context: 1_048_576, max_output: 131_072 },
  // deepseek-v4-flash-free (free tier, opencode-zen) = 256k ctx / 256k max_out
  'deepseek-v4-flash-free': { context: 256_000, max_output: 256_000 },
  'deepseek/deepseek-v4-flash:free': { context: 256_000, max_output: 256_000 },
  // deepseek-v4-pro = 1,048,576 ctx / 384,000 max_out
  'deepseek-v4-pro': { context: 1_048_576, max_output: 384_000 },
  'deepseek/deepseek-v4-pro': { context: 1_048_576, max_output: 384_000 },
  // === Qwen ===
  'qwen3.6-plus': { context: 1_000_000, max_output: 65_536 },
  'qwen3.5-plus': { context: 1_000_000, max_output: 65_536 },
  // === MiniMax ===
  'minimax-m2.7': { context: 196_608, max_output: 131_072 },
  'minimax-m2.5': { context: 131_072, max_output: 131_072 },
  'minimax-m2.5-free': { context: 131_072, max_output: 131_072 },
  // === Kimi ===
  'kimi-k2.6': { context: 262_142, max_output: 262_142 },
  'moonshotai/kimi-k2.6': { context: 262_142, max_output: 262_142 },
  // === GLM / Z.AI ===
  'z-ai/glm-4.5-air:free': { context: 131_072, max_output: 96_000 },
  // === Mimo ===
  'mimo-v2-pro': { context: 1_048_576, max_output: 131_072 },
  'mimo-v2-omni': { context: 262_144, max_output: 65_536 },
  // === Gemini ===
  'gemini-3.1-pro': { context: 1_048_576, max_output: 65_536 },
  'gemini-3-flash': { context: 1_048_576, max_output: 65_536 },
  // === Inclusion AI ===
  'inclusionai/ring-2.6-1t:free': { context: 262_144, max_output: 65_536 },
  'ring-2.6-1t-free': { context: 262_144, max_output: 65_536 },
  // === NVIDIA ===
  'nvidia/nemotron-3-super-120b-a12b:free': { context: 262_144, max_output: 262_144 },
  'nemotron-3-super-free': { context: 262_144, max_output: 262_144 },
  // === OpenRouter ===
  'openrouter/owl-alpha': { context: 1_048_756, max_output: 262_144 },
  // === OpenAI ===
  'openai/gpt-oss-120b:free': { context: 131_072, max_output: 131_072 },
  // === Claude ===
  'claude-opus-4-7': { context: 1_000_000, max_output: 8_192 },
  'claude-sonnet-4-6': { context: 1_000_000, max_output: 8_192 },
  'claude-haiku-4-5': { context: 200_000, max_output: 8_192 },
  // === Tencent ===
  'hy3-preview': { context: 262_144, max_output: 262_144 },
  // === Altri (default stimati) ===
  'trinity-large-preview-free': { context: 131_072, max_output: 131_072 },
  'mimo-v2.5': { context: 1_048_576, max_output: 131_072 },
  'mimo-v2.5-pro': { context: 1_048_576, max_output: 131_072 },
};

function getModelDefaults(modelId: string): { context: number; max_output: number } | null {
  const key = modelId.toLowerCase();
  return KNOWN_CONTEXTS[key] ?? null;
}

// ---------------------------------------------------------------------------
// Tipi
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
   * Sincronizza i modelli con quelli presenti in config.json (solo quelli
   * che l'utente ha esplicitamente aggiunto in Model Library).
   * Mantiene i valori personalizzati dell'utente.
   */
  syncFromConfig(configProviders: Array<{ name: string; models?: string[] }>): void {
    const ctx = this.load();
    const known = new Map<string, ModelContextEntry>();
    for (const m of ctx.models) {
      known.set(`${m.provider}:${m.id}`, m);
    }

    const nuovi: ModelContextEntry[] = [];
    for (const p of configProviders) {
      if (!p.models) continue;
      for (const id of p.models) {
        const key = `${p.name}:${id}`;
        if (known.has(key)) {
          nuovi.push(known.get(key)!);
        } else {
          const defaults = getModelDefaults(id);
          nuovi.push({
            id,
            provider: p.name,
            context: defaults?.context ?? ctx.default_context,
            max_output: defaults?.max_output ?? ctx.default_max_output,
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
