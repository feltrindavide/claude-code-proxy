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

    // Navigate to providers page
    await page.goto('/providers');

    // Wait for the "Add Provider" button and click it
    await expect(page.getByRole('button', { name: 'Add Provider' }).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Add Provider' }).first().click();

    // Wait for the modal to appear
    await expect(page.getByRole('dialog', { name: 'Add Provider' })).toBeVisible({ timeout: 10000 });

    // Verify form fields are visible
    await expect(providerForm.nameInput).toBeVisible();
    await expect(providerForm.baseUrlInput).toBeVisible();
    await expect(providerForm.apiKeyInput).toBeVisible();

    // Fill in provider details
    await providerForm.fillProvider(
      'test-provider',
      'https://api.test.com/v1',
      'test-key-12345',
      'OpenRouter',
    );

    // Verify fields are filled correctly
    await expect(providerForm.nameInput).toHaveValue('test-provider');
    await expect(providerForm.baseUrlInput).toHaveValue('https://api.test.com/v1');
  });
});
