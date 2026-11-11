import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

const planarIdle = (page: Page, key: string) =>
  page.waitForFunction((k) => window.__portos?.surfaceKind() === 'planar' && window.__portos.director()?.activeSceneKey === k && window.__portos.director()?.phase === 'idle', key, { timeout: 30_000 });
const lift = (page: Page, iso3: string) => page.evaluate((i) => window.__portos!.lift(i)?.progress ?? -1, iso3);
const polar = (page: Page) => page.evaluate(() => window.__portos!.orbit()?.polarDeg ?? -1);

/** V3 Gate 3 (spec 23 + 25): country lift on hover/focus, country pins, port focus emphasis, camera presets. */
test.describe('V3 country UX (Gate 3)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL interaction checks run on Chromium');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/ops/region/REG-SEA');
    await planarIdle(page, 'region3d:REG-SEA');
  });

  test('country pins: focus raises the country, Enter opens it, back leaves no sticky hover', async ({ page }) => {
    const pin = page.getByTestId('country-pin-VNM');
    await expect(pin).toBeAttached();
    await expect(pin).toHaveAttribute('aria-label', /Vietnam/);
    expect(await lift(page, 'VNM')).toBe(0);

    await pin.focus();
    await expect.poll(() => lift(page, 'VNM'), { timeout: 2_000 }).toBe(1);
    const f = await page.evaluate(() => window.__portos!.lift('VNM')!.fraction);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(0.02);

    await pin.blur();
    await expect.poll(() => lift(page, 'VNM'), { timeout: 2_000 }).toBe(0);

    await pin.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/ops\/country\/CNT-VNM/);
    await planarIdle(page, 'country3d:CNT-VNM');

    await page.goBack();
    await planarIdle(page, 'region3d:REG-SEA');
    await page.waitForTimeout(400);
    expect(await lift(page, 'VNM'), 'no sticky hover after drilldown and back').toBe(0);
  });

  test('pointer hover on a pin gives the same emphasis as keyboard focus', async ({ page }) => {
    const pin = page.getByTestId('country-pin-THA');
    await pin.hover();
    await expect.poll(() => lift(page, 'THA'), { timeout: 2_000 }).toBe(1);
    await page.mouse.move(5, 450);
    await expect.poll(() => lift(page, 'THA'), { timeout: 2_000 }).toBe(0);
  });

  test('focusing a port label emphasises its country without opening the port', async ({ page }) => {
    await page.getByTestId('port-label-PRT-HCM').focus();
    await expect.poll(() => lift(page, 'VNM'), { timeout: 2_000 }).toBe(1);
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA/);
    await page.getByTestId('port-label-PRT-HCM').blur();
    await expect.poll(() => lift(page, 'VNM'), { timeout: 2_000 }).toBe(0);
  });

  test('camera presets: isometric ≈50°, top-down ≈4°, fit restores the scope frame', async ({ page }) => {
    const fitPolar = await polar(page);
    await expect(page.getByTestId('view-presets')).toBeVisible();

    await page.getByTestId('view-preset-iso').click();
    await expect.poll(() => polar(page), { timeout: 3_000 }).toBeCloseTo(50, 0);
    expect(await page.evaluate(() => window.__portos!.orbit()!.azimuthDeg)).toBeCloseTo(35, 0);
    await expect(page.getByTestId('view-preset-iso')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('view-preset-top').click();
    await expect.poll(() => polar(page), { timeout: 3_000 }).toBeCloseTo(4, 0);

    await page.getByTestId('view-preset-fit').click();
    await expect.poll(() => polar(page), { timeout: 3_000 }).toBeCloseTo(fitPolar, 0);
  });

  test('back from a country restores the region orientation and preset (spec 24 C.02)', async ({ page }) => {
    await page.getByTestId('view-preset-iso').click();
    await expect.poll(() => polar(page), { timeout: 3_000 }).toBeCloseTo(50, 0);
    const before = await page.evaluate(() => window.__portos!.orbit()!);
    await page.getByTestId('country-pin-VNM').click();
    await planarIdle(page, 'country3d:CNT-VNM');
    await page.goBack();
    await planarIdle(page, 'region3d:REG-SEA');
    const after = await page.evaluate(() => window.__portos!.orbit()!);
    expect(after.polarDeg).toBeCloseTo(before.polarDeg, 0);
    expect(after.azimuthDeg).toBeCloseTo(before.azimuthDeg, 0);
    expect(after.distance / before.distance).toBeCloseTo(1, 1);
    await expect(page.getByTestId('view-preset-iso')).toHaveAttribute('aria-pressed', 'true');
  });
});
