/**
 * Token counter — tiktoken cl100k_base with warm encoder and LRU cache.
 */

import crypto from 'crypto';
import { get_encoding, Tiktoken } from 'tiktoken';

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = get_encoding('cl100k_base');
  }
  return encoder;
}

// ---------------------------------------------------------------------------
// Types
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

export interface TokenCount {
  messages: number;
  system: number;
  tools: number;
  total: number;
}

// ---------------------------------------------------------------------------
// LRU cache (max 200)
// ---------------------------------------------------------------------------

const CACHE_MAX = 200;
const tokenCache = new Map<string, TokenCount>();

function cacheGet(key: string): TokenCount | undefined {
  const v = tokenCache.get(key);
  if (!v) return undefined;
  tokenCache.delete(key);
  tokenCache.set(key, v);
  return v;
}

function cacheSet(key: string, value: TokenCount): void {
  if (tokenCache.has(key)) tokenCache.delete(key);
  tokenCache.set(key, value);
  while (tokenCache.size > CACHE_MAX) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
}

function canonicalizeMessages(messages: MessageLike[]): unknown[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

function canonicalizeSystem(system?: string | ContentBlock[] | null): string | null {
  if (!system) return null;
  if (typeof system === 'string') return system.length > 0 ? system : null;
  const text = system
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n');
  return text.length > 0 ? text : null;
}

function buildCacheKey(
  messages: MessageLike[],
  system?: string | ContentBlock[] | null,
  tools?: ToolLike[] | null,
): string {
  const payload = {
    messages: canonicalizeMessages(messages || []),
    system: canonicalizeSystem(system),
    tools: tools || null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// ---------------------------------------------------------------------------
// Counting
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
          for (const item of c as ContentBlock[]) {
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

function countRequestTokensUncached(
  messages: MessageLike[],
  system?: string | ContentBlock[] | null,
  tools?: ToolLike[] | null,
): TokenCount {
  const enc = getEncoder();
  const msgTokens = Array.isArray(messages)
    ? messages.reduce((sum, m) => sum + countContent(m.content, enc), 0)
    : 0;
  const msgOverhead = Array.isArray(messages) ? messages.length * 3 : 0;
  const sysTokens = system ? countContent(system, enc) : 0;
  const toolTokens = tools ? countTools(tools, enc) : 0;

  return {
    messages: msgTokens,
    system: sysTokens,
    tools: toolTokens,
    total: msgTokens + msgOverhead + sysTokens + toolTokens,
  };
}

/**
 * Count request tokens with LRU cache for repeated identical payloads.
 */
export function countRequestTokens(
  messages: MessageLike[],
  system?: string | ContentBlock[] | null,
  tools?: ToolLike[] | null,
): TokenCount {
  const key = buildCacheKey(messages, system, tools);
  const cached = cacheGet(key);
  if (cached) return cached;

  const result = countRequestTokensUncached(messages, system, tools);
  cacheSet(key, result);
  return result;
}

/** Alias for explicit cache usage. */
export const countRequestTokensCached = countRequestTokens;

export function countTextTokens(text: string): number {
  if (!text) return 0;
  return getEncoder().encode(text).length;
}

export function estimateOutputTokens(contentText: string): number {
  if (!contentText) return 1;
  try {
    return Math.max(1, countTextTokens(contentText));
  } catch {
    return Math.max(1, Math.round(contentText.length / 4));
  }
}
