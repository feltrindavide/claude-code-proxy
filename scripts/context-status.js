#!/usr/bin/env node
/**
 * Context status line script for Claude Code Proxy
 * Shows the upstream mapped model (not Claude's native Opus/Sonnet label).
 *
 * Formato: gemma-4-31b-it │ cartella │ ████░░░░ 45k/131k (35%)
 */

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

const PROXY_URL = 'http://localhost:3456';

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

function shortLabel(model) {
  if (!model) return '';
  const slash = model.lastIndexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}

function isClaudeNativeName(name) {
  const lower = (name || '').toLowerCase();
  if (!lower) return false;
  if (lower.startsWith('claude-')) return true;
  if (/\b(opus|sonnet|haiku|fable)\b/.test(lower) && !lower.includes('/')) return true;
  return false;
}

function inferTier(modelId, displayName) {
  const text = `${modelId || ''} ${displayName || ''}`.toLowerCase();
  if (text.includes('fable')) return 'fable';
  if (text.includes('opus')) return 'opus';
  if (text.includes('sonnet')) return 'sonnet';
  if (text.includes('haiku')) return 'haiku';
  return '';
}

function loadModelOverrides() {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return settings.modelOverrides || {};
  } catch {
    return {};
  }
}

function resolveMappedModel({
  usageModel,
  stdinId,
  stdinDisplay,
  routes,
  overrides,
  usageTier,
}) {
  if (usageModel && !isClaudeNativeName(usageModel)) {
    return shortLabel(usageModel);
  }

  if (stdinId && overrides[stdinId]) {
    return shortLabel(overrides[stdinId]);
  }

  const tier = usageTier || inferTier(stdinId, stdinDisplay);
  if (tier && routes[tier]?.targetModel) {
    return shortLabel(routes[tier].targetModel);
  }

  if (usageModel) return shortLabel(usageModel);
  return shortLabel(stdinDisplay || stdinId || '');
}

function resolveContextModelId({
  usageModel,
  stdinId,
  stdinDisplay,
  routes,
  overrides,
  usageTier,
}) {
  if (usageModel && !isClaudeNativeName(usageModel)) return usageModel;

  if (stdinId && overrides[stdinId]) return overrides[stdinId];

  const tier = usageTier || inferTier(stdinId, stdinDisplay);
  if (tier && routes[tier]?.targetModel) return routes[tier].targetModel;

  return usageModel || stdinId || '';
}

async function main() {
  try {
    const stdinData = await readStdin();
    let sessionId = '';
    let folderFromStdin = '';
    let stdinModelId = '';
    let stdinModelDisplay = '';
    let stdinCtxInput = 0;
    let stdinCtxOutput = 0;
    let stdinCtxWindow = 0;

    if (stdinData) {
      try {
        const parsed = JSON.parse(stdinData);
        sessionId = parsed.session_id || '';
        folderFromStdin = parsed.workspace?.current_dir || '';
        stdinModelId = parsed.model?.id || '';
        stdinModelDisplay = parsed.model?.display_name || '';
        if (parsed.context_window) {
          stdinCtxInput = parsed.context_window.total_input_tokens || 0;
          stdinCtxOutput = parsed.context_window.total_output_tokens || 0;
          stdinCtxWindow = parsed.context_window.context_window_size || 0;
        }
      } catch {}
    }

    const url = sessionId
      ? `${PROXY_URL}/admin/context?session=${encodeURIComponent(sessionId)}`
      : `${PROXY_URL}/admin/context`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(2000), headers: getAdminHeaders() });
    if (!resp.ok) {
      process.stdout.write(`${BOLD}⚠ proxy offline${RESET}\n`);
      process.exit(0);
    }

    const data = await resp.json();
    const usage = data.lastUsage || {};
    const config = data.config || {};
    const routes = data.routes || {};
    const overrides = loadModelOverrides();

    const tier = usage.tier || '';
    const contextModelId = resolveContextModelId({
      usageModel: usage.model,
      stdinId: stdinModelId,
      stdinDisplay: stdinModelDisplay,
      routes,
      overrides,
      usageTier: tier,
    });
    const model = resolveMappedModel({
      usageModel: usage.model,
      stdinId: stdinModelId,
      stdinDisplay: stdinModelDisplay,
      routes,
      overrides,
      usageTier: tier,
    });

    const inputTokens = usage.inputTokens || stdinCtxInput || 0;
    const outputTokens = usage.outputTokens || stdinCtxOutput || 0;
    const totalUsed = inputTokens + outputTokens;

    if (!model) {
      process.stdout.write(`${BOLD}○${RESET}\n`);
      process.exit(0);
    }

    let maxContext = 200_000;
    let foundModel = false;
    if (config.models && Array.isArray(config.models)) {
      const entry = config.models.find(
        (m) => m.id === contextModelId || contextModelId.includes(m.id),
      );
      if (entry && entry.context) {
        maxContext = entry.context;
        foundModel = true;
      }
    }
    if (!foundModel && stdinCtxWindow) {
      maxContext = stdinCtxWindow;
      foundModel = true;
    }
    if (!foundModel && tier && config.claude && config.claude[tier]) {
      maxContext = config.claude[tier];
    }

    const folder = (folderFromStdin || process.cwd()).split('/').pop() || '';

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
    const pctDisplay = pctRaw < 10 ? pctRaw.toFixed(1) : String(pct);
    const pctColor = pct > 80 ? RED : (pct > 50 ? YELLOW : '');
    const pctStr = pctColor ? `${pctColor}${pctDisplay}%${RESET}` : `${pctDisplay}%`;

    const folderTag = folder ? ` │ ${folder}` : '';

    process.stdout.write(
      `${BOLD}${model}${folderTag} │ ${bar} ${used}/${maxCtx} (${pctStr})${RESET}\n`,
    );
  } catch {
    process.stdout.write(`${BOLD}⚠ proxy offline${RESET}\n`);
  }
}

main();
