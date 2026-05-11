import { expect, type Locator, type Page } from '@playwright/test';

export class ProviderFormPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly baseUrlInput: Locator;
  readonly apiKeyInput: Locator;
  readonly providerTypeSelect: Locator;
  readonly testButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Input component doesn't link label to input, so use placeholders
    this.nameInput = page.getByPlaceholder('e.g., openrouter');
    this.baseUrlInput = page.getByPlaceholder('e.g., https://openrouter.ai/api/v1');
    this.apiKeyInput = page.getByPlaceholder('Enter your API key');
    this.providerTypeSelect = page.getByRole('combobox');
    this.testButton = page.getByRole('button', { name: 'Test Connection' });
    this.saveButton = page.getByRole('button', { name: 'Save Provider' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
  }

  async fillProvider(name: string, baseUrl: string, apiKey: string, type?: string) {
    await this.nameInput.fill(name);
    await this.baseUrlInput.fill(baseUrl);
    await this.apiKeyInput.fill(apiKey);
    if (type) {
      await this.providerTypeSelect.selectOption(type);
    }
  }

  async testConnection() {
    await this.testButton.click();
  }

  async save() {
    await this.saveButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }
}
