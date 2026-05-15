#!/usr/bin/env node
/**
 * Context status line script for Claude Code Proxy
 * Legge session_id da stdin (passato da Claude Code/OpenCode) per mostrare
 * i dati corretti per la sessione corrente.
 *
 * Formato: z-ai/glm-4.5-air:free │ cartella │ ████░░░░ 45k/131k (35%)
 *
 * Installazione in ~/.claude/settings.json:
 *   "statusLine": {
 *     "type": "command",
 *     "command": "\"...node\" \"...context-status.js\""
 *   }
 */

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

const PROXY_URL = 'http://localhost:3456';

function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => { resolve(input || null); });
    setTimeout(() => resolve(null), 1500);
  });
}

async function main() {
  try {
    // 1. Leggi stdin (session_id, model, cwd da Claude Code)
    const stdinData = await readStdin();
    let sessionId = '';
    let folderFromStdin = '';
    let stdinModel = '';

    if (stdinData) {
      try {
        const parsed = JSON.parse(stdinData);
        sessionId = parsed.session_id || '';
        folderFromStdin = parsed.workspace?.current_dir || '';
        stdinModel = parsed.model?.display_name || parsed.model?.id || '';
      } catch {}
    }

    // 2. Fetch contesto dal proxy (per-sessione se abbiamo sessionId)
    const url = sessionId
      ? `${PROXY_URL}/admin/context?session=${encodeURIComponent(sessionId)}`
      : `${PROXY_URL}/admin/context`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) {
      process.stdout.write(`${BOLD}⚠ proxy offline${RESET}\n`);
      process.exit(0);
    }

    const data = await resp.json();
    const usage = data.lastUsage || {};
    const config = data.config || {};

    // Model: contesto proxy > stdin
    const model = usage.model || stdinModel || '';
    const tier = usage.tier || '';
    const inflation = usage.inflation || 1;
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const totalUsed = inputTokens + outputTokens;

    // Se non c'è niente (no contesto, no stdin model), esci
    if (!model) {
      process.stdout.write(`${BOLD}○${RESET}\n`);
      process.exit(0);
    }

    // 3. Contesto massimo: priorità al modello reale, fallback al tier
    let maxContext = 200_000;
    let foundModel = false;
    if (config.models && Array.isArray(config.models)) {
      const entry = config.models.find(
        (m) => m.id === model || model.includes(m.id),
      );
      if (entry && entry.context) {
        maxContext = entry.context;
        foundModel = true;
      }
    }
    if (!foundModel && tier && config.claude && config.claude[tier]) {
      maxContext = config.claude[tier];
    }

    // 4. Nome cartella: da stdin > process.cwd
    const folder = (folderFromStdin || process.cwd()).split('/').pop() || '';

    // 5. Progress bar (10 segmenti) con colore
    // Almeno 1 segmento se ci sono token usati
    const pctRaw = (totalUsed / maxContext) * 100;
    const pct = Math.min(100, Math.round(pctRaw));
    const segs = 10;
    const filled = Math.min(segs, Math.max(totalUsed > 0 ? 1 : 0, Math.round((pct / 100) * segs)));
    const empty = segs - filled;

    let barColor = GREEN;
    if (pct > 80) barColor = RED;
    else if (pct > 50) barColor = YELLOW;

    const bar = `${barColor}${'█'.repeat(filled)}${RESET}${'░'.repeat(empty)}`;

    const fmt = (n) => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return Math.round(n / 1_000) + 'k';
      return String(n);
    };

    const maxCtx = fmt(maxContext);
    const used = fmt(totalUsed);
    const infl = inflation === 1 ? '' : ` ×${inflation.toFixed(1)}`;
    // Mostra 1 decimale per % < 10, intero per % >= 10
    const pctDisplay = pctRaw < 10 ? pctRaw.toFixed(1) : String(pct);
    const pctColor = pct > 80 ? RED : (pct > 50 ? YELLOW : '');
    const pctStr = pctColor ? `${pctColor}${pctDisplay}%${RESET}` : `${pctDisplay}%`;

    const folderTag = folder ? ` │ ${folder}` : '';

    // TUTTO in bold, niente dim
    process.stdout.write(
      `${BOLD}${model}${folderTag} │ ${bar} ${used}/${maxCtx} (${pctStr})${infl}${RESET}\n`,
    );
  } catch (err) {
    process.stdout.write(`${BOLD}⚠ proxy offline${RESET}\n`);
  }
}

main();
