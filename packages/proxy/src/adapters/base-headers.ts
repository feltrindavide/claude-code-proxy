/**
 * Provider-specific upstream request headers.
 */

export interface HeaderOptions {
  streaming: boolean;
  requestId?: string;
}

type AuthStyle = 'anthropic' | 'openrouter' | 'openai' | 'none';

function getAuthStyle(providerType: string): AuthStyle {
  const t = providerType.toLowerCase();
  if (t === 'ollama') return 'none';
  if (t === 'anthropic' || t === 'custom-anthropic') return 'anthropic';
  if (t === 'openrouter') return 'openrouter';
  return 'openai';
}

export function buildProviderHeaders(
  providerType: string,
  apiKey: string,
  opts: HeaderOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  };

  if (opts.streaming) {
    headers['Accept'] = 'text/event-stream';
  }

  if (opts.requestId) {
    headers['X-Request-Id'] = opts.requestId;
  }

  const style = getAuthStyle(providerType);

  switch (style) {
    case 'anthropic':
      if (apiKey) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }
      break;
    case 'openrouter':
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['anthropic-version'] = '2023-06-01';
        headers['HTTP-Referer'] = 'https://github.com/feltrindavide/claude-code-proxy';
        headers['X-Title'] = 'Claude Code Proxy';
      }
      break;
    case 'openai':
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      break;
    case 'none':
      break;
  }

  return headers;
}
