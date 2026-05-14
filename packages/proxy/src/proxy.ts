/**
 * Custom proxy handler — replaces http-proxy-middleware passthrough
 * Phase: 02-sse-streaming-integration
 * Plan: 02-03, Task 2
 *
 * Per D-19: Custom SSE handler — intercept upstream SSE, transform to Anthropic events
 * Per D-21: Timeout: 120s streaming, 30s non-streaming
 * Per D-26: Anthropic-compatible error format
 * Per D-28: Log internally + user-friendly response
 *
 * Threat mitigations:
 * - T-02-10: emitAnthropicError sanitizes messages via getUserFacingErrorMessage()
 * - T-02-11: Uses resolution.provider.baseUrl from registry (not client request body)
 * - T-02-12: AbortController with per-adapter timeout
 */

import type { Request, Response } from 'express';
import type { RouteResolution } from './types/index.js';
import { getOrCreateAdapter } from './adapters/index.js';
import { providerService } from './services/provider.js';
import { getKey } from './services/keychain.js';
import { getUserFacingErrorMessage } from './services/sse-transformer.js';
import { parseToolArguments } from './services/response-parsers.js';
import { fetchWithRetry } from './services/retryHandler.js';
import { contextRegistry, type LastContextUsage } from './services/context-registry.js';
import { countRequestTokens, estimateOutputTokens } from './services/token-counter.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Emit an error response in the appropriate format (SSE or JSON)
 * Per D-26: Anthropic-compatible error format
 * Per D-28: User-friendly message, full error logged internally
 */
function emitAnthropicError(res: Response, error: unknown, wantsStream?: boolean): void {
  // Log full error internally (without API keys — getUserFacingErrorMessage sanitizes)
  console.error('[Proxy] Upstream error:', error);

  // Get sanitized user-friendly message
  const userFriendlyMessage = getUserFacingErrorMessage(error);

  if (wantsStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(
      `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: { type: 'api_error', message: userFriendlyMessage },
      })}\n\n`,
    );
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.json({
      type: 'error',
      error: { type: 'api_error', message: userFriendlyMessage },
    });
    return; // res.json() ends the response
  }
  res.end();
}

// ---------------------------------------------------------------------------
// Subagent model tag — parsing <CCR-SUBAGENT-MODEL> dal system prompt
// ---------------------------------------------------------------------------

const SUBAGENT_TAG_RE = /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s;

/**
 * Cerca <CCR-SUBAGENT-MODEL>model</CCR-SUBAGENT-MODEL> nel system prompt.
 * Se trovato, rimuove il tag e restituisce il model name.
 * Il tag permette di specificare un modello diverso per agent/subagent.
 */
function extractSubagentModel(body: Record<string, unknown>): string | null {
  const system = body.system;
  if (!system) return null;

  let systemStr: string;
  if (typeof system === 'string') {
    systemStr = system;
  } else if (Array.isArray(system)) {
    systemStr = system
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  } else {
    return null;
  }

  const match = systemStr.match(SUBAGENT_TAG_RE);
  if (!match) return null;

  const modelName = match[1].trim();
  if (!modelName) return null;

  // Rimuovi il tag dal system prompt
  const cleaned = systemStr.replace(SUBAGENT_TAG_RE, '').trim();
  if (typeof body.system === 'string') {
    body.system = cleaned;
  } else if (Array.isArray(body.system)) {
    // Replace text in the first text block
    for (const b of body.system as any[]) {
      if (b.type === 'text') {
        b.text = b.text.replace(SUBAGENT_TAG_RE, '').trim();
        break;
      }
    }
  }

  console.log(`[Proxy] Subagent model tag: using "${modelName}" instead of "${body.model}"`);
  return modelName;
}

// ---------------------------------------------------------------------------
// Persistenza utilizzo contesto — salva il PEAK (massimo storico)
// In questo modo, se una richiesta ha meno token (es. cambio modello), la
// barra mostra comunque il valore più alto raggiunto.
// ---------------------------------------------------------------------------
const USAGE_FILE = join(homedir(), '.claude', 'claude-code-proxy', 'data', 'context-usage.json');

