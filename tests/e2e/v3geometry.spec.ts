import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, open } from './helpers';

const planarIdle = (page: Page, key: string) =>
  page.waitForFunction((k) => window.__portos?.surfaceKind() === 'planar' && window.__portos.director()?.activeSceneKey === k && window.__portos.director()?.phase === 'idle', key, { timeout: 30_000 });

/** V3 Gate 2: whole-region extrusion, no rectangular cutout, ghost neighbours, handoff timing. */
test.describe('V3 region extrusion (Gate 2)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL geometry checks run on Chromium');

  for (const [route, key, id] of [
    ['/ops/region/REG-SEA', 'region3d:REG-SEA', 'REG-SEA'],
    ['/ops/region/REG-NEU', 'region3d:REG-NEU', 'REG-NEU'],
    ['/ops/country/CNT-NLD', 'country3d:CNT-NLD', 'CNT-NLD'],
  ] as const) {
    test(`${id}: whole focus geometry, non-pickable ghost context`, async ({ page }) => {
      await open(page, route);
      await planarIdle(page, key);
      const g = await page.evaluate(() => window.__portos!.geometry());
      expect(g).not.toBeNull();
      expect(g!.id).toBe(id);
      expect(g!.clip).toBe('none');
      expect(g!.focusBounds).not.toBeNull();
      expect(g!.features).toBeGreaterThan(0);
      expect(g!.rings, 'neighbours drawn as ghost context').toBeGreaterThan(0);
      expect(g!.pickable).toBe(false);
      expect(g!.lineOpacity).toBeGreaterThanOrEqual(0.08);
      expect(g!.lineOpacity).toBeLessThanOrEqual(0.22);
    });
  }

  test('ghost land never takes a hover; focus land does', async ({ page }) => {
    await open(page, '/ops/region/REG-NEU');
    await planarIdle(page, 'region3d:REG-NEU');
    // Sweden is context in North Europe; Germany is focus.
    const hit = await page.evaluate(() => {
      const s = window.__portos!.surface() as unknown as { pick(x: number, y: number): { country: { iso3: string } | null } | null };
      const at = (lat: number, lon: number) => {
        const p = window.__portos!.pointOf(lat, lon);
        return p?.visible ? (s.pick(p.x, p.y)?.country?.iso3 ?? null) : 'offscreen';
      };
      return { swe: at(58.5, 15.0), deu: at(51.0, 10.0) };
    });
    expect(hit.deu).toBe('DEU');
    expect(hit.swe === null || hit.swe === 'offscreen').toBe(true);
  });

  test('Earth → SEA handoff: reveal + settle within 850–1400 ms', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    await page.getByTestId('region-label-REG-SEA').click();
    await planarIdle(page, 'region3d:REG-SEA');
    const tl = await page.evaluate(() => window.__portos!.bridge().timeline);
    const planned = (s: string) => tl.find((t) => t.step === s)?.plannedMs ?? 0;
    const total = planned('handoff') + planned('settle');
    expect(total).toBeGreaterThanOrEqual(850);
    expect(total).toBeLessThanOrEqual(1400);
    const g = await page.evaluate(() => window.__portos!.geometry());
    expect(g!.clip).toBe('none');
  });
});
