#!/usr/bin/env node
/**
 * Context status script for Claude Code Proxy
 * Shows model context usage in terminal-friendly format
 *
 * Usage: node ~/.claude-code-proxy/scripts/context-status.js
 * Returns: "deepseek-v4-flash | ████░░░░ 45k/128k (35%)"
 *
 * For status line integration, add this to ~/.claude/settings.json:
 *   "statusLine": {
 *     "type": "command",
 *     "command": "\"...node\" \"...context-status.js\""
 *   }
 */

const PROXY_URL = 'http://localhost:3456';

async function main() {
  try {
    const resp = await fetch(`${PROXY_URL}/admin/context`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) {
      console.log('⚠ Proxy offline');
      process.exit(0);
    }

    const data = await resp.json();
    const usage = data.lastUsage || {};
    const config = data.config || {};

    const model = usage.model || 'unknown';
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const tier = usage.tier || '';

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

    // Build progress bar (8 segments)
    const pct = Math.min(100, Math.round((totalUsed / maxContext) * 100));
    const filled = Math.min(8, Math.round((pct / 100) * 8));
    const empty = 8 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    // Format numbers (e.g. 45000 → 45k)
    const fmt = (n) => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return Math.round(n / 1_000) + 'k';
      return String(n);
    };

    const maxCtx = fmt(maxContext);
    const used = fmt(totalUsed);

    console.log(`${model} | ${bar} ${used}/${maxCtx} (${pct}%)`);
  } catch (err) {
    console.log('⚠ Proxy offline');
  }
}

main();