interface PersistedUsage extends LastContextUsage {
  peakInputTokens?: number;
  peakOutputTokens?: number;
}

function loadLastUsage(): PersistedUsage {
  try {
    if (existsSync(USAGE_FILE)) {
      return JSON.parse(readFileSync(USAGE_FILE, 'utf-8')) as PersistedUsage;
    }
  } catch {}
  return { inputTokens: 0, outputTokens: 0, model: '', provider: '', inflation: 1, peakInputTokens: 0, peakOutputTokens: 0 };
}

function saveLastUsage(usage: PersistedUsage): void {
  try {
    const dir = join(homedir(), '.claude', 'claude-code-proxy', 'data');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2), { mode: 0o600 });
  } catch {}
}

export let lastContextUsage: PersistedUsage = loadLastUsage();

if (lastContextUsage.model) {
  console.log(`[Context] Restored: ${lastContextUsage.model} | ${lastContextUsage.inputTokens + lastContextUsage.outputTokens} tokens (peak: ${(lastContextUsage.peakInputTokens || 0) + (lastContextUsage.peakOutputTokens || 0)})`);
}

/**
 * Handle incoming /v1/messages requests
 * Full transformation pipeline: resolve → transform → fetch → transform SSE → stream
 */
export async function handleProxyRequest(
  req: Request,
  res: Response,
): Promise<void> {
  // 1. Parse model from request body
  const body = req.body || {};
  let modelName = body.model || 'claude-opus-4-20250514';

  // Subagent model tag: <CCR-SUBAGENT-MODEL>model</CCR-SUBAGENT-MODEL> in system prompt
  // Permette di specificare un modello diverso per sessioni subagent
  const subagentModel = extractSubagentModel(body);
  if (subagentModel) {
    modelName = subagentModel;
  }

  let resolution: RouteResolution | null = null;

  // Decode gateway model IDs: "anthropic/{providerName}/{targetModel}"
  if (modelName.startsWith('anthropic/')) {
    const parts = modelName.split('/');
    if (parts.length >= 3) {
      const providerName = parts[1];
      const targetModel = parts.slice(2).join('/');
      const provider = providerService.getProvider(providerName);
      if (provider) {
        resolution = {
          provider,
          targetModel,
          originalModel: modelName,
        };
      }
    }
  }

  // 2. Resolve route via ProviderService
  if (!resolution) {
    // First try direct model lookup (custom model names)
    resolution = providerService.resolveCustomModel(modelName);
    // Fall back to tier-based routing (claude-opus-* → opus → route)
    if (!resolution) {
      resolution = providerService.resolveModelRoute(modelName);
    }
  }
  if (!resolution) {
    return emitAnthropicError(
      res,
      `No route configured for model: ${modelName}`,
      body.stream === true,
    );
  }

  // Enrich request log with route resolution data (per D-45, 04-01)
  (req as any)._logContext = {
    claudeTier: resolution.claudeTier,
    providerName: resolution.provider.name,
    targetModel: resolution.targetModel,
  };

  // 3. Get API key from Keychain
  const apiKey = await getKey(resolution.provider.name);
  if (!apiKey) {
    return emitAnthropicError(
      res,
      `API key not found for provider: ${resolution.provider.name}`,
      body.stream === true,
    );
  }

  // 4. Select adapter — use providerType if available, fall back to provider name
  const providerType =
    resolution.provider.providerType || resolution.provider.name;
  const adapter = getOrCreateAdapter(
    providerType,
    resolution.provider.baseUrl,
  );

  // 5. Calcola token di input REALI per passarli a Claude Code
  const realInputTokens = countRequestTokens(body.messages, body.system, body.tools);

  // 5b. Transform request body (Anthropic → provider format)
  const providerBody = adapter.transformRequest(body, resolution);

  // Debug: check reasoning_content for DeepSeek
  if (resolution.targetModel?.toLowerCase().includes('deepseek') && Array.isArray(providerBody.messages)) {
    const hasRC = (providerBody.messages as any[]).filter((m: any) => m.role === 'assistant' && !m.reasoning_content).length;
    if (hasRC > 0) {
      console.log(`[Proxy DEBUG] ${hasRC} assistant message(s) missing reasoning_content for DeepSeek!`);
    }
  }

  // Force Reasoning: se il modello non supporta thinking nativo, 
  // converte i thinking block in <reasoning_content> e inietta un prompt
  const forceReasoningModels: string[] = []; // Configurable: es. ['qwen', 'minimax']
  const needsForceReasoning = forceReasoningModels.some(m =>
    resolution.targetModel.toLowerCase().includes(m)
  );
  if (needsForceReasoning) {
    const messages = (providerBody as any).messages || [];
    // Wrap assistant thinking content in reasoning tags
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.content) {
        if (typeof msg.content === 'string' && msg.content.includes('<thinking>')) {
          msg.content = msg.content.replace(/<thinking>([\s\S]*?)<\/thinking>/g, '<reasoning_content>$1</reasoning_content>');
        }
      }
    }
    // Inject reasoning prompt in last user message
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const prompt = '\n\nBefore answering, reason step-by-step inside <reasoning_content> tags. Then provide your final answer.';
      if (typeof lastMsg.content === 'string') {
        lastMsg.content += prompt;
      } else if (Array.isArray(lastMsg.content)) {
        lastMsg.content.push({ type: 'text', text: prompt });
      }
    }
    console.log(`[Proxy] Force reasoning enabled for ${resolution.targetModel}`);
  }

  // Boost max_tokens for models with high reasoning overhead (e.g. DeepSeek)
  // These models spend tokens on chain-of-thought before producing a response.
  // The auto-mode classifier uses small max_tokens (1-50) which gets consumed
  // entirely by reasoning, leaving no tokens for the actual response.
  const highReasoningModels = ['deepseek', 'deepseek-r1', 'deepseek-v4'];
  const needsBoost = highReasoningModels.some(m => 
    resolution.targetModel.toLowerCase().includes(m)
  );
  const originalMaxTokens = (providerBody as any).max_tokens;
  if (needsBoost && originalMaxTokens !== undefined && originalMaxTokens <= 200) {
    // DeepSeek uses chain-of-thought that consumes ~150-500+ tokens.
    // The auto-mode classifier sends 1-50 tokens which gets entirely consumed
    // by reasoning, leaving 0 tokens for the actual response.
    // Only boost for small max_tokens (classifier-style requests).
    const boosted = 2048;
    (providerBody as any).max_tokens = boosted;
    
    // Add system instruction to suppress chain-of-thought reasoning
    // DeepSeek defaults to verbose analysis even for simple requests
    (providerBody as any).messages = [
      { role: 'system', content: 'Answer directly and concisely. Do NOT analyze, think step by step, or explain. Just give the answer.' },
      ...((providerBody as any).messages || [])
    ];
    
    console.log(`[Proxy] Boosted max_tokens from ${originalMaxTokens} to ${boosted} for ${resolution.targetModel} (reasoning overhead)`);
  }

  // Clamp max_tokens to model's max_output if known (evita errori "max_tokens exceeds model limit")
  const modelInfo = contextRegistry.getModelContext(resolution.targetModel, resolution.provider.name);
  if (modelInfo && (providerBody as any).max_tokens !== undefined) {
    const current = (providerBody as any).max_tokens as number;
    if (current > modelInfo.max_output) {
      (providerBody as any).max_tokens = modelInfo.max_output;
      console.log(`[Proxy] Clamped max_tokens from ${current} to ${modelInfo.max_output} (model max_output cap)`);
    }
  }

  // 6. Make upstream request with retry (D-66 to D-69)
  let retryAttempt = 0;

  try {
    const upstreamResponse = await fetchWithRetry(
      resolution.provider.name,
      async (attemptNumber) => {
        retryAttempt = attemptNumber;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), adapter.timeouts.streaming);

          const response = await fetch(
            `${resolution.provider.baseUrl}${adapter.apiPath}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                Accept: 'text/event-stream',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              },
              body: JSON.stringify(providerBody),
              signal: controller.signal,
            },
          );

        clearTimeout(timeout);
        return response;
      },
    );

    // Signal retry count to request logger (D-69)
    if (retryAttempt > 0) {
      (req as any)._retryAttempt = retryAttempt;
    }

    // 7. Check if client wants streaming (only true = streaming; absent/false = JSON)
    const wantsStream = body.stream === true;
    (res as any)._wantsStream = wantsStream;

    // 8. Transform and stream response (provider SSE → Anthropic SSE)
    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Calcola inflation per token output
      const inflationFactor = getInflationFactor(resolution);

      // Batch writes to reduce overhead from DeepSeek's many tiny reasoning chunks
      const buf: string[] = [];
      for await (const event of adapter.transformResponse(upstreamResponse, {
        messageId: `msg_${crypto.randomUUID()}`,
        model: body.model,
        inputTokens: realInputTokens.total,
      })) {
        // Applica inflation a message_start (input) e message_delta (output)
        if (inflationFactor !== 1) {
          buf.push(inflateUsageTokens(event, inflationFactor));
        } else {
          buf.push(event);
        }
        // Flush in batches of 15 events or on message boundaries
        if (buf.length >= 15 || event.includes('message_') || event.includes('"error"')) {
          res.write(buf.join(''));
          buf.length = 0;
        }
      }
      if (buf.length > 0) res.write(buf.join(''));
      res.end();
      // Traccia ultimo utilizzo con conteggio token accurato
      const inputTok = countRequestTokens(body.messages, body.system, body.tools);
      updateLastUsage(inputTok.total, 0, resolution, inflationFactor);
    } else {
      // Non-streaming: accumulate events into a complete JSON response
      res.setHeader('Content-Type', 'application/json');
      let contentText = '';
      let stopReason = 'end_turn';
      let toolUseId = '';
      let toolUseName = '';
      let toolUseInput = '';

      for await (const event of adapter.transformResponse(upstreamResponse, {
        messageId: `msg_${crypto.randomUUID()}`,
        model: body.model,
        inputTokens: realInputTokens.total,
      })) {
        // Parse SSE event to extract data
        const dataMatch = event.match(/^data: (.+)$/m);
        if (!dataMatch) continue;
        try {
          const parsed = JSON.parse(dataMatch[1]);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            contentText += parsed.delta.text || '';
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'thinking_delta') {
            contentText += parsed.delta.thinking || '';
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
            toolUseInput += parsed.delta.partial_json || '';
          } else if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            toolUseId = parsed.content_block.id || '';
            toolUseName = parsed.content_block.name || '';
            toolUseInput = '';
          } else if (parsed.type === 'message_delta') {
            stopReason = parsed.delta?.stop_reason || 'end_turn';
          }
        } catch {}
      }

      // Build content array
      const content: any[] = [];
      if (contentText) {
        content.push({ type: 'text', text: contentText });
      }
      // Claude Code doesn't handle empty content arrays well
      if (content.length === 0 && !toolUseId) {
        content.push({ type: 'text', text: '(no output)' });
      }
      if (toolUseId) {
        const parsedInput = parseToolArguments(toolUseInput || '{}');
        content.push({
          type: 'tool_use',
          id: toolUseId,
          name: toolUseName,
          input: JSON.parse(parsedInput),
        });
      }

      const outTokens = estimateOutputTokens(contentText);
      const inflationFactor = getInflationFactor(resolution);
      const inflatedInput = Math.max(1, Math.round(realInputTokens.total * inflationFactor));
      const inflatedOutput = Math.max(1, Math.round(outTokens * inflationFactor));
      res.json({
        id: `msg_${crypto.randomUUID()}`,
        type: 'message',
        role: 'assistant',
        content,
        model: body.model,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: inflatedInput, output_tokens: inflatedOutput },
      });
      updateLastUsage(realInputTokens.total, outTokens, resolution, inflationFactor);
    }
  } catch (error) {
    // Instead of emitting an error event (which Claude Code can't parse),
    // return a valid text response with the error message.
    // This way Claude Code always gets a parsable response.
    const errMsg = getUserFacingErrorMessage(error);
    const isStream = (res as any)._wantsStream;

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      emitSSEEvent(res, 'message_start', {
        type: 'message_start',
        message: {
          id: `msg_${crypto.randomUUID()}`,
          type: 'message',
          role: 'assistant',
          content: [],
          model: body.model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 1 },
        },
      });
      emitSSEEvent(res, 'content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      emitSSEEvent(res, 'content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: errMsg },
      });
      emitSSEEvent(res, 'content_block_stop', {
        type: 'content_block_stop',
        index: 0,
      });
      emitSSEEvent(res, 'message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { input_tokens: 0, output_tokens: estimateOutputTokens(errMsg) },
      });
      emitSSEEvent(res, 'message_stop', { type: 'message_stop' });
      res.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.json({
        id: `msg_${crypto.randomUUID()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: errMsg }],
        model: body.model,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: estimateOutputTokens(errMsg) },
      });
    }
  }
}

