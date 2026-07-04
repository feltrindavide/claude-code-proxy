import { describe, it, expect } from 'vitest';
import { joinProviderUrl } from '../src/services/provider-url.js';

describe('joinProviderUrl', () => {
  it('avoids duplicate /v1 when base URL already includes it', () => {
    expect(
      joinProviderUrl('https://integrate.api.nvidia.com/v1', '/v1/chat/completions'),
    ).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(
      joinProviderUrl('https://integrate.api.nvidia.com/v1/', '/v1/models'),
    ).toBe('https://integrate.api.nvidia.com/v1/models');
  });

  it('keeps /v1 in path when base URL does not include it', () => {
    expect(
      joinProviderUrl('https://integrate.api.nvidia.com', '/v1/chat/completions'),
    ).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
  });
});
