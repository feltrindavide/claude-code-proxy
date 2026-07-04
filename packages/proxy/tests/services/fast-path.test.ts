/**
 * Fast-path handler tests
 */

import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { tryFastPath } from '../../src/services/fast-path.js';

function mockResponse(): Response {
  const res = {
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    write: vi.fn(),
    end: vi.fn(),
    json: vi.fn(),
  };
  return res as unknown as Response;
}

describe('tryFastPath', () => {
  it('does not short-circuit streaming request with max_tokens < 10 without suggestion pattern', () => {
    const res = mockResponse();
    const body = {
      model: 'claude-sonnet-4-20250514',
      stream: true,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hello' }],
    };
    const handled = tryFastPath(body, res);
    expect(handled).toBe(false);
  });

  it('short-circuits title generation requests', () => {
    const res = mockResponse();
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 20,
      system: 'Generate a concise title for this conversation',
      messages: [{ role: 'user', content: 'hello' }],
    };
    const handled = tryFastPath(body, res);
    expect(handled).toBe(true);
    expect(res.json).toHaveBeenCalled();
  });

  it('short-circuits suggestion mode with matching system pattern', () => {
    const res = mockResponse();
    const body = {
      model: 'claude-sonnet-4-20250514',
      stream: true,
      max_tokens: 5,
      system: 'Provide tab completion suggest for the prefix',
      messages: [{ role: 'user', content: 'const x = ' }],
    };
    const handled = tryFastPath(body, res);
    expect(handled).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });
});
