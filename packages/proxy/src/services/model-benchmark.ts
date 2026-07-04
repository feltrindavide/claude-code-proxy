/**
 * Model benchmark — standard prompt probe for latency and response quality.
 */

import { getOrCreateAdapter } from '../adapters/index.js';
import { getKey } from './keychain.js';
import { providerService } from './provider.js';
import { upstreamFetch } from './upstream-http.js';
import { estimateOutputTokens } from './token-counter.js';
import type { ClaudeTier } from '../types/index.js';

export const BENCHMARK_PROMPT =
  'You are a benchmark probe. Reply with exactly: BENCHMARK_OK';

export interface BenchmarkRequest {
  providerName: string;
  targetModel: string;
  tier?: ClaudeTier;
}

export interface BenchmarkResult {
  providerName: string;
  targetModel: string;
  tier?: ClaudeTier;
  latencyMs: number;
  statusCode: number;
  success: boolean;
  qualityOk: boolean;
  outputPreview: string;
  outputTokens: number;
  error?: string;
}

export async function runModelBenchmark(req: BenchmarkRequest): Promise<BenchmarkResult> {
  const provider = providerService.getProvider(req.providerName);
  if (!provider) {
    return {
      ...req,
      latencyMs: 0,
      statusCode: 0,
      success: false,
      qualityOk: false,
      outputPreview: '',
      outputTokens: 0,
      error: `Provider not found: ${req.providerName}`,
    };
  }

  const apiKey = await getKey(provider.name);
  if (!apiKey && !provider.baseUrl.includes('localhost')) {
    return {
      ...req,
      latencyMs: 0,
      statusCode: 0,
      success: false,
      qualityOk: false,
      outputPreview: '',
      outputTokens: 0,
      error: `API key not found for provider: ${provider.name}`,
    };
  }

  const providerType = provider.providerType || provider.name;
  const adapter = getOrCreateAdapter(providerType, provider.baseUrl);
  const resolution = {
    provider,
    targetModel: req.targetModel,
    originalModel: req.targetModel,
    claudeTier: req.tier,
  };

  const body = adapter.transformRequest(
    {
      model: req.targetModel,
      max_tokens: 64,
      messages: [{ role: 'user', content: BENCHMARK_PROMPT }],
      stream: false,
    },
    resolution,
  );

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), adapter.timeouts.nonStreaming);

    const response = await upstreamFetch(`${provider.baseUrl}${adapter.apiPath}`, {
      method: 'POST',
      headers: adapter.buildHeaders(apiKey || '', { streaming: false }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const text = await response.text();

    if (!response.ok) {
      return {
        ...req,
        latencyMs,
        statusCode: response.status,
        success: false,
        qualityOk: false,
        outputPreview: text.slice(0, 200),
        outputTokens: 0,
        error: `Upstream returned ${response.status}`,
      };
    }

    const outputPreview = extractTextFromResponse(text);
    const qualityOk = outputPreview.toUpperCase().includes('BENCHMARK_OK');

    return {
      ...req,
      latencyMs,
      statusCode: response.status,
      success: true,
      qualityOk,
      outputPreview: outputPreview.slice(0, 200),
      outputTokens: estimateOutputTokens(outputPreview),
    };
  } catch (error) {
    return {
      ...req,
      latencyMs: Date.now() - start,
      statusCode: 0,
      success: false,
      qualityOk: false,
      outputPreview: '',
      outputTokens: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractTextFromResponse(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      content?: Array<{ type?: string; text?: string }>;
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (Array.isArray(parsed.content)) {
      return parsed.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('');
    }
    if (parsed.choices?.[0]?.message?.content) {
      return parsed.choices[0].message.content;
    }
  } catch {
    // fall through
  }
  return raw;
}
