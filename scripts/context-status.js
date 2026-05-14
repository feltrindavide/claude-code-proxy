#!/usr/bin/env node
/**
 * Context status line script for Claude Code Proxy
 * Shows model, provider, tier, context usage in terminal-friendly format
 * Colori: \x1b[2m = dim, \x1b[0m = reset
 *
 * Usage: node ~/.claude/claude-code-proxy/scripts/context-status.js
 * Returns: "deepseek-v4-flash (opencode-go) | ████░░░░ 45k/128k (35%) | ×1.0"
 *
 * For status line integration, add this to ~/.claude/settings.json:
 *   "statusLine": {
 *     "type": "command",
 *     "command": "\"...node\" \"...context-status.js\""
 *   }
 */

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

const PROXY_URL = 'http://localhost:3456';

async function main() {
  try {
    const resp = await fetch(`${PROXY_URL}/admin/context`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) {
      process.stdout.write(`${DIM}⚠ proxy offline${RESET}\n`);
      process.exit(0);
    }

    const data = await resp.json();
    const usage = data.lastUsage || {};
    const config = data.config || {};

    const model = usage.model || '';
    const provider = usage.provider || '';
    const tier = usage.tier || '';
    const inflation = usage.inflation || 1;
    const inputTokens = (usage.peakInputTokens || usage.inputTokens || 0);
    const outputTokens = (usage.peakOutputTokens || usage.outputTokens || 0);

    // Se non ci sono dati (proxy appena avviato o nessuna richiesta ancora)
    if (!model) {
      process.stdout.write(`${DIM}waiting for requests...${RESET}\n`);
      process.exit(0);
    }

    // Total tokens used (input + output)
    const totalUsed = inputTokens + outputTokens;

    // Determine max context from model config or Claude tier
    let maxContext = 200_000; // default fallback

    // Try model-specific context first
    if (config.models && Array.isArray(config.models)) {
      const modelEntry = config.models.find(
        (m) => m.id === model || model.includes(m.id),
      );
      if (modelEntry && modelEntry.context) {
        maxContext = modelEntry.context;
      }
    }

    // Fall back to Claude tier context
    if (tier && config.claude && config.claude[tier]) {
      maxContext = config.claude[tier];
    }

    // Build progress bar (8 segments) with color
    const pct = Math.min(100, Math.round((totalUsed / maxContext) * 100));
    const filled = Math.min(8, Math.round((pct / 100) * 8));
    const empty = 8 - filled;

    let barColor = GREEN;
    if (pct > 80) barColor = RED;
    else if (pct > 50) barColor = YELLOW;

    const bar = `${barColor}${'█'.repeat(filled)}${RESET}${DIM}${'░'.repeat(empty)}${RESET}`;

    // Format numbers (e.g. 45000 → 45k)
    const fmt = (n) => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return Math.round(n / 1_000) + 'k';
      return String(n);
    };

    const maxCtx = fmt(maxContext);
    const used = fmt(totalUsed);
    const infl = inflation === 1 ? '' : ` ${DIM}×${inflation.toFixed(1)}${RESET}`;
    const provTag = provider ? `${DIM}(${provider})${RESET} ` : '';
    const tierTag = tier ? `${DIM}[${tier}]${RESET} ` : '';

    // Format: model (provider) [tier] | ████░░░░ 45k/128k (35%) ×1.0
    const pctColor = pct > 80 ? RED : (pct > 50 ? YELLOW : '');
    const pctStr = pctColor ? `${pctColor}${pct}%${RESET}` : `${pct}%`;

    process.stdout.write(
      `${DIM}${model}${RESET} ${provTag}${tierTag}${DIM}│${RESET} ${bar} ${DIM}${used}/${maxCtx} (${RESET}${pctStr}${DIM})${RESET}${infl}\n`,
    );
  } catch (err) {
    process.stdout.write(`${DIM}⚠ proxy offline${RESET}\n`);
  }
}

main();
