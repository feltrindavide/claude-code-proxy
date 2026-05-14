/**
 * Streaming response parsers for edge cases:
 * - ThinkTagParser: detects `<think>...</think>` tags in streamed text
 * - HeuristicToolParser: detects text-emitted tool calls (● <function=...>)
 *
 * Phase: 02-sse-streaming-integration (edge case handling)
 */

// ---------------------------------------------------------------------------
// ThinkTagParser — streaming <think> tag detector
// ---------------------------------------------------------------------------

export type ContentType = 'text' | 'thinking';

export interface ContentChunk {
  type: ContentType;
  content: string;
}

/**
 * Streaming parser for `<think>...</think>` and `<reasoning_content>...</reasoning_content>` tags.
 * Some models emit reasoning as HTML-like tags inside the content field
 * instead of using structured `reasoning_content`. This parser handles
 * partial tags at chunk boundaries by buffering.
 */
export class ThinkTagParser {
  private buffer = '';
  private inThink = false;
  // Support both <think> and <reasoning_content> tags
  private readonly openTags = ['<think>', '<reasoning_content>'];
  private readonly closeTags = ['</think>', '</reasoning_content>'];

  get isInThinkMode(): boolean {
    return this.inThink;
  }

  /** Trova il primo open tag nella stringa */
  private findOpenTag(buf: string): { tag: string; index: number } | null {
    let earliest: { tag: string; index: number } | null = null;
    for (const tag of this.openTags) {
      const idx = buf.indexOf(tag);
      if (idx !== -1 && (!earliest || idx < earliest.index)) {
        earliest = { tag, index: idx };
      }
    }
    return earliest;
  }

  /** Trova il primo close tag nella stringa */
  private findCloseTag(buf: string): { tag: string; index: number } | null {
    let earliest: { tag: string; index: number } | null = null;
    for (const tag of this.closeTags) {
      const idx = buf.indexOf(tag);
      if (idx !== -1 && (!earliest || idx < earliest.index)) {
        earliest = { tag, index: idx };
      }
    }
    return earliest;
  }

  /** Determina se buf inizia con uno dei tag (per partial match) */
  private startsWithAnyTag(buf: string, tags: string[]): boolean {
    return tags.some(t => t.startsWith(buf));
  }

  feed(content: string): ContentChunk[] {
    this.buffer += content;
    const chunks: ContentChunk[] = [];

    while (this.buffer.length > 0) {
      const prevLen = this.buffer.length;

      if (!this.inThink) {
        const chunk = this.parseOutsideThink();
        if (chunk) chunks.push(chunk);
      } else {
        const chunk = this.parseInsideThink();
        if (chunk) chunks.push(chunk);
      }

      if (this.buffer.length === prevLen) break; // No progress, wait for more data
    }

    return chunks;
  }

  flush(): ContentChunk | null {
    if (!this.buffer) return null;
    const type = this.inThink ? 'thinking' as ContentType : 'text' as ContentType;
    const content = this.buffer;
    this.buffer = '';
    return { type, content };
  }

  private parseOutsideThink(): ContentChunk | null {
    const open = this.findOpenTag(this.buffer);
    const orphanClose = this.findCloseTag(this.buffer);

    // Orphan close tag without open
    if (orphanClose && (!open || orphanClose.index < open.index)) {
      const pre = this.buffer.slice(0, orphanClose.index);
      this.buffer = this.buffer.slice(orphanClose.index + orphanClose.tag.length);
      return pre ? { type: 'text', content: pre } : null;
    }

    if (!open) {
      // Check for partial tag at end
      const lastBracket = this.buffer.lastIndexOf('<');
      if (lastBracket !== -1) {
        const potential = this.buffer.slice(lastBracket);
        if (this.startsWithAnyTag(potential, [...this.openTags, ...this.closeTags])) {
          const emit = this.buffer.slice(0, lastBracket);
          this.buffer = this.buffer.slice(lastBracket);
          return emit ? { type: 'text', content: emit } : null;
        }
      }
      const emit = this.buffer;
      this.buffer = '';
      return emit ? { type: 'text', content: emit } : null;
    }

    // Found open tag (think or reasoning_content)
    const pre = this.buffer.slice(0, open.index);
    this.buffer = this.buffer.slice(open.index + open.tag.length);
    this.inThink = true;
    return pre ? { type: 'text', content: pre } : null;
  }

  private parseInsideThink(): ContentChunk | null {
    const close = this.findCloseTag(this.buffer);

    if (!close) {
      const lastBracket = this.buffer.lastIndexOf('<');
      if (lastBracket !== -1) {
        const potential = this.buffer.slice(lastBracket);
        if (this.startsWithAnyTag(potential, this.closeTags)) {
          const emit = this.buffer.slice(0, lastBracket);
          this.buffer = this.buffer.slice(lastBracket);
          return emit ? { type: 'thinking', content: emit } : null;
        }
      }
      const emit = this.buffer;
      this.buffer = '';
      return emit ? { type: 'thinking', content: emit } : null;
    }

    const thinking = this.buffer.slice(0, close.index);
    this.buffer = this.buffer.slice(close.index + close.tag.length);
    this.inThink = false;
    return thinking ? { type: 'thinking', content: thinking } : null;
  }
}

// ---------------------------------------------------------------------------
// ToolArgumentsParser — riparazione JSON malformati nelle tool call
// ---------------------------------------------------------------------------

