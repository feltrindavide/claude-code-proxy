/**
 * Fast-path handlers — short-circuit the proxy for trivially-answerable requests.
 *
 * Each handler inspects the request body and decides if it can respond
 * immediately without calling an upstream provider. Handlers use conservative
 * heuristics to avoid false positives.
 *
 * This is an additive layer: if no handler matches, the request falls through
 * to the existing proxy pipeline unchanged.
 */

import crypto from 'crypto';
import type { Response } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FastPathHandler {
  name: string;
  canHandle(body: Record<string, unknown>): boolean;
  handle(body: Record<string, unknown>, res: Response): void;
}

// ---------------------------------------------------------------------------
// Helper: build a minimal valid Anthropic SSE response sequence
// ---------------------------------------------------------------------------

function minimalSSEResponse(model: string, text: string): string[] {
  const id = `msg_fp_${crypto.randomUUID().slice(0, 8)}`;
  const toks = Math.max(1, Math.round(text.length / 4));

  return [
    `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id, type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { input_tokens: 1, output_tokens: toks } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ];
}

function minimalJSONResponse(model: string, text: string): object {
  return {
    id: `msg_fp_${crypto.randomUUID().slice(0, 8)}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: Math.max(1, Math.round(text.length / 4)) },
  };
}

// ---------------------------------------------------------------------------
// Helper: extract system prompt as string
// ---------------------------------------------------------------------------

function extractSystemString(body: Record<string, unknown>): string {
  const system = body.system;
  if (!system) return '';
  if (typeof system === 'string') return system.toLowerCase();
  if (Array.isArray(system)) {
    return system.map((b: { text?: string }) => b.text || '').join(' ').toLowerCase();
  }
  return '';
}

const SUGGESTION_PATTERNS = [
  'suggest',
  'autocomplete',
  'prefix',
  'tab completion',
  'inline completion',
];

// ---------------------------------------------------------------------------
// Handler: TitleGeneration
// Claude Code sends a title-generation request at session start.
// Pattern: system contains "generate a concise title" + max_tokens < 50
// ---------------------------------------------------------------------------

const titleGenerationHandler: FastPathHandler = {
  name: 'TitleGeneration',

  canHandle(body: Record<string, unknown>): boolean {
    // max_tokens must be small (title gen uses ~20)
    const maxTokens = body.max_tokens as number | undefined;
    if (maxTokens === undefined || maxTokens > 50) return false;

    // tools should be absent (title gen has no tool use)
    if (body.tools !== undefined) return false;

    // Check system prompt for title-generation patterns
    const system = body.system;
    if (!system) return false;

    const sysStr = typeof system === 'string'
      ? system.toLowerCase()
      : Array.isArray(system)
        ? system.map((b: any) => b.text || '').join(' ').toLowerCase()
        : '';

    const patterns = [
      'generate a concise title',
      'generate a title',
      '1-2 word title',
      '1-2 words title',
      'generate a very short title',
    ];

    return patterns.some(p => sysStr.includes(p));
  },

  handle(body: Record<string, unknown>, res: Response): void {
    const model = (body.model as string) || 'claude-opus-4-20250514';
    const wantsStream = body.stream === true;

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      for (const event of minimalSSEResponse(model, '')) {
        res.write(event);
      }
      res.end();
    } else {
      res.json(minimalJSONResponse(model, ''));
    }
  },
};

// ---------------------------------------------------------------------------
// Handler: SuggestionMode
// Claude Code uses suggestion/prefix completion for Tab autocomplete.
// Pattern: max_tokens < 10 + stream: true + no tools
// ---------------------------------------------------------------------------

const suggestionModeHandler: FastPathHandler = {
  name: 'SuggestionMode',

  canHandle(body: Record<string, unknown>): boolean {
    const maxTokens = body.max_tokens as number | undefined;
    if (maxTokens === undefined || maxTokens >= 10) return false;
    if (body.stream !== true) return false;
    if (body.tools !== undefined) return false;

    const sysStr = extractSystemString(body);
    const hasSuggestionPattern = SUGGESTION_PATTERNS.some((p) => sysStr.includes(p));
    if (!hasSuggestionPattern) return false;

    return true;
  },

  handle(body: Record<string, unknown>, res: Response): void {
    const model = (body.model as string) || 'claude-opus-4-20250514';
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    for (const event of minimalSSEResponse(model, '')) {
      res.write(event);
    }
    res.end();
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const handlers: FastPathHandler[] = [
  titleGenerationHandler,
  suggestionModeHandler,
];

/**
 * Try all registered fast-path handlers in order.
 * Returns true if a handler matched and wrote a response.
 */
export function tryFastPath(body: Record<string, unknown>, res: Response): boolean {
  for (const handler of handlers) {
    if (handler.canHandle(body)) {
      console.log(`[FastPath] ${handler.name} — short-circuit`);
      handler.handle(body, res);
      return true;
    }
  }
  return false;
}
