#!/usr/bin/env node
/**
 * Auto-compact hook per Claude Code Proxy
 *
 * PostToolUse hook: dopo ogni tool call, controlla il contesto proxy.
 * Se > soglia, suggerisce a Claude Code di compattare.
 *
 * Installazione in ~/.claude/settings.json:
 *   "PostToolUse": [{
 *     "matcher": "Bash|Write|Edit",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "\"...node\" \"...auto-compact-hook.js\"",
 *       "timeout": 5
 *     }]
 *   }]
 */

// Soglia: quando il contesto supera questa %, inietta compact
const COMPACT_THRESHOLD = 0.7; // 70%

async function main() {
  try {
    const resp = await fetch('http://localhost:3456/admin/context', {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) process.exit(0);

    const data = await resp.json();
    const usage = data.lastUsage || {};
    const config = data.config || {};

    const model = usage.model || '';
    const provider = usage.provider || '';
    const tier = usage.tier || '';
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const totalUsed = inputTokens + outputTokens;

    // Determina contesto massimo
    let maxContext = 200_000;
    if (config.models && Array.isArray(config.models)) {
      const entry = config.models.find(
        (m) => m.id === model || model.includes(m.id),
      );
      if (entry && entry.context) maxContext = entry.context;
    }
    if (tier && config.claude && config.claude[tier] && !maxContext) {
      maxContext = config.claude[tier];
    }

    const pct = totalUsed / maxContext;

    if (pct >= COMPACT_THRESHOLD) {
      const pctDisplay = Math.round(pct * 100);
      const usedDisplay = Math.round(totalUsed / 1000);
      const maxDisplay = Math.round(maxContext / 1000);
      const compactTokens = Math.round(totalUsed * 0.6); // compact to ~60%

      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `[Context Alert] ${pctDisplay}% of context used (${usedDisplay}k/${maxDisplay}k). Consider compacting to ~${Math.round(compactTokens/1000)}k tokens to avoid hitting the limit.`,
        },
      }));
    }
  } catch {
    // Proxy offline — silent
  }
}

main();
