import { test, expect } from '@playwright/test';
import { ProviderFormPage } from '../pages/ProviderForm';

test.describe('Provider Types', () => {
  const providerTypes = [
    { name: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', type: 'OpenRouter' },
    { name: 'opencode', baseUrl: 'https://api.opencode.ai/v1', type: 'OpenCode' },
    { name: 'ollama', baseUrl: 'http://localhost:11434', type: 'Ollama' },
    { name: 'custom', baseUrl: 'https://api.custom-ai.com/v1', type: 'Custom' },
  ];

  for (const provider of providerTypes) {
    test(`should open form for ${provider.name} provider @smoke`, async ({ page }) => {
      const form = new ProviderFormPage(page);

      // Navigate to providers page
      await page.goto('/providers');

      // Click "Add Provider" to open the modal
      await expect(page.getByRole('button', { name: 'Add Provider' }).first()).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Add Provider' }).first().click();

      // Wait for modal dialog to appear
      await expect(page.getByRole('dialog', { name: 'Add Provider' })).toBeVisible({ timeout: 10000 });

      // Fill provider details
      await form.fillProvider(provider.name, provider.baseUrl, 'test-key', provider.type);

      // Verify fields are filled correctly
      await expect(form.nameInput).toHaveValue(provider.name);
      await expect(form.baseUrlInput).toHaveValue(provider.baseUrl);
    });
  }
});
