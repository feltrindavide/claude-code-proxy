import { expect, type Locator, type Page } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;
  readonly settingsHeading: Locator;
  readonly exportButton: Locator;
  readonly importButton: Locator;
  readonly importFileInput: Locator;

  constructor(page: Page) {
    this.page = page;
    // Settings page renders "Settings" as heading
    this.settingsHeading = page.getByRole('heading', { name: 'Settings' });
    // ConfigExportImport renders buttons with text "Export" and "Import"
    this.exportButton = page.getByRole('button', { name: 'Export' });
    this.importButton = page.getByRole('button', { name: 'Import' });
    // File input is rendered as <input type="file" hidden ref={fileInputRef} />
    this.importFileInput = this.page.locator('input[type="file"]');
  }

  async goto() {
    await this.page.goto('/settings');
  }

  async waitForLoaded() {
    await expect(this.settingsHeading).toBeVisible();
  }

  async exportConfig(): Promise<string> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.exportButton.click(),
    ]);
    return download.suggestedFilename();
  }

  async importConfig(filePath: string) {
    await this.importFileInput.setInputFiles(filePath);
  }
}
