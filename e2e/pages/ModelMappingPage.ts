import { expect, type Locator, type Page } from '@playwright/test';

export class ModelMappingPage {
  readonly page: Page;
  readonly mappingHeading: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // ModelMappingForm renders <h2>Model Mapping</h2>
    this.mappingHeading = page.getByRole('heading', { name: 'Model Mapping' });
    // Save button: <Button>Save Mappings</Button>
    this.saveButton = page.getByRole('button', { name: 'Save Mappings' });
  }

  async goto() {
    await this.page.goto('/mapping');
  }

  async waitForLoaded() {
    await expect(this.mappingHeading).toBeVisible();
  }

  async updateTier(tier: 'Opus' | 'Sonnet' | 'Haiku', provider: string, model: string) {
    // Find the card containing the tier label
    const card = this.page.locator('div').filter({ hasText: tier }).first();
    const providerSelect = card.locator('select').first();
    const modelInput = card.locator('input[type="text"]').first();
    await providerSelect.selectOption(provider);
    await modelInput.fill(model);
  }

  async save() {
    await this.saveButton.click();
  }
}
