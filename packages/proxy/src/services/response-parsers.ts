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
 * Streaming parser for `<think>...</think>` tags in text content.
 * Some models emit reasoning as `<think>...</think>` inside the content field
 * instead of using structured `reasoning_content`. This parser handles
 * partial tags at chunk boundaries by buffering.
 */
export class ThinkTagParser {
  private buffer = '';
  private inThink = false;
  private readonly openTag = '<think>';
  private readonly closeTag = '</think>';

  get isInThinkMode(): boolean {
    return this.inThink;
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
    const thinkStart = this.buffer.indexOf(this.openTag);
    const orphanClose = this.buffer.indexOf(this.closeTag);

    // Orphan close tag without open
    if (orphanClose !== -1 && (thinkStart === -1 || orphanClose < thinkStart)) {
      const pre = this.buffer.slice(0, orphanClose);
      this.buffer = this.buffer.slice(orphanClose + this.closeTag.length);
      return pre ? { type: 'text', content: pre } : null;
    }

    if (thinkStart === -1) {
      // Check for partial tag at end
      const lastBracket = this.buffer.lastIndexOf('<');
      if (lastBracket !== -1) {
        const potential = this.buffer.slice(lastBracket);
        if (this.openTag.startsWith(potential) || this.closeTag.startsWith(potential)) {
          const emit = this.buffer.slice(0, lastBracket);
          this.buffer = this.buffer.slice(lastBracket);
          return emit ? { type: 'text', content: emit } : null;
        }
      }
      const emit = this.buffer;
      this.buffer = '';
      return emit ? { type: 'text', content: emit } : null;
    }

    // Found <think> tag
    const pre = this.buffer.slice(0, thinkStart);
    this.buffer = this.buffer.slice(thinkStart + this.openTag.length);
    this.inThink = true;
    return pre ? { type: 'text', content: pre } : null;
  }

  private parseInsideThink(): ContentChunk | null {
    const thinkEnd = this.buffer.indexOf(this.closeTag);

    if (thinkEnd === -1) {
      const lastBracket = this.buffer.lastIndexOf('<');
      if (lastBracket !== -1 && this.buffer.length - lastBracket < this.closeTag.length) {
        const potential = this.buffer.slice(lastBracket);
        if (this.closeTag.startsWith(potential)) {
          const emit = this.buffer.slice(0, lastBracket);
          this.buffer = this.buffer.slice(lastBracket);
          return emit ? { type: 'thinking', content: emit } : null;
        }
      }
      const emit = this.buffer;
      this.buffer = '';
      return emit ? { type: 'thinking', content: emit } : null;
    }

    const thinking = this.buffer.slice(0, thinkEnd);
    this.buffer = this.buffer.slice(thinkEnd + this.closeTag.length);
    this.inThink = false;
    return thinking ? { type: 'thinking', content: thinking } : null;
  }
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
