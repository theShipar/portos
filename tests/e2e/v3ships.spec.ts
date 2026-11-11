import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, open } from './helpers';

const stats = (page: Page) => page.evaluate(() => window.__portos!.overlayStats()!);

/**
 * Ship draw budget per scope with all 500 vessels loaded (spec 04/05 B.05, G.01): batched instanced draws, close
 * models capped, triangles bounded however many ships are in view.
 */
const BUDGET = {
  earth: { drawCalls: 12, triangles: 150_000 },
  region: { drawCalls: 18, triangles: 400_000 },
  port: { drawCalls: 24, triangles: 900_000 },
} as const;

/** V3 Gate 4: projected-length LOD bands with hysteresis, no flicker, budgets. */
test.describe('V3 ship LOD (Gate 4)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL checks run on Chromium');

  test('per-scope ship draw budget with 500 vessels', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [scope, route] of [
      ['earth', '/ops/earth'],
      ['region', '/ops/region/REG-SEA'],
      ['port', '/ops/port/PRT-SIN?vessel=VSL-0001&view=3d'],
    ] as const) {
      await open(page, route);
      await globeReady(page);
      await flightDone(page);
      await page.waitForTimeout(500);
      const s = await stats(page);
      expect(s.vessels, scope).toBe(500);
      expect(s.bandMode).toBe('v3');
      expect(s.shipDrawCalls, `${scope} draw calls`).toBeLessThanOrEqual(BUDGET[scope].drawCalls);
      expect(s.shipTriangles, `${scope} triangles`).toBeLessThanOrEqual(BUDGET[scope].triangles);
      expect(s.bands.inspection, scope).toBeLessThanOrEqual(2);
      expect(s.bands.detailed, scope).toBeLessThanOrEqual(12);
      test.info().annotations.push({ type: scope, description: JSON.stringify({ drawCalls: s.shipDrawCalls, triangles: s.shipTriangles, bands: s.bands }) });
    }
  });

  test('Earth draws oriented icons, not 3D models, for distant ships', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    const s = await stats(page);
    expect(s.bands.icon + s.bands.dot).toBeGreaterThan(50);
    expect(s.bands.detailed + s.bands.inspection).toBe(0);
    expect(s.wakes).toBe(0);
  });

  test('bands hold still at a fixed camera and the selection climbs monotonically while zooming in', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0047');
    await globeReady(page);
    await flightDone(page);
    const snapshot = () =>
      page.evaluate(() => {
        const a = window.__portos!;
        return Array.from({ length: 500 }, (_, i) => `VSL-${String(i + 1).padStart(4, '0')}`)
          .map((id) => [id, a.vesselPose(id)?.band ?? null] as const)
          .filter(([, b]) => b !== null);
      });
    // Paused clock, still camera: no band changes across 1.5 s of frames.
    const before = new Map(await snapshot());
    await page.waitForTimeout(1500);
    const after = new Map(await snapshot());
    let changed = 0;
    for (const [id, b] of before) if (after.has(id) && after.get(id) !== b) changed++;
    expect(changed, 'no LOD flicker at rest').toBe(0);

    // Wheel in over the selected ship: its band never steps back down.
    const pt = (await page.evaluate(() => window.__portos!.vesselPoint('VSL-0047')))!;
    expect(pt.visible).toBe(true);
    await page.mouse.move(pt.x, pt.y);
    const seen: number[] = [];
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(260);
      const b = await page.evaluate(() => window.__portos!.vesselPose('VSL-0047')?.band ?? -1);
      if (b >= 0) seen.push(b);
    }
    expect(seen.length).toBeGreaterThan(5);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!, `step ${i}: ${seen.join(',')}`).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen.at(-1)!).toBeGreaterThan(seen[0]!);
  });

  test('`?v3ShipPreview=0` restores the V2 overlay-wide LOD', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/ops/region/REG-SEA?v3ShipPreview=0');
    await globeReady(page);
    await flightDone(page);
    const s = await stats(page);
    expect(s.bandMode).toBe('v2');
    expect(s.lod).toBeGreaterThanOrEqual(1);
    expect(s.bands.icon + s.bands.lowpoly).toBe(0);
  });
});
