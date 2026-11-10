import { expect, test } from '@playwright/test';
import { expectHeading, flightDone, globeReady, inspector, open, search } from './helpers';

test.describe('Failure paths', () => {
  test('without WebGL the map explains itself and search still works', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (orig as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof orig;
    });
    await open(page, '/operations');
    await expect(page.getByRole('alert').filter({ hasText: '3D map unavailable' })).toBeVisible();
    await search(page, 'VSL-0001');
    await expect(page).toHaveURL(/[?&]vessel=VSL-0001/);
    await expect(page.getByTestId('exposure-value')).toHaveText('$24,000');
  });

  test('WebGL context loss shows a recovery banner and keeps the selection', async ({ page }) => {
    await open(page, '/vessel/VSL-0001');
    await globeReady(page);
    await page.evaluate(() => window.__portos!.loseContext());
    const alert = page.getByRole('alert').filter({ hasText: '3D map failed to render' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('context was lost');
    await expectHeading(page, 'MV Pacific Horizon');
    await alert.getByRole('button', { name: 'Retry 3D map' }).click();
    await globeReady(page);
    await expect(page).toHaveURL(/[?&]vessel=VSL-0001/);
    await expectHeading(page, 'MV Pacific Horizon');
  });

  test('basemap tile failure keeps the 2D port overlays and says why', async ({ page }) => {
    await page.route(/openfreemap\.org/, (route) => route.abort());
    await open(page, '/port/PRT-SIN?view=2d');
    await expect(page.getByTestId('port-map-2d')).toBeVisible();
    await expect(page.getByTestId('basemap-unavailable')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('port-queue')).toBeVisible();
    await expect(page.locator('[data-testid^="anchorage-"]').first()).toBeAttached();
  });

  test('a missing weather hazard dataset leaves route risk unknown, not clear', async ({ page }) => {
    await page.route(/weatherHazards[^/]*\.json/, (route) => route.fulfill({ status: 404, body: 'missing' }));
    await open(page, '/vessel/VSL-0001');
    await expect(page.getByRole('status').filter({ hasText: 'Weather hazard data could not be loaded' })).toBeVisible();
    await expect(page.getByTestId('route-risk')).toContainText('Route risk unknown');
    await expect(page.getByTestId('exposure-value')).toHaveText('$24,000');
  });

  test('corrupted local storage falls back to the clean demo with a notice', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('__corrupt')) return;
      sessionStorage.setItem('__corrupt', '1');
      localStorage.setItem('portos:workflow:v1', '{not json');
      localStorage.setItem('portos:assumptions:v1', '{"version":99}');
    });
    await page.goto('/incidents/INC-0001');
    await expectHeading(page, /Forecast ETA shift/);
    await expect(page.getByRole('status').filter({ hasText: /saved|storage|could not/i }).first()).toBeVisible();
    await inspector(page).getByRole('tab', { name: 'Actions' }).click();
    await page.getByTestId('assign-user').selectOption('USR-002');
    await page.getByTestId('assign-submit').click();
    await page.reload();
    await expect(page.getByTestId('incident-owner')).toContainText('Jordan Lee');
  });
});

