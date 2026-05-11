import { existsSync, rmSync, mkdirSync } from 'fs';

export const TEST_CONFIG_DIR = '/tmp/claude-proxy-e2e-test';

/**
 * Remove test config directory if it exists, then recreate it with secure permissions.
 */
export function cleanTestConfig(): void {
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_CONFIG_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Poll a URL until it returns a 200 response or timeout is reached.
 * Retries every 500ms.
 */
export async function pollHealthEndpoint(url: string, timeout = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.status === 200) {
        return;
      }
    } catch {
      // Server not ready yet — retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Health endpoint ${url} did not respond within ${timeout}ms`);
}

/**
 * Return a test provider configuration with safe (non-real) API keys.
 */
export function getTestProvider(name: string) {
  return {
    name,
    baseUrl: 'https://api.test.com/v1',
    apiKey: 'test-key-12345',
  };
}
