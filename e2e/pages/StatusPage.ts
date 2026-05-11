import { expect, type Locator, type Page } from '@playwright/test';

export class StatusPagePage {
  readonly page: Page;
  readonly statusHeading: Locator;
  readonly portCard: Locator;
  readonly versionCard: Locator;

  constructor(page: Page) {
    this.page = page;
    // StatusPage renders: <h2 className={...}>{statusLabel}</h2> with text Running/Stopped/Error
    this.statusHeading = page.getByRole('heading', { name: /running|stopped|error|starting/i });
    // StatusCard renders label as text, e.g. "Port", "Version"
    this.portCard = page.getByText('Port');
    this.versionCard = page.getByText('Version');
  }

  async goto() {
    await this.page.goto('/');
  }

  async waitForStatusReady() {
    await expect(this.statusHeading).toBeVisible({ timeout: 15000 });
  }
}
