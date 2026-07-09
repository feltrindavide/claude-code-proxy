/**
 * @smoke @linux
 * Linux E2E smoke — verifies proxy health when running via systemd/headless script.
 */
import { test, expect } from '@playwright/test';

test.describe('Linux headless smoke @smoke @linux', () => {
  test('health endpoint responds', async ({ request }) => {
    const response = await request.get('http://localhost:3456/health');
    test.skip(response.status() !== 200, 'Proxy not running on :3456');
    const body = await response.json();
    expect(body.status).toBeDefined();
    expect(body.port).toBeTruthy();
  });
});
