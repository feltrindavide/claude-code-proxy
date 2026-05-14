/**
 * Token counter — utilizza tiktoken per conteggio accurato dei token
 * Invece della stima chars/4, usa l'encoding cl100k_base (stesso di Claude/GPT).
 *
 * Il conteggio è lazy: il primo encode carica l'encoder WASM.
 * FREE sempre dopo l'uso per evitare memory leak WASM.
 */

import { get_encoding, Tiktoken } from 'tiktoken';

// Cache per evitare di ricaricare l'encoder a ogni richiesta
let encoder: Tiktoken | null = null;
let encoderRefCount = 0;

function acquireEncoder(): Tiktoken {
  if (!encoder) {
    encoder = get_encoding('cl100k_base');
  }
  encoderRefCount++;
  return encoder;
}

function releaseEncoder(): void {
  encoderRefCount--;
  if (encoderRefCount <= 0 && encoder) {
    try { encoder.free(); } catch {}
    encoder = null;
    encoderRefCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Tipi Anthropic (stessa shape di AnthropicMessagesBody)
// ---------------------------------------------------------------------------

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  [key: string]: unknown;
}

interface MessageLike {
  role: string;
  content: string | ContentBlock[];
}

interface ToolLike {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Conteggio
// ---------------------------------------------------------------------------

function countText(text: string, enc: Tiktoken): number {
  if (!text) return 0;
  return enc.encode(text).length;
}

function countContent(content: string | ContentBlock[], enc: Tiktoken): number {
  if (typeof content === 'string') {
    return countText(content, enc);
  }
  if (Array.isArray(content)) {
    let total = 0;
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        total += countText(block.text, enc);
      } else if (block.type === 'thinking' && block.thinking) {
        total += countText(block.thinking, enc);
      } else if (block.type === 'tool_use') {
        total += countText(JSON.stringify(block.input || {}), enc);
      } else if (block.type === 'tool_result') {
        const c = block.content;
        if (typeof c === 'string') {
          total += countText(c, enc);
        } else if (Array.isArray(c)) {
          for (const item of c as any[]) {
            if (item?.type === 'text' && item.text) total += countText(item.text, enc);
          }
        }
      }
    }
    return total;
  }
  return 0;
}

function countTools(tools: ToolLike[], enc: Tiktoken): number {
  if (!tools || !Array.isArray(tools)) return 0;
  let total = 0;
  for (const t of tools) {
    total += countText(t.name, enc);
    if (t.description) total += countText(t.description, enc);
    if (t.input_schema) total += countText(JSON.stringify(t.input_schema), enc);
  }
  return total;
}

// ---------------------------------------------------------------------------
// API pubblica
// ---------------------------------------------------------------------------

export interface TokenCount {
  messages: number;
  system: number;
  tools: number;
  total: number;
}

/**
 * Conta i token di una richiesta completa.
 * Include overhead per-messaggio (~3 token per messaggio come da specifica OpenAI).
 */
export function countRequestTokens(
  messages: MessageLike[],
  system?: string | ContentBlock[] | null,
  tools?: ToolLike[] | null,
): TokenCount {
  const enc = acquireEncoder();
  try {
    const msgTokens = Array.isArray(messages)
      ? messages.reduce((sum, m) => sum + countContent(m.content, enc), 0)
      : 0;

    // Overhead: ~3 token per messaggio per i meta (role, stop, etc.)
    const msgOverhead = Array.isArray(messages) ? messages.length * 3 : 0;

    const sysTokens = system
      ? countContent(system, enc)
      : 0;

    const toolTokens = tools ? countTools(tools, enc) : 0;

    return {
      messages: msgTokens,
      system: sysTokens,
      tools: toolTokens,
      total: msgTokens + msgOverhead + sysTokens + toolTokens,
    };
  } finally {
    releaseEncoder();
  }
}

/**
 * Versione semplice: conta una stringa di testo.
 */
export function countTextTokens(text: string): number {
  if (!text) return 0;
  const enc = acquireEncoder();
  try {
    return enc.encode(text).length;
  } finally {
    releaseEncoder();
  }
}

/**
 * Stima output tokens da una stringa di contenuto.
 * Usa tiktoken invece di chars/4 per maggiore precisione.
 */
export function estimateOutputTokens(contentText: string): number {
  if (!contentText) return 1;
  try {
    const tokens = countTextTokens(contentText);
    return Math.max(1, tokens);
  } catch {
    // Fallback chars/4
    return Math.max(1, Math.round(contentText.length / 4));
  }
}
