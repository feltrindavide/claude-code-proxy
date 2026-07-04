/**
 * NVIDIA NIM adapter — OpenAI-compatible hosted or self-hosted NIM endpoints
 *
 * Hosted: https://integrate.api.nvidia.com (+ /v1/chat/completions)
 * Self-hosted: user-configured base URL pointing at a NIM container
 *
 * NVIDIA requires max_tokens on chat completion requests for many models.
 */

import type {
  AnthropicMessagesBody,
  ValidationResult,
} from './interface.js';
import type { RouteResolution } from '../types/index.js';
import { OpenCodeAdapter } from './opencode.js';
import { upstreamFetch } from '../services/upstream-http.js';
import { joinProviderUrl } from '../services/provider-url.js';

const DEFAULT_MAX_TOKENS = 8192;

export class NvidiaNimAdapter extends OpenCodeAdapter {
  readonly providerType = 'nvidia-nim';

  transformRequest(
    body: AnthropicMessagesBody,
    route: RouteResolution,
  ): Record<string, unknown> {
    const result = super.transformRequest(body, route);
    if (result.max_tokens === undefined || (result.max_tokens as number) <= 0) {
      result.max_tokens = DEFAULT_MAX_TOKENS;
    }
    return result;
  }

  async validate(baseUrl: string, apiKey: string): Promise<ValidationResult> {
    try {
      const resp = await upstreamFetch(joinProviderUrl(baseUrl, '/v1/models'), {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as {
          data?: Array<{
            id: string;
            context_length?: number;
            max_model_len?: number;
          }>;
        };
        const models = data.data?.map((m) => m.id) ?? [];
        const modelContexts: Record<string, { context: number; max_output: number }> = {};
        for (const m of data.data ?? []) {
          const context = m.context_length ?? m.max_model_len;
          if (context) {
            modelContexts[m.id] = { context, max_output: Math.min(context, 131_072) };
          }
        }
        return {
          valid: true,
          models,
          modelContexts: Object.keys(modelContexts).length > 0 ? modelContexts : undefined,
        };
      }

      // Some self-hosted NIM builds omit /v1/models — probe chat completions instead
      const probe = await upstreamFetch(joinProviderUrl(baseUrl, '/v1/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'meta/llama-3.1-8b-instruct',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (probe.ok || probe.status === 400 || probe.status === 404) {
        return { valid: true };
      }

      return { valid: false, error: `NVIDIA NIM validation failed: ${resp.status}` };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
