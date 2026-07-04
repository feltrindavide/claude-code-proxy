#!/usr/bin/env node
/**
 * Auto-compact hook per Claude Code Proxy
 *
 * PostToolUse hook: dopo ogni tool call, controlla il contesto proxy.
 * Se > soglia (configurabile da dashboard al 70% default), suggerisce compact.
 *
 * Installato automaticamente da installPluginOnStartup() nel proxy.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function getAdminHeaders() {
  try {
    const token = fs.readFileSync(
      path.join(os.homedir(), '.claude', 'claude-code-proxy', 'data', 'admin.token'),
      'utf-8',
    ).trim();
    return { 'X-Admin-Token': token };
  } catch {
    return {};
  }
}

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
    const stdinData = await readStdin();
    let hookSessionId = '';
    if (stdinData) {
      try {
        const parsed = JSON.parse(stdinData);
        hookSessionId = parsed.session_id || '';
      } catch {}
    }

    const adminHeaders = getAdminHeaders();
    const [ctxResp, configResp, sessionCtxResp] = await Promise.all([
      fetch('http://localhost:3456/admin/context', { signal: AbortSignal.timeout(2000), headers: adminHeaders }),
      fetch('http://localhost:3456/admin/auto-compact', { signal: AbortSignal.timeout(2000), headers: adminHeaders }),
      hookSessionId
        ? fetch(
            `http://localhost:3456/admin/context?session=${encodeURIComponent(hookSessionId)}`,
            { signal: AbortSignal.timeout(2000), headers: adminHeaders },
          )
        : Promise.resolve(null),
    ]);

    if (!ctxResp.ok || !configResp.ok) {
      process.exit(0);
    }

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

    // Determina contesto massimo: priorità al modello reale, fallback al tier
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

    const pct = totalUsed / maxContext;

    if (pct >= compactThreshold) {
      const pctDisplay = Math.round(pct * 100);
      const usedDisplay = Math.round(totalUsed / 1000);
      const maxDisplay = Math.round(maxContext / 1000);

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
