import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { inspector, open } from './helpers';

/**
 * V3 gate evidence (not a gate by itself). `V3CAPTURE=g0 npx playwright test v3capture` writes
 * docs/qa/v3-g0/{desktop,mobile}-*.png at 1440x900 and 390x844 on the hardware GPU.
 * `V3SHOTS=earth,region` limits the set.
 */
const gate = process.env.V3CAPTURE ?? '';
const only = (process.env.V3SHOTS ?? '').split(',').filter(Boolean);
test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } });
test.skip(!gate, 'Set V3CAPTURE=g0..g10 to write gate evidence screenshots.');
test.setTimeout(120_000);

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 390, height: 844 },
] as const;

async function settle(page: Page, extraMs = 1500) {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __portos?: { state(): string; flying(): boolean } };
      return !w.__portos || (w.__portos.state() === 'ready' && !w.__portos.flying());
    },
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(extraMs);
}

export const V3_SHOTS: { name: string; go: (page: Page) => Promise<void> }[] = [
  { name: 'earth', go: async (page) => { await open(page, '/ops/earth'); await settle(page, 2500); } },
  { name: 'region-sea', go: async (page) => { await open(page, '/ops/region/REG-SEA'); await settle(page); } },
  { name: 'region-sea-focus', go: async (page) => { await open(page, '/ops/region/REG-SEA'); await settle(page); await page.getByTestId('country-pin-VNM').focus(); await page.waitForTimeout(600); } },
  { name: 'region-sea-iso', go: async (page) => { await open(page, '/ops/region/REG-SEA'); await settle(page); await page.getByTestId('view-preset-iso').click({ force: true }); await settle(page, 900); } },
  { name: 'region-neu', go: async (page) => { await open(page, '/ops/region/REG-NEU'); await settle(page); } },
  { name: 'country-nld', go: async (page) => { await open(page, '/ops/country/CNT-NLD'); await settle(page); } },
  { name: 'port-sin', go: async (page) => { await open(page, '/ops/port/PRT-SIN?time=2026-11-09T10:00:00Z'); await settle(page, 3000); } },
  { name: 'vessel-vsl0047', go: async (page) => { await open(page, '/ops/region/REG-SEA?vessel=VSL-0047'); await expect(inspector(page)).toBeVisible(); await settle(page); } },
  { name: 'vessel-vsl0001', go: async (page) => { await open(page, '/ops/port/PRT-SIN?vessel=VSL-0001&time=2026-11-09T10:00:00Z'); await settle(page, 3000); } },
  { name: 'incident', go: async (page) => { await open(page, '/incidents/INC-0001?t=2026-11-09T10:59:00Z'); await expect(inspector(page)).toBeVisible(); await settle(page); } },
];

for (const vp of VIEWPORTS) {
  for (const s of V3_SHOTS.filter((x) => !only.length || only.includes(x.name))) {
    test(`v3 ${gate} ${vp.tag} ${s.name}`, async ({ page }) => {
      mkdirSync(`docs/qa/v3-${gate}`, { recursive: true });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await s.go(page);
      await page.screenshot({ path: `docs/qa/v3-${gate}/${vp.tag}-${s.name}.png` });
    });
  }
}
