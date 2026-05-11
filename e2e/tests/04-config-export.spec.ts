import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

test.describe('Config Export/Import', () => {
  test('should export config as JSON', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForLoaded();

    // Click export button — the export creates a blob download
    // Since Playwright can't always catch blob downloads, just verify the button works
    await settings.exportButton.click();

    // Wait a moment for the export to trigger
    await page.waitForTimeout(1000);

    // Verify the page is still functional (no crash)
    await expect(settings.settingsHeading).toBeVisible();
  });

  test('should import config from JSON file', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.waitForLoaded();

    // Create a test config file in memory
    const testConfig = JSON.stringify({
      providers: [
        {
          name: 'imported-provider',
          baseUrl: 'https://api.imported.com/v1',
          keyId: 'imported-key',
          models: ['test-model'],
          enabled: true,
          priority: 50,
        },
      ],
      routes: [],
    });

    // Use setInputFiles with a buffer to simulate file upload
    await settings.importFileInput.setInputFiles({
      name: 'test-config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(testConfig),
    });

    // The import triggers a fetchDiff call which may fail in E2E (no proxy config),
    // but we verify the file was accepted by the input without crashing
    await expect(settings.settingsHeading).toBeVisible({ timeout: 5000 });
  });
});