test.describe('Motion and accessibility', () => {
  test('reduced motion makes scope changes instant', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '/operations');
    await globeReady(page);
    expect(await page.evaluate(() => window.__portos!.reducedMotion())).toBe(true);
    await page.getByTestId('region-label-REG-SEA').click();
    await expect(page).toHaveURL(/\/region\/REG-SEA/);
    const t0 = Date.now();
    await flightDone(page);
    expect(Date.now() - t0).toBeLessThan(1500);
    const sheetAnim = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="inspector"]');
      return el ? getComputedStyle(el).animationDuration : null;
    });
    expect(sheetAnim === null || parseFloat(sheetAnim) <= 0.01).toBe(true);
  });

  test('every button has an accessible name and focus is visible', async ({ page }) => {
    await open(page, '/port/PRT-SIN');
    await globeReady(page);
    await flightDone(page);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, [role="button"], a[href]')]
        .filter((el) => el.offsetParent !== null)
        .filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent?.trim()))
        .map((el) => el.outerHTML.slice(0, 120)),
    );
    expect(unnamed).toEqual([]);
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { outline: cs.outlineStyle, shadow: cs.boxShadow };
    });
    expect(ring).not.toBeNull();
    expect(ring!.outline !== 'none' || ring!.shadow !== 'none').toBe(true);
  });

  test('keyboard can walk the workspace without getting trapped', async ({ page }) => {
    await open(page, '/vessel/VSL-0001');
    await expect(inspector(page)).toBeVisible();
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const key = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return 'none';
        const region = el.closest('header') ? 'header' : el.closest('[data-testid="inspector"]') ? 'inspector' : el.closest('[data-testid="map-workspace"]') ? 'map' : 'other';
        return region;
      });
      seen.add(key);
    }
    expect(seen.has('header')).toBe(true);
    expect(seen.has('inspector')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(inspector(page)).toBeHidden();
  });
});

test.describe('Data consistency', () => {
  test('incident exposure equals the voyage exposure for VYG-0001', async ({ page }) => {
    await open(page, '/voyage/VYG-0001');
    await expect(page.getByTestId('exposure-value')).toHaveText('$24,000');
    await page.goto('/incidents/INC-0001');
    await expect(inspector(page)).toContainText('$24,000');
    await page.goto('/vessel/VSL-0001');
    await expect(page.getByTestId('exposure-value')).toHaveText('$24,000');
  });

  test('the exception queue count matches its list', async ({ page }) => {
    await open(page, '/operations');
    const queue = page.getByTestId('incident-queue');
    await expect(queue).toBeVisible();
    const heading = await queue.getByRole('heading').first().textContent();
    const n = Number(heading?.match(/(\d+)/)?.[1]);
    expect(n).toBeGreaterThan(0);
    await page.getByTestId('incident-queue-more').click();
    await expect(queue.locator('[data-testid^="queue-case-"]')).toHaveCount(n);
  });

  test('the same timestamp always reproduces the same vessel state', async ({ page }) => {
    await open(page, '/vessel/VSL-0001?t=2026-11-09T06:30:00Z');
    const a = await inspector(page).innerText();
    await page.goto('/vessel/VSL-0001?t=2026-11-09T09:00:00Z');
    await expect(page.getByTestId('simulated-stamp')).toContainText('09:00');
    await page.goto('/vessel/VSL-0001?t=2026-11-09T06:30:00Z');
    await expect(page.getByTestId('simulated-stamp')).toContainText('06:30');
    const b = await inspector(page).innerText();
    expect(b).toBe(a);
  });
});

test.describe('Responsive', () => {
  test('tablet width turns the inspector into a bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await open(page, '/vessel/VSL-0001');
    const box = await inspector(page).boundingBox();
    expect(box!.width).toBeGreaterThan(900);
    expect(box!.y).toBeGreaterThan(300);
  });

  test('below 768 px the map gives way to a safe list mode', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await open(page, '/operations');
    await expect(page.getByRole('note').filter({ hasText: '768 px' })).toBeVisible();
    await expect(page.getByTestId('incident-queue')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('region-label-REG-SEA')).toBeHidden();
    await expect(page.getByTestId('vessel-cluster').first()).toBeHidden();
    await search(page, 'VSL-0001');
    await expect(page.getByTestId('exposure-value')).toHaveText('$24,000');
  });

  test('200% zoom (720 px CSS viewport) keeps search and inspector usable', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await open(page, '/vessel/VSL-0001');
    await expect(page.getByTestId('exposure-value')).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Search vessels/ })).toBeVisible();
  });

  test('1280 × 800 keeps the region journey working', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/operations');
    await globeReady(page);
    await page.getByTestId('region-label-REG-SEA').click();
    await flightDone(page);
    await expect(page.getByTestId('port-label-PRT-SIN')).toBeVisible();
  });
});
