import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, inspector, open } from './helpers';

const SIZES = [
  { suffix: 'desktop', width: 1440, height: 900 },
  { suffix: '1920', width: 1920, height: 1080 },
];

async function settle(page: Page, { globe = true } = {}) {
  if (globe) {
    await globeReady(page);
    await flightDone(page);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}

async function tilesLoaded(page: Page) {
  await page
    .waitForFunction(
      () => {
        const m = window.__portos2d as { loaded?: () => boolean; areTilesLoaded?: () => boolean } | undefined;
        return !!m?.loaded?.() && !!m.areTilesLoaded?.();
      },
      null,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1500);
}

const VIEWS: { name: string; go: (page: Page) => Promise<void> }[] = [
  {
    name: '01-earth',
    go: async (page) => {
      await open(page, '/operations');
      await settle(page);
    },
  },
  {
    name: '02-selected-cluster',
    go: async (page) => {
      await open(page, '/region/REG-SEA');
      await settle(page);
      const badges = page.getByTestId('vessel-cluster');
      const n = await badges.count();
      let best = 0;
      let bestCount = 0;
      for (let i = 0; i < n; i++) {
        const c = Number((await badges.nth(i).textContent())?.trim());
        if (c > bestCount && (await badges.nth(i).isVisible())) [best, bestCount] = [i, c];
      }
      await badges.nth(best).click();
      await expect(page.getByTestId('stack-menu')).toBeVisible();
      await page.waitForTimeout(400);
    },
  },
  {
    name: '03-region',
    go: async (page) => {
      await open(page, '/region/REG-SEA');
      await settle(page);
    },
  },
  {
    name: '04-singapore-port',
    go: async (page) => {
      await open(page, '/port/PRT-SIN?view=2d');
      await expect(page.getByTestId('port-map-2d')).toBeVisible();
      await tilesLoaded(page);
    },
  },
  {
    name: '05-vessel',
    go: async (page) => {
      await open(page, '/vessel/VSL-0001');
      await settle(page);
    },
  },
  {
    name: '06-investigation',
    go: async (page) => {
      await open(page, '/incidents/INC-0001');
      await inspector(page).getByRole('tab', { name: 'Evidence' }).click();
      await settle(page);
    },
  },
  {
    name: '07-route-comparison',
    go: async (page) => {
      await open(page, '/compare/VYG-0001');
      await expect(page.getByTestId('comparison')).toBeVisible();
      await settle(page);
    },
  },
  {
    name: '08-replay',
    go: async (page) => {
      await open(page, '/replay/VYG-0001?t=2026-11-09T10:59:00Z');
      await expect(page.getByTestId('replay-rail')).toBeVisible();
      await settle(page);
    },
  },
];

for (const size of SIZES) {
  test.describe(`Visual baselines ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    for (const v of VIEWS) {
      test(v.name, async ({ page }) => {
        await v.go(page);
        await expect(page).toHaveScreenshot(`${v.name}-${size.suffix}.png`, { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 });
      });
    }
  });
}