/**
 * Tenta di riparare JSON malformato nei parametri delle tool call.
 * Strategy cascade: JSON.parse → regex repair → empty fallback.
 * Non richiede dipendenze esterne (a differenza di jsonrepair/json5).
 */
export function parseToolArguments(argsString: string): string {
  if (!argsString || argsString.trim() === '' || argsString === '{}') {
    return '{}';
  }

  // Attempt 1: Standard JSON
  try {
    JSON.parse(argsString);
    return argsString;
  } catch {
    // Prossimo tentativo
  }

  // Attempt 2: Repair common issues
  try {
    const repaired = argsString
      // Unescape already-escaped quotes
      .replace(/\\"/g, '"')
      // Replace single quotes with double quotes (but not inside strings)
      .replace(/'/g, '"')
      // Add quotes to unquoted keys (word: before colons)
      .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
      // Remove trailing commas before } and ]
      .replace(/,(\s*[}\]])/g, '$1')
      // Remove trailing commas at end
      .replace(/,\s*$/, '')
      // Replace undefined/null unquoted with null
      .replace(/\bundefined\b/g, 'null')
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false');

    JSON.parse(repaired);
    return repaired;
  } catch {
    // Attempt 3: Extract any valid JSON object from the string
    try {
      const objMatch = argsString.match(/\{.*\}/s);
      if (objMatch) {
        JSON.parse(objMatch[0]);
        return objMatch[0];
      }
    } catch {
      // Fallback
    }
  }

  return '{}';
}

// ---------------------------------------------------------------------------
// HeuristicToolParser — text-emitted tool call detector
// ---------------------------------------------------------------------------

export interface HeuristicToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Stateful parser for raw text tool calls.
 * Some models emit tool calls as text patterns like
 * `● <function=name> <parameter=key>value</parameter>` instead of
 * using structured `tool_calls` chunks.
 */
export class HeuristicToolParser {
  private buffer = '';
  private inFunction = false;
  private currentName = '';
  private currentParams: Record<string, string> = {};
  private currentKey = '';
  private currentValue = '';

  private readonly funcStartPattern = /●\s*<function=([^>]+)>/;
  private readonly paramStartPattern = /<parameter=([^>]+)>/;
  private readonly paramEndPattern = /<\/parameter>/;

  feed(content: string): { cleanText: string; tools: HeuristicToolCall[] } {
    this.buffer += content;
    const tools: HeuristicToolCall[] = [];
    let cleanText = '';

    while (this.buffer.length > 0) {
      const prevLen = this.buffer.length;

      if (!this.inFunction) {
        const match = this.buffer.match(this.funcStartPattern);
        if (match) {
          // Emit text before function call as clean text
          cleanText += this.buffer.slice(0, match.index);
          this.buffer = this.buffer.slice(match.index! + match[0].length);
          this.inFunction = true;
          this.currentName = match[1];
          this.currentParams = {};
          this.currentKey = '';
          this.currentValue = '';
        } else {
          // No function found, emit rest as text (but buffer partial patterns)
          cleanText += this.buffer;
          this.buffer = '';
        }
      } else {
        // Inside a function call, look for parameters
        const paramMatch = this.buffer.match(this.paramStartPattern);
        const endMatch = this.buffer.match(this.paramEndPattern);

        if (endMatch && (!paramMatch || endMatch.index! < paramMatch.index!)) {
          // End of parameter
          if (this.currentKey) {
            this.currentParams[this.currentKey] = this.currentValue;
            this.currentKey = '';
            this.currentValue = '';
          }
          this.buffer = this.buffer.slice(endMatch.index! + endMatch[0].length);
        } else if (paramMatch) {
          // Save previous parameter if any
          if (this.currentKey) {
            this.currentParams[this.currentKey] = this.currentValue;
          }
          this.currentKey = paramMatch[1];
          this.currentValue = '';
          this.buffer = this.buffer.slice(paramMatch.index! + paramMatch[0].length);
        } else {
          // Accumulate value text
          this.currentValue += this.buffer;
          this.buffer = '';
        }

        // Check if function is complete (no more parameter tags in buffer)
        if (!this.buffer.includes('<parameter=') && !this.buffer.includes('</parameter>')) {
          if (this.currentKey) {
            this.currentParams[this.currentKey] = this.currentValue;
          }
          tools.push({
            id: `toolu_${Date.now().toString(36)}`,
            name: this.currentName,
            input: Object.fromEntries(
              Object.entries(this.currentParams).map(([k, v]) => [k, v])
            ),
          });
          this.inFunction = false;
        }
      }

      if (this.buffer.length === prevLen) break;
    }

    return { cleanText, tools };
  }

  flush(): { cleanText: string; tools: HeuristicToolCall[] } {
    const result: HeuristicToolCall[] = [];
    let text = this.buffer;

    // If we were in a function, emit whatever we have
    if (this.inFunction && this.currentName) {
      if (this.currentKey) {
        this.currentParams[this.currentKey] = this.currentValue;
      }
      result.push({
        id: `toolu_${Date.now().toString(36)}`,
        name: this.currentName,
        input: Object.fromEntries(
          Object.entries(this.currentParams).map(([k, v]) => [k, v])
        ),
      });
      text = '';
    }

    this.buffer = '';
    this.inFunction = false;
    return { cleanText: text, tools: result };
  }
}
