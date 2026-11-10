import { expect, test } from '@playwright/test';
import { flightDone, globeReady, open } from './helpers';

const scopeNav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Geographic scope' });

test.describe('Canonical /ops routes', () => {
  test('v1 links redirect to their /ops equivalent', async ({ page }) => {
    await open(page, '/region/REG-SEA?t=2026-11-09T08:00:00Z');
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA\?.*time=2026-11-09T08(%3A|:)00/);
    await page.goto('/compare/VYG-0001');
    await expect(page).toHaveURL(/\/ops\/[a-z]+.*voyage=VYG-0001/);
    await expect(page).toHaveURL(/panel=compare/);
    await expect(page.getByTestId('comparison')).toBeVisible();
    await page.goto('/incidents/INC-0001');
    await expect(page).toHaveURL(/\/ops\/port\/PRT-SIN\?.*incident=INC-0001/);
    await page.goto('/weather/WX-NOPE');
    await expect(page).toHaveURL(/\/ops\/earth/);
  });

  test('country and city scenes resolve from the registry and keep their breadcrumb', async ({ page }) => {
    await open(page, '/ops/country/CNT-NLD');
    await globeReady(page);
    await expect(scopeNav(page)).toContainText('Netherlands');
    await expect(scopeNav(page)).toContainText('North Europe');
    await page.goto('/ops/city/CTY-SIN');
    await expect(scopeNav(page)).toContainText('Singapore');
    await expect(scopeNav(page)).toContainText('Southeast Asia');
    await page.goto('/ops/country/CNT-XXX');
    await expect(page).toHaveURL(/\/ops\/earth/);
    await expect(page.getByRole('status').filter({ hasText: 'CNT-XXX' })).toBeVisible();
  });

  test('the spatial director owns the globe and settles every flight', async ({ page }) => {
    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    const v2 = await page.evaluate(() => window.__portos!.spatialV2);
    test.skip(!v2, 'spatialV2 disabled');
    await page.getByTestId('region-label-REG-SEA').click();
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA/);
    await flightDone(page);
    await expect.poll(() => page.evaluate(() => window.__portos!.director()?.phase)).toBe('idle');
    const d = await page.evaluate(() => window.__portos!.director()!);
    expect(d).toMatchObject({ activeSceneKey: 'earth', activeFocusId: 'REG-SEA' });
    expect(d.flights).toBeGreaterThanOrEqual(2);
    await page.goBack();
    await expect(page).toHaveURL(/\/ops\/earth/);
    await expect.poll(() => page.evaluate(() => window.__portos!.director()?.activeFocusId)).toBe('earth');
    const cache = await page.evaluate(() => window.__portos!.sceneCache()!);
    expect(cache.size).toBe(1);
    expect(cache.disposed).toBe(0);
  });
});
