import { expect, test } from '@playwright/test';

test.describe('Phase gates', () => {
  test('search VSL-0001 opens the vessel inspector with +18 h and $24,000', async ({ page }) => {
    await page.goto('/operations');
    await expect(page.getByTestId('simulated-stamp')).toContainText('Simulated');
    const search = page.getByRole('combobox', { name: /Search vessels/ });
    await search.fill('VSL-0001');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/vessel\/VSL-0001/);
    const inspector = page.getByTestId('inspector');
    await expect(inspector.getByRole('heading', { level: 2 })).toHaveText('MV Pacific Horizon');
    await expect(inspector.getByTestId('eta-shift')).toHaveText('+18.0 h');
    await expect(inspector.getByTestId('exposure-value')).toHaveText('$24,000');
  });

  test('invalid deep link returns to the nearest valid parent with an explanation', async ({ page }) => {
    await page.goto('/vessel/VSL-9999');
    await expect(page).toHaveURL(/\/operations/);
    await expect(page.getByRole('status').filter({ hasText: 'VSL-9999' })).toBeVisible();
  });

  test('replay deep link shows the pre-revision estimate', async ({ page }) => {
    await page.goto('/vessel/VSL-0001?t=2026-11-09T08:00:00Z');
    await expect(page.getByTestId('simulated-stamp')).toContainText('Replay');
    await expect(page.getByTestId('eta-shift')).toHaveText('+8.0 h');
  });
});
