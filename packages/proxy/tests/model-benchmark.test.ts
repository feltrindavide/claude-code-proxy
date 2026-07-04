import { describe, it, expect } from 'vitest';
import { BENCHMARK_PROMPT } from '../src/services/model-benchmark.js';

// Re-export helper for testing via duplicate inline (extractTextFromResponse is not exported)
function extractText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      content?: Array<{ type?: string; text?: string }>;
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (Array.isArray(parsed.content)) {
      return parsed.content.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
    }
    if (parsed.choices?.[0]?.message?.content) return parsed.choices[0].message.content;
  } catch {}
  return raw;
}

describe('model-benchmark', () => {
  it('uses standard benchmark prompt', () => {
    expect(BENCHMARK_PROMPT).toContain('BENCHMARK_OK');
  });

  it('extracts anthropic text content', () => {
    const raw = JSON.stringify({
      content: [{ type: 'text', text: 'BENCHMARK_OK' }],
    });
    expect(extractText(raw)).toBe('BENCHMARK_OK');
  });

  it('extracts openai choices content', () => {
    const raw = JSON.stringify({
      choices: [{ message: { content: 'BENCHMARK_OK done' } }],
    });
    expect(extractText(raw)).toContain('BENCHMARK_OK');
  });
});
