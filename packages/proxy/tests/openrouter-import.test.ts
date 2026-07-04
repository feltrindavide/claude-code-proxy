import { describe, it, expect } from 'vitest';
import { inferCostTier } from '../src/services/smart-router.js';

describe('openrouter-import helpers', () => {
  it('classifies free models for import filter', () => {
    expect(inferCostTier('nvidia/foo:free')).toBe('free');
    expect(inferCostTier('openai/some-model')).toBe('standard');
  });
});
