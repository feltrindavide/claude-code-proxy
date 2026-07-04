/**
 * Join provider base URL with API path, avoiding duplicate /v1 segments.
 *
 * Examples:
 * - https://integrate.api.nvidia.com/v1 + /v1/chat/completions
 *   → https://integrate.api.nvidia.com/v1/chat/completions
 * - https://integrate.api.nvidia.com + /v1/chat/completions
 *   → https://integrate.api.nvidia.com/v1/chat/completions
 */
export function joinProviderUrl(baseUrl: string, apiPath: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;

  if (base.endsWith('/v1') && path.startsWith('/v1/')) {
    return `${base}${path.slice(3)}`;
  }

  if (base.endsWith('/v1') && path === '/v1') {
    return base;
  }

  return `${base}${path}`;
}
