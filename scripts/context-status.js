#!/usr/bin/env node
/**
 * Context status line script for Claude Code Proxy
 * Shows model, folder, context usage in terminal-friendly format
 * Colori: \x1b[2m = dim, \x1b[0m = reset
 *
 * Usage: node ~/.claude/claude-code-proxy/scripts/context-status.js
 * Returns: "z-ai/glm-4.5-air:free │ nome-cartella │ ████░░░░ 45k/131k (35%)"
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
    const inflation = usage.inflation || 1;

    // Usa peak se disponibile
    const inputTokens = (usage.peakInputTokens || usage.inputTokens || 0);
    const outputTokens = (usage.peakOutputTokens || usage.outputTokens || 0);
    const totalUsed = inputTokens + outputTokens;

    // Se non ci sono dati
    if (!model) {
      process.stdout.write(`${DIM}waiting for requests...${RESET}\n`);
      process.exit(0);
    }

    // Determina contesto massimo: PRIORITA' al modello reale, fallback al tier Claude
    let maxContext = 200_000;
    if (config.models && Array.isArray(config.models)) {
      const entry = config.models.find(
        (m) => m.id === model || model.includes(m.id),
      );
      if (entry && entry.context) {
        maxContext = entry.context;
      }
    }
    // Fallback al tier Claude SOLO se il modello non è stato trovato in proxy-context.json
    if (maxContext === 200_000 && usage.tier && config.claude && config.claude[usage.tier]) {
      maxContext = config.claude[usage.tier];
    }

    // Nome cartella corrente (da process.cwd)
    const folder = process.cwd().split('/').pop() || '';

    // Build progress bar (8 segments) with color
    const pct = Math.min(100, Math.round((totalUsed / maxContext) * 100));
    const filled = Math.min(8, Math.round((pct / 100) * 8));
    const empty = 8 - filled;

    let barColor = GREEN;
    if (pct > 80) barColor = RED;
    else if (pct > 50) barColor = YELLOW;

    const bar = `${barColor}${'█'.repeat(filled)}${RESET}${DIM}${'░'.repeat(empty)}${RESET}`;

    // Format numbers
    const fmt = (n) => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return Math.round(n / 1_000) + 'k';
      return String(n);
    };

    const maxCtx = fmt(maxContext);
    const used = fmt(totalUsed);
    const infl = inflation === 1 ? '' : ` ${DIM}×${inflation.toFixed(1)}${RESET}`;
    const pctColor = pct > 80 ? RED : (pct > 50 ? YELLOW : '');
    const pctStr = pctColor ? `${pctColor}${pct}%${RESET}` : `${pct}%`;

    // Format: model │ folder │ ████░░░░ 45k/131k (35%) ×1.0
    const folderTag = folder ? `${DIM}${folder}${RESET}` : '';
    process.stdout.write(
      `${DIM}${model}${RESET}${folderTag ? ` ${DIM}│${RESET} ${folderTag}` : ''} ${DIM}│${RESET} ${bar} ${DIM}${used}/${maxCtx} (${RESET}${pctStr}${DIM})${RESET}${infl}\n`,
    );
  } catch (err) {
    process.stdout.write(`${DIM}⚠ proxy offline${RESET}\n`);
  }
}

main();
