#!/usr/bin/env node
/**
 * Auto-compact hook per Claude Code Proxy
 *
 * PostToolUse hook: dopo ogni tool call, controlla il contesto proxy.
 * - suggest (default): inietta additionalContext che suggerisce /compact
 * - trigger: blocca con decision=block e ordina a Claude di eseguire /compact
 *
 * Installato/sincronizzato da installPluginOnStartup() nel proxy.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const COOLDOWN_MS = 5 * 60 * 1000;
const COOLDOWN_FILE = path.join(
  os.homedir(),
  '.claude',
  'claude-code-proxy',
  'data',
  'compact-cooldown.json',
);

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

function loadCooldown() {
  try {
    return JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCooldown(data) {
  try {
    const dir = path.dirname(COOLDOWN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {}
}

function isCooldownActive(sessionId) {
  if (!sessionId) return false;
  const data = loadCooldown();
  const last = data[sessionId];
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function markCooldown(sessionId) {
  if (!sessionId) return;
  const data = loadCooldown();
  data[sessionId] = Date.now();
  saveCooldown(data);
}

function buildUsageMessage(pctDisplay, usedDisplay, maxDisplay, provider, model) {
  return (
    `[Proxy Context ${pctDisplay}%] ${usedDisplay}k/${maxDisplay}k tokens used ` +
    `(${provider}/${model}).`
  );
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
    const [ctxResp, configResp] = await Promise.all([
      fetch('http://localhost:3456/admin/context', { signal: AbortSignal.timeout(2000), headers: adminHeaders }),
      fetch('http://localhost:3456/admin/auto-compact', { signal: AbortSignal.timeout(2000), headers: adminHeaders }),
    ]);

    if (!ctxResp.ok || !configResp.ok) {
      process.exit(0);
    }

    const data = await ctxResp.json();
    const compactConfig = await configResp.json();
    const compactThreshold = compactConfig.threshold ?? 0.7;
    const compactMode = compactConfig.mode ?? 'suggest';

    const usage = data.lastUsage || {};
    const config = data.config || {};

    const model = usage.model || '';
    const provider = usage.provider || '';
    const tier = usage.tier || '';
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const totalUsed = inputTokens + outputTokens;

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

    if (pct < compactThreshold) {
      process.exit(0);
    }

    if (isCooldownActive(hookSessionId)) {
      process.exit(0);
    }

    const pctDisplay = Math.round(pct * 100);
    const usedDisplay = Math.round(totalUsed / 1000);
    const maxDisplay = Math.round(maxContext / 1000);
    const baseMsg = buildUsageMessage(pctDisplay, usedDisplay, maxDisplay, provider, model);

    if (compactMode === 'trigger') {
      markCooldown(hookSessionId);
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason:
          `${baseMsg} Context is above the ${Math.round(compactThreshold * 100)}% proxy threshold. ` +
          'Run /compact immediately before doing anything else. Summarize progress, then compact.',
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: baseMsg + ' Auto-compact trigger mode is active.',
        },
      }));
      process.exit(0);
    }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          baseMsg +
          ' Consider running /compact or the conversation may hit the ' +
          `${maxDisplay}k limit soon.`,
      },
    }));
  } catch {
    // Proxy offline — silent
  }
}

main();
