import { TEST_CONFIG_DIR, cleanTestConfig, pollHealthEndpoint } from './utils/test-helpers';
import { rmSync } from 'fs';

/**
 * Global setup: configure isolated test config directory and wait for proxy readiness.
 */
export default async function globalSetup() {
  // Set test config path to isolated directory
  process.env.CONFIG_DIR = TEST_CONFIG_DIR;

  // Clean and recreate test config directory
  cleanTestConfig();

  // Poll health endpoint until the Express proxy is ready
  const healthUrl = 'http://localhost:3456/health';
  console.log(`[globalSetup] Waiting for proxy health endpoint: ${healthUrl}`);
  await pollHealthEndpoint(healthUrl);
  console.log('[globalSetup] Proxy is ready');
}

/**
 * Global teardown: remove test config directory and log cleanup.
 */
export default async function globalTeardown() {
  if (TEST_CONFIG_DIR) {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    console.log(`[globalTeardown] Cleaned up test config directory: ${TEST_CONFIG_DIR}`);
  }
}
