#!/usr/bin/env node
/**
 * Auto-compact hook per Claude Code Proxy
 *
 * PostToolUse hook: dopo ogni tool call, controlla il contesto proxy.
 * Se > soglia (configurabile da dashboard al 70% default), suggerisce compact.
 *
 * Installato automaticamente da installPluginOnStartup() nel proxy.
 */

async function main() {
  try {
    const [ctxResp, configResp] = await Promise.all([
      fetch('http://localhost:3456/admin/context', { signal: AbortSignal.timeout(2000) }),
      fetch('http://localhost:3456/admin/auto-compact', { signal: AbortSignal.timeout(2000) }),
    ]);

    if (!ctxResp.ok || !configResp.ok) process.exit(0);

    const data = await ctxResp.json();
    const { threshold } = await configResp.json();
    const compactThreshold = threshold ?? 0.7;

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
    if (tier && config.claude && config.claude[tier]) {
      maxContext = config.claude[tier];
    }

    const pct = totalUsed / maxContext;

    if (pct >= compactThreshold) {
      const pctDisplay = Math.round(pct * 100);
      const usedDisplay = Math.round(totalUsed / 1000);
      const maxDisplay = Math.round(maxContext / 1000);
      const pctLabel = Math.round(compactThreshold * 100);

      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext:
            `[Proxy Context ${pctDisplay}%] ${usedDisplay}k/${maxDisplay}k tokens used ` +
            `(${provider}/${model}). Consider compacting or the conversation may hit the ` +
            `${maxDisplay}k limit soon.`,
        },
      }));
    }
  } catch {
    // Proxy offline — silent
  }
}

main();
