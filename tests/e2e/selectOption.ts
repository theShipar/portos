import type { Locator, Page } from '@playwright/test';

/** Exercise the styled listbox through the same controls used by a person. */
export async function selectOption(page: Page, trigger: Locator, value: string) {
  await trigger.click();
  await page.getByRole('listbox').locator(`[role="option"][data-value="${value}"]`).click();
}