function emitSSEEvent(res: Response, eventType: string, data: Record<string, unknown>): void {
  res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Inflation token per contesto
// ---------------------------------------------------------------------------

/** Calcola il fattore di inflazione basato sul contesto reale del modello */
function getInflationFactor(resolution: RouteResolution): number {
  if (!resolution.claudeTier || !resolution.targetModel) return 1;
  const claudeCtx = contextRegistry.getClaudeContext(resolution.claudeTier);
  const modelCtx = contextRegistry.getModelContext(resolution.targetModel, resolution.provider.name);
  if (!modelCtx) return 1;
  return claudeCtx / modelCtx.context;
}

/** Gonfia input_tokens e output_tokens in eventi message_start e message_delta */
function inflateUsageTokens(event: string, factor: number): string {
  try {
    const match = event.match(/^data: (.+)$/m);
    if (!match) return event;
    const parsed = JSON.parse(match[1]);
    if (parsed.type === 'message_delta' && parsed.usage) {
      if (parsed.usage.output_tokens) parsed.usage.output_tokens = Math.max(1, Math.round(parsed.usage.output_tokens * factor));
      if (parsed.usage.input_tokens) parsed.usage.input_tokens = Math.max(1, Math.round(parsed.usage.input_tokens * factor));
      return `event: message_delta\ndata: ${JSON.stringify(parsed)}\n\n`;
    }
    if (parsed.type === 'message_start' && parsed.message?.usage) {
      if (parsed.message.usage.input_tokens) parsed.message.usage.input_tokens = Math.max(1, Math.round(parsed.message.usage.input_tokens * factor));
      if (parsed.message.usage.output_tokens) parsed.message.usage.output_tokens = Math.max(1, Math.round(parsed.message.usage.output_tokens * factor));
      return `event: message_start\ndata: ${JSON.stringify(parsed)}\n\n`;
    }
  } catch {}
  return event;
}

/** Aggiorna il tracciamento ultimo utilizzo e salva su disco (peak) */
function updateLastUsage(
  inputCount: number, outputCount: number,
  resolution: RouteResolution, inflation: number,
): void {
  const total = inputCount + outputCount;
  const prevPeak = (lastContextUsage.peakInputTokens || 0) + (lastContextUsage.peakOutputTokens || 0);
  const totalIsNewPeak = total >= prevPeak;

  lastContextUsage = {
    inputTokens: inputCount,
    outputTokens: outputCount,
    model: resolution.targetModel,
    provider: resolution.provider.name,
    tier: resolution.claudeTier || '',
    inflation,
    // Aggiorna peak SOLO se il totale corrente è maggiore del peak storico
    peakInputTokens: totalIsNewPeak ? inputCount : (lastContextUsage.peakInputTokens || inputCount),
    peakOutputTokens: totalIsNewPeak ? outputCount : (lastContextUsage.peakOutputTokens || outputCount),
  };
  saveLastUsage(lastContextUsage);
}

export { emitAnthropicError, inflateUsageTokens, getInflationFactor };
