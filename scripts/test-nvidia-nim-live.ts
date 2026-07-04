#!/usr/bin/env npx tsx
/**
 * Live smoke test for NVIDIA NIM adapter.
 * Usage: NVIDIA_API_KEY=nvapi-... npx tsx scripts/test-nvidia-nim-live.ts
 */
import { NvidiaNimAdapter } from '../packages/proxy/src/adapters/nvidia-nim.js';
import { joinProviderUrl } from '../packages/proxy/src/services/provider-url.js';
import { upstreamFetch } from '../packages/proxy/src/services/upstream-http.js';

const BASE_URL = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const MODEL = process.env.NVIDIA_NIM_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
const API_KEY = process.env.NVIDIA_API_KEY || process.env.NVAPI_KEY || '';

async function main() {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Model: ${MODEL}`);

  const adapter = new NvidiaNimAdapter();
  const chatUrl = joinProviderUrl(BASE_URL, adapter.apiPath);
  console.log(`Chat URL: ${chatUrl}`);

  if (!API_KEY) {
    console.error('Set NVIDIA_API_KEY (or NVAPI_KEY) to run the live chat test.');
    process.exit(1);
  }

  const validation = await adapter.validate(BASE_URL, API_KEY);
  if (!validation.valid) {
    console.error('Validation failed:', validation.error);
    process.exit(1);
  }
  console.log(`Validation OK (${validation.models?.length ?? 0} models)`);
  if (!validation.models?.includes(MODEL)) {
    console.warn(`Warning: ${MODEL} not in model list (may still work)`);
  }

  const body = adapter.transformRequest(
    {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'Reply with exactly: NIM_OK' }],
      max_tokens: 32,
    },
    {
      provider: {
        name: 'nvidia-nim',
        baseUrl: BASE_URL,
        keyId: 'nvidia-nim',
        models: [],
        enabled: true,
        priority: 1,
        providerType: 'nvidia-nim',
      },
      targetModel: MODEL,
      originalModel: 'claude-sonnet-4-20250514',
    },
  );

  const response = await upstreamFetch(chatUrl, {
    method: 'POST',
    headers: adapter.buildHeaders(API_KEY, { streaming: false }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`Chat failed HTTP ${response.status}:`, text.slice(0, 500));
    process.exit(1);
  }

  let preview = text;
  try {
    const json = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    preview = json.choices?.[0]?.message?.content || text;
  } catch {
    // non-json response
  }

  console.log('Chat OK');
  console.log('Response preview:', preview.slice(0, 200));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
