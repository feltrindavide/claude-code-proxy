import { test, expect } from '@playwright/test';
import { ProviderFormPage } from '../pages/ProviderForm';
import { StatusPagePage } from '../pages/StatusPage';
import { RoutingLogPage } from '../pages/RoutingLogPage';

test.describe('Edge Cases', () => {
  test('should handle provider unavailable', async ({ page }) => {
    const form = new ProviderFormPage(page);

    // Navigate to providers page
    await page.goto('/providers');

    // Click "Add Provider" to open the modal
    await expect(page.getByRole('button', { name: 'Add Provider' }).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Add Provider' }).first().click();

    // Wait for modal
    await expect(page.getByRole('dialog', { name: 'Add Provider' })).toBeVisible({ timeout: 10000 });

    // Configure provider with invalid URL
    await form.fillProvider(
      'invalid-provider',
      'https://invalid-provider-12345.com/v1',
      'test-key-12345',
      'Custom',
    );

    // Attempt to test connection — should show an error
    await form.testConnection();

    // Verify error toast is visible
    const errorText = page.getByText(/unable to connect|failed|error/i);
    await expect(errorText.first()).toBeVisible({ timeout: 15_000 });
  });

  test('should display status page when proxy is running', async ({ page }) => {
    const statusPage = new StatusPagePage(page);

    // Navigate to status page
    await statusPage.goto();
    await statusPage.waitForStatusReady();

    // Verify status heading is visible
    await expect(statusPage.statusHeading).toBeVisible();
  });

  test('should show routing log page', async ({ page }) => {
    const logPage = new RoutingLogPage(page);

    // Navigate to routing log page
    await logPage.goto();
    await logPage.waitForLoaded();

    // Verify heading is visible
    await expect(logPage.logHeading).toBeVisible();
  });
});
