import { expect, type Locator, type Page } from '@playwright/test';

export class RoutingLogPage {
  readonly page: Page;
  readonly logHeading: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // RoutingLogTable renders "Routing Log" as heading
    this.logHeading = page.getByRole('heading', { name: 'Routing Log' });
    // Refresh button uses RefreshCw icon with text "Refresh"
    this.refreshButton = page.getByRole('button', { name: 'Refresh' });
  }

  async goto() {
    await this.page.goto('/logs');
  }

  async waitForLoaded() {
    await expect(this.logHeading).toBeVisible();
  }

  async hasLogEntries() {
    // The table renders rows with provider/model info
    const rows = this.page.locator('tbody tr');
    const count = await rows.count();
    return count > 0;
  }
}
