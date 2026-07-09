import { test, expect } from '@playwright/test';
import { StatusPagePage } from '../pages/StatusPage';
import { ProviderFormPage } from '../pages/ProviderForm';

test.describe('Happy Path', () => {
  test('full flow: navigate → verify status page loads @smoke', async ({ page }) => {
    const statusPage = new StatusPagePage(page);
    await statusPage.goto();
    await statusPage.waitForStatusReady();

    // Verify the page URL is the root
    await expect(page).toHaveURL(/\/$/);
    // Verify status heading is visible (Running/Stopped/Error)
    await expect(statusPage.statusHeading).toBeVisible();
  });

  test('open provider form → fill and submit @smoke', async ({ page }) => {
    const providerForm = new ProviderFormPage(page);
    const providerName = `e2e-provider-${Date.now()}`;

    await page.goto('/providers');

    await expect(page.getByRole('button', { name: 'Add Provider' }).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Add Provider' }).first().click();

    await expect(page.getByRole('dialog', { name: 'Add Provider' })).toBeVisible({ timeout: 10000 });

    await expect(providerForm.nameInput).toBeVisible();
    await expect(providerForm.baseUrlInput).toBeVisible();
    await expect(providerForm.apiKeyInput).toBeVisible();

    await providerForm.fillProvider(
      providerName,
      'https://api.test.com/v1',
      'test-key-12345',
      'OpenRouter',
    );

    await expect(providerForm.nameInput).toHaveValue(providerName);
    await expect(providerForm.baseUrlInput).toHaveValue('https://api.test.com/v1');

    await providerForm.save();

    await expect(page.getByText('Provider saved successfully')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(providerName)).toBeVisible({ timeout: 15000 });
  });
});
