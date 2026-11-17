import { selectOption } from './selectOption';
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

async function workshopReady(page: Page) {
  // Phones still get the < 768 px notice until Gate 9; capture whatever the shell shows there.
  if ((page.viewportSize()?.width ?? 1440) < 768) return;
  await expect(inspector(page)).toBeVisible();
  await expect(page.getByTestId('vessel-workshop')).toHaveAttribute('data-ready', '1', { timeout: 20_000 });
  await expect(page.getByTestId('cargo-summary')).toBeVisible({ timeout: 20_000 });
}

/** Port twin at a scenario time, optionally framed with the Survey camera. */
async function twinShot(page: Page, path: string, survey: boolean) {
  await open(page, path);
  const portId = /\/ops\/port\/(PRT-[A-Z]+)/.exec(path)?.[1];
  await page.waitForFunction(
    (id) => {
      const w = window as unknown as { __portos?: { twin(): { portId: string } | null; director(): { phase: string } | null } };
      return w.__portos?.twin()?.portId === id && w.__portos?.director()?.phase === 'idle';
    },
    portId,
    { timeout: 30_000 },
  );
  await settle(page, 1200);
  if (survey && (page.viewportSize()?.width ?? 1440) >= 768) {
    await page.getByTestId('view-preset-survey').click({ force: true });
    await settle(page, 1200);
  }
}

export const V3_SHOTS: { name: string; go: (page: Page) => Promise<void> }[] = [
  { name: 'port-sin-cranes', go: (page) => twinShot(page, '/ops/port/PRT-SIN?equip=QC-SIN-W3-2&time=2026-11-09T11:52:00Z', true) },
  { name: 'port-ssz-bulk', go: (page) => twinShot(page, '/ops/port/PRT-SSZ?equip=SL-SSZ-1&time=2026-11-09T12:00:00Z', true) },
  { name: 'port-dlc-lng', go: (page) => twinShot(page, '/ops/port/PRT-DLC?equip=LA-DLC-1A&time=2026-11-09T13:40:00Z', true) },
  { name: 'port-sou-roro', go: (page) => twinShot(page, '/ops/port/PRT-SOU?equip=RP-SOU-1&time=2026-11-09T12:00:00Z', true) },
  { name: 'port-survey', go: (page) => twinShot(page, '/ops/port/PRT-SIN?time=2026-11-09T11:52:00Z', true) },
  { name: 'port-ssz-overview', go: (page) => twinShot(page, '/ops/port/PRT-SSZ?time=2026-11-09T12:00:00Z', false) },
  { name: 'earth', go: async (page) => { await open(page, '/ops/earth'); await settle(page, 2500); } },
  { name: 'region-sea', go: async (page) => { await open(page, '/ops/region/REG-SEA'); await settle(page); } },
  { name: 'region-sea-focus', go: async (page) => { await open(page, '/ops/region/REG-SEA'); await settle(page); await page.getByTestId('country-pin-VNM').focus(); await page.waitForTimeout(600); } },
  { name: 'region-sea-iso', go: async (page) => { await open(page, '/ops/region/REG-SEA'); await settle(page); await page.getByTestId('view-preset-iso').click({ force: true }); await settle(page, 900); } },
  { name: 'region-neu', go: async (page) => { await open(page, '/ops/region/REG-NEU'); await settle(page); } },
  { name: 'country-nld', go: async (page) => { await open(page, '/ops/country/CNT-NLD'); await settle(page); } },
  { name: 'port-sin', go: async (page) => { await open(page, '/ops/port/PRT-SIN?time=2026-11-09T10:00:00Z'); await settle(page, 3000); } },
  { name: 'vessel-vsl0047', go: async (page) => { await open(page, '/ops/region/REG-SEA?vessel=VSL-0047'); await expect(inspector(page)).toBeVisible(); await settle(page); } },
  { name: 'vessel-vsl0001', go: async (page) => { await open(page, '/ops/port/PRT-SIN?vessel=VSL-0001&time=2026-11-09T10:00:00Z'); await settle(page, 3000); } },
  { name: 'vessel-cargo', go: async (page) => { await open(page, '/ops/port/PRT-SIN?vessel=VSL-0255&cargo=181004&time=2026-11-09T13:00:00Z'); await workshopReady(page); await settle(page, 1200); } },
  {
    name: 'vessel-manifest',
    go: async (page) => {
      await open(page, '/ops/port/PRT-SIN?vessel=VSL-0255&cargo=420202&time=2026-11-09T13:00:00Z');
      await workshopReady(page);
      if ((page.viewportSize()?.width ?? 1440) >= 768) await page.getByTestId('cargo-detail').scrollIntoViewIfNeeded();
      await settle(page, 800);
    },
  },
  { name: 'vessel-cargo-exploded', go: async (page) => { await open(page, '/ops/port/PRT-SIN?vessel=VSL-0255&hold=3&cargo=181004&explode=1&time=2026-11-09T13:00:00Z'); await workshopReady(page); await settle(page, 1500); } },
  { name: 'vessel-chase', go: async (page) => { await open(page, '/ops/region/REG-SEA?vessel=VSL-0001&cam=chase'); await workshopReady(page); await settle(page, 1200); } },
  { name: 'vessel-lng-tanks', go: async (page) => { await open(page, '/ops/region/REG-SEA?vessel=VSL-0047&cargo=CMP-0047-T2&cam=orbit'); await workshopReady(page); await settle(page, 1200); } },
  {
    name: 'clock-100x-follow',
    go: async (page) => {
      await open(page, '/ops/region/REG-SEA?vessel=VSL-0047&panel=replay');
      await settle(page, 1200);
      if ((page.viewportSize()?.width ?? 1440) < 768) return;
      await page.getByTestId('vessel-follow').click();
      await selectOption(page, page.getByTestId('replay-rate'), '100');
      await page.getByTestId('replay-play').click();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'clock-100x-cargo',
    go: async (page) => {
      await open(page, '/ops/port/PRT-SIN?vessel=VSL-0255&panel=replay&time=2026-11-09T11:48:00Z');
      await workshopReady(page);
      await settle(page, 800);
      if ((page.viewportSize()?.width ?? 1440) < 768) return;
      await selectOption(page, page.getByTestId('replay-rate'), '100');
      await page.getByTestId('replay-play').click();
      await page.waitForFunction(() => (window as unknown as { __portos: { clock(): { timeMs: number } } }).__portos.clock().timeMs > Date.parse('2026-11-09T12:04:00Z'), null, { timeout: 20_000 });
      await page.getByTestId('replay-play').click();
      await settle(page, 800);
    },
  },
  { name: 'ships-icons', go: async (page) => { await page.goto('/qa/ships.html?lod=icon'); await expect(page.getByTestId('ship-qa')).toHaveAttribute('data-ready', '1'); } },
  {
    name: 'port-sin-close',
    go: async (page) => {
      await open(page, '/ops/port/PRT-SIN?vessel=VSL-0001&view=3d&time=2026-11-09T10:00:00Z');
      await settle(page, 1500);
      const p = await page.evaluate(() => (window as unknown as { __portos: { vesselPoint(id: string): { x: number; y: number } | null } }).__portos.vesselPoint('VSL-0001'));
      if (p) {
        await page.mouse.move(p.x, p.y);
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, -240);
          await page.waitForTimeout(200);
        }
      }
      await settle(page, 1500);
    },
  },
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
