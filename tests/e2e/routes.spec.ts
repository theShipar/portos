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

  test('the spatial director hands the globe to extruded scenes and settles every flight', async ({ page }) => {
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
    expect(d).toMatchObject({ activeSceneKey: 'region3d:REG-SEA', activeKind: 'region3d', activeFocusId: 'REG-SEA' });
    expect(d.flights).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => window.__portos!.surfaceKind())).toBe('planar');
    await expect(page.getByTestId('north-arrow')).toBeVisible();
    await expect(page.getByTestId('scale-bar')).toContainText(/\d+ (km|m)/);
    const compass = (await page.evaluate(() => window.__portos!.compass()))!;
    expect(Math.abs(compass.northDeg)).toBeLessThan(2);
    // Southeast Asia spans thousands of km across the viewport: kilometres per pixel, not metres.
    expect(compass.metresPerPx).toBeGreaterThan(1000);
    await expect(page.getByTestId('illustrative-bounds')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/ops\/earth/);
    await expect.poll(() => page.evaluate(() => window.__portos!.director()?.activeFocusId)).toBe('earth');
    expect(await page.evaluate(() => window.__portos!.surfaceKind())).toBe('globe');
    await expect(page.getByTestId('planar-hud')).toHaveCount(0);
    const cache = await page.evaluate(() => window.__portos!.sceneCache()!);
    expect(cache.size).toBe(2);
    expect(cache.disposed).toBe(0);
  });

  test('extruded scenes drill down by double-click and label illustrative bounds', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA');
    await globeReady(page);
    await flightDone(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await expect.poll(() => page.evaluate(() => window.__portos!.director()?.activeSceneKey)).toBe('region3d:REG-SEA');
    // Vietnam's interior, away from vessels and labels.
    const vn = (await page.evaluate(() => window.__portos!.pointOf(14.2, 108.2)))!;
    await page.mouse.dblclick(vn.x, vn.y);
    await expect(page).toHaveURL(/\/ops\/country\/CNT-VNM/);
    await flightDone(page);
    await expect.poll(() => page.evaluate(() => window.__portos!.director()?.activeSceneKey)).toBe('country3d:CNT-VNM');

    await page.goto('/ops/city/CTY-SIN');
    await globeReady(page);
    await flightDone(page);
    await expect.poll(() => page.evaluate(() => window.__portos!.director()?.activeSceneKey)).toBe('city3d:CTY-SIN');
    const c = (await page.evaluate(() => window.__portos!.compass()))!;
    expect(c.metresPerPx).toBeLessThan(500);

    await page.goto('/ops/region/REG-MED');
    await globeReady(page);
    await flightDone(page);
    await expect(page.getByTestId('illustrative-bounds')).toHaveText(/Illustrative operational bounds · not a border/);
  });
});
