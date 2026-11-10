import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, open } from './helpers';

const evidenceDir = process.env.PORTOS_EVIDENCE ? 'docs/qa/v2-phase4' : null;

async function evidence(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }, minBytes = 12_000) {
  const png = await page.screenshot({ fullPage: !clip, clip });
  expect(png.byteLength, `${name} is not blank`).toBeGreaterThan(minBytes);
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(`${evidenceDir}/${name}.png`, png);
  }
}

/** Centroid of drawn (non-transparent, non-orange) pixels in a QA cell, relative to the cell centre. */
async function drawnCentroid(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)!;
    const gl = document.querySelector('canvas')!;
    const r = el.getBoundingClientRect();
    const dpr = gl.width / gl.clientWidth;
    const c = document.createElement('canvas');
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(gl, (r.left + scrollX) * dpr, (r.top + scrollY) * dpr, c.width, c.height, 0, 0, c.width, c.height);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (data[i + 3]! < 40) continue;
        if (data[i]! > 190 && data[i + 1]! < 140 && data[i + 2]! < 90) continue;
        sx += x;
        sy += y;
        n++;
      }
    }
    return { dx: sx / n / c.width - 0.5, dy: sy / n / c.height - 0.5, n };
  }, testId);
}

test.describe('3D ship library (Phase 4 gate)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL evidence is recorded on Chromium');

  for (const lod of [0, 1, 2]) {
    test(`silhouette grid renders every model at LOD${lod} inside its triangle budget`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.goto(`/qa/ships.html?lod=${lod}`);
      const qa = page.getByTestId('ship-qa');
      await expect(qa).toHaveAttribute('data-ready', '1');
      const stats = JSON.parse((await qa.getAttribute('data-stats'))!) as Record<string, Record<string, number>>;
      const range = ({ 0: [100, 500], 1: [1000, 5000], 2: [10000, 60000] } as const)[lod as 0 | 1 | 2];
      for (const [key, tris] of Object.entries(stats)) {
        expect(tris[lod], `${key} LOD${lod}`).toBeGreaterThanOrEqual(range[0]);
        expect(tris[lod], `${key} LOD${lod}`).toBeLessThanOrEqual(range[1]);
      }
      await expect(page.locator('text=⚠')).toHaveCount(0);
      // Every cell draws something.
      const cells = await page.locator('[data-testid^="ship-cell-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
      for (const id of cells) expect((await drawnCentroid(page, id)).n, id).toBeGreaterThan(150);
      await evidence(page, `ships-lod${lod}`);
    });
  }

  test('cardinal headings put the bow north, east, south and west', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/qa/ships.html?lod=1');
    await expect(page.getByTestId('ship-qa')).toHaveAttribute('data-ready', '1');
    // Accommodation and wake sit aft, so the drawn mass is pulled away from the bow.
    const c0 = await drawnCentroid(page, 'ship-heading-0');
    const c90 = await drawnCentroid(page, 'ship-heading-90');
    const c180 = await drawnCentroid(page, 'ship-heading-180');
    const c270 = await drawnCentroid(page, 'ship-heading-270');
    expect(c0.dy).toBeGreaterThan(0.04);
    expect(Math.abs(c0.dx)).toBeLessThan(0.03);
    expect(c90.dx).toBeLessThan(-0.04);
    expect(Math.abs(c90.dy)).toBeLessThan(0.03);
    expect(c180.dy).toBeLessThan(-0.04);
    expect(c270.dx).toBeGreaterThan(0.04);
    await page.getByTestId('ship-heading-0').scrollIntoViewIfNeeded();
    const box = (await page.getByTestId('ship-heading-0').boundingBox())!;
    // Mostly dark sea: it compresses well, so the blank check is lower here (the centroids above prove content).
    await evidence(page, 'cardinal-headings', { x: box.x - 4, y: box.y - 4, width: box.width * 4 + 8, height: Math.max(box.height, box.width) + 30 }, 3_000);
  });

  test('region view draws per-type models with wakes only underway; the selected ship gets LOD2 in port', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/ops/region/REG-SEA');
    await globeReady(page);
    await flightDone(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    const region = (await page.evaluate(() => window.__portos!.overlayStats()))!;
    expect(region.lod).toBeGreaterThanOrEqual(1);
    expect(region.wakes).toBeGreaterThan(0);
    expect(region.detailVessels).toEqual([]);
    // Only ships in (or near) the viewport are instanced as models; the rest of the fleet costs nothing.
    expect(region.modelVessels).toBeGreaterThan(20);
    expect(region.modelVessels).toBeLessThan(region.drawnVessels);

    // Motion rules on every drawn vessel in scope.
    const poses = await page.evaluate(() => {
      const a = window.__portos!;
      return Array.from({ length: 500 }, (_, i) => `VSL-${String(i + 1).padStart(4, '0')}`)
        .map((id) => a.vesselPose(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
    });
    expect(poses.length).toBeGreaterThan(20);
    for (const p of poses) {
      if (p.state !== 'underway') expect(p.wake, `${p.navStatus} has no wake`).toBe(0);
      if (p.state === 'underway') {
        expect(p.wake).toBeGreaterThan(0);
        expect(p.headingDeg).toBeCloseTo(((p.cogDeg! % 360) + 360) % 360, 6);
      }
    }
    expect(poses.some((p) => p.state === 'anchored')).toBe(true);
    // One instanced draw per ship model in view plus the wakes, however many ships.
    expect(region.shipDrawCalls).toBeLessThanOrEqual(9);
    await evidence(page, 'region-sea-ships', { x: 300, y: 130, width: 860, height: 560 });

    // Select VSL-0001 and open its port: it is drawn at its snapshot coordinates with the LOD2 model.
    await page.goto('/ops/port/PRT-SIN?vessel=VSL-0001&view=3d');
    await globeReady(page);
    await flightDone(page);
    await expect(page.getByTestId('map-workspace')).toHaveAttribute('data-view-mode', '3d');
    await expect.poll(async () => (await page.evaluate(() => window.__portos!.overlayStats()))?.detailVessels ?? []).toContain('VSL-0001');
    const pose = (await page.evaluate(() => window.__portos!.vesselPose('VSL-0001')))!;
    expect(pose.detail).toBe(2);
    expect(pose.model).toBe('container');
    const onScreen = await page.evaluate(([lat, lon]) => ({ v: window.__portos!.vesselPoint('VSL-0001'), p: window.__portos!.pointOf(lat!, lon!) }), [pose.lat, pose.lon]);
    expect(onScreen.v!.visible).toBe(true);
    expect(Math.hypot(onScreen.v!.x - onScreen.p!.x, onScreen.v!.y - onScreen.p!.y)).toBeLessThan(0.5);
    expect(pose.lat).toBeGreaterThan(1.0);
    expect(pose.lat).toBeLessThan(1.6);
    expect(pose.lon).toBeGreaterThan(103.4);
    expect(pose.lon).toBeLessThan(104.4);
    const port = (await page.evaluate(() => window.__portos!.overlayStats()))!;
    expect(port.lod).toBe(2);
    expect(port.detailVessels).toEqual(['VSL-0001']);
    expect(port.shipDrawCalls).toBeLessThanOrEqual(10);
    await evidence(page, 'port-sin-selected-vsl-0001', { x: 300, y: 130, width: 860, height: 560 });
  });
});
