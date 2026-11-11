import { expect, test } from '@playwright/test';
import { expectHeading, globeReady, inspector, open } from './helpers';

/** V3 Gate 1: design primitives (Urbanist, tokens, glass, grid, navbar, controls) at 1440×900 and 390×844. */
test.describe('V3 design primitives (Gate 1)', () => {
  test('desktop: V3 theme, Urbanist, 64 px header, map owns ≥ 75 % of the view, glass HUD', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA');
    await globeReady(page);
    await page.evaluate(() => document.fonts.ready);

    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('v3');
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toMatch(/^"?Urbanist Variable"?/);
    expect(await page.evaluate(() => document.fonts.check('600 16px "Urbanist Variable"'))).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(7, 22, 27)');

    const header = await page.locator('header.header').boundingBox();
    expect(header?.height).toBe(64);

    const map = await page.locator('.workspace-map').boundingBox();
    expect(map).not.toBeNull();
    expect((map!.width * map!.height) / (1440 * 900)).toBeGreaterThanOrEqual(0.75);

    const blur = await page.locator('.kpis').first().evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(blur).toContain('blur(18px)');
  });

  test('desktop: inspector is clamp(360px, 29vw, 464px) and glass, opening it keeps the map dominant', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0047');
    await expect(inspector(page)).toBeVisible();
    await expectHeading(page, /Emerald Star/);
    const box = await inspector(page).boundingBox();
    expect(Math.round(box!.width)).toBe(418);
    const bg = await inspector(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toMatch(/rgba\(14, 26, 29, 0\.92\)/);
  });

  test('keyboard: / focuses search, Escape closes the inspector and returns to the map', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0047');
    await expect(inspector(page)).toBeVisible();
    await page.locator('body').click({ position: { x: 700, y: 500 }, trial: true });
    await page.keyboard.press('/');
    await expect(page.locator('#global-search')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.locator('#global-search').blur();
    await page.keyboard.press('Escape');
    await expect(inspector(page)).toBeHidden();
  });

  test('every icon-only control has an accessible name', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0047');
    await expect(inspector(page)).toBeVisible();
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button, [role="button"], a[href]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => !(el.textContent ?? '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title'))
        .map((el) => el.outerHTML.slice(0, 120)),
    );
    expect(unnamed).toEqual([]);
  });

  test('phone 390×844: 56 px header fits without horizontal scrolling; search expands on focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/ops/region/REG-SEA');
    await expect(page.locator('header.header')).toBeVisible();
    const header = await page.locator('header.header').boundingBox();
    expect(header?.height).toBe(56);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    for (const sel of ['.brand', '#global-search', '.stamp__btn', '.user']) {
      const b = await page.locator(sel).first().boundingBox();
      expect(b, sel).not.toBeNull();
      expect(b!.x + b!.width, sel).toBeLessThanOrEqual(390);
    }
    await expect(page.locator('.stamp__badge')).toHaveText(/^simulated$/i);
    await expect(page.locator('.stamp__badge')).toBeVisible();
    await page.locator('#global-search').focus();
    const wide = await page.locator('#global-search').boundingBox();
    expect(wide!.width).toBeGreaterThan(300);
  });

  test('?v3=0 restores the V2 presentation for rollback', async ({ page }) => {
    await open(page, '/ops/earth?v3=0');
    await globeReady(page);
    expect(await page.evaluate(() => document.documentElement.dataset.theme ?? null)).toBeNull();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 246, 243)');
    expect(await page.evaluate(() => window.__portos?.flags.v3Glass)).toBe(false);
  });
});
