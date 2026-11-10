import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, inspector, open } from './helpers';

/**
 * Evidence screenshots for docs (not a gate). CAPTURE=before|after writes docs/screenshots/v2-{CAPTURE}-*.png on the
 * hardware GPU so the images match what a reviewer sees in a desktop browser.
 */
const tag = process.env.CAPTURE ?? '';
test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } });
test.skip(!tag, 'Set CAPTURE=before|after to write evidence screenshots.');
test.setTimeout(120_000);

async function settle(page: Page) {
  await page.waitForFunction(() => {
    const w = window as unknown as { __portos?: { state(): string; flying(): boolean } };
    return w.__portos?.state() === 'ready' && !w.__portos.flying();
  }, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}

const SHOTS: { name: string; go: (page: Page) => Promise<void> }[] = [
  { name: '01-earth', go: async (page) => { await open(page, '/operations'); await globeReady(page); await flightDone(page); await settle(page); } },
  { name: '02-region-sea', go: async (page) => { await open(page, '/region/REG-SEA'); await settle(page); } },
  { name: '03-singapore-port', go: async (page) => { await open(page, '/port/PRT-SIN'); await page.waitForTimeout(4000); } },
  { name: '04-vessel-vsl0001', go: async (page) => { await open(page, '/vessel/VSL-0001'); await settle(page); } },
  {
    name: '05-incident-replay',
    go: async (page) => {
      await open(page, '/incidents/INC-0001?t=2026-11-09T10:59:00Z');
      await expect(inspector(page)).toBeVisible();
      await settle(page);
    },
  },
];

for (const s of SHOTS) {
  test(`capture ${s.name}`, async ({ page }) => {
    mkdirSync('docs/screenshots', { recursive: true });
    await s.go(page);
    await page.screenshot({ path: `docs/screenshots/v2-${tag}-${s.name}.png` });
  });
}
