import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectHeading, flightDone, globeReady, inspector, open, search } from './helpers';

/** Spec 19 rows the other specs do not reach: M03 (orbit, tilt, wheel) and M19 (same vessel from two scopes). */
const evidenceDir = process.env.PORTOS_EVIDENCE ? 'docs/qa/v2-phase9' : null;

async function evidence(page: Page, name: string) {
  if (!evidenceDir) return;
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(`${evidenceDir}/${name}.png`, await page.screenshot());
}

const regionReady = (page: Page) =>
  page.waitForFunction(() => window.__portos?.director()?.activeSceneKey === 'region3d:REG-SEA' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 });

async function settled(page: Page) {
  let last = '';
  await expect
    .poll(async () => {
      const r = (await page.evaluate(() => window.__portos!.orbit()))!;
      const o = [r.polarDeg.toFixed(1), r.azimuthDeg.toFixed(1), r.distance.toPrecision(3)].join();
      const same = o === last;
      last = o;
      return same;
    }, { intervals: [250] })
    .toBe(true);
  return (await page.evaluate(() => window.__portos!.orbit()))!;
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
}

async function labelOffset(page: Page) {
  const box = await page.getByTestId('port-label-PRT-SIN').boundingBox();
  const p = await page.evaluate(() => window.__portos!.portPoint('PRT-SIN'));
  return box && p?.visible ? { x: box.x + box.width / 2 - p.x, y: box.y + box.height / 2 - p.y } : null;
}

async function markerError(page: Page, id: string) {
  return page.evaluate((v) => {
    const a = window.__portos!.vesselScreen(v);
    const b = window.__portos!.vesselPoint(v);
    return a?.visible && b?.visible ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  }, id);
}

test.describe('Spec 19 acceptance rows (Phase 9)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL evidence is recorded on Chromium');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('M03 · orbit 45°, tilt and wheel on the extruded region keep labels and vessels georeferenced', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA');
    await globeReady(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await regionReady(page);
    await flightDone(page);
    const o0 = await settled(page);
    const label0 = await labelOffset(page);
    expect(label0, 'Singapore port label visible').not.toBeNull();
    expect(await markerError(page, 'VSL-0001')).toBeLessThan(4);

    const canvas = page.getByTestId('map-workspace').locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    const centre = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.5 };

    // OrbitControls rotates 2π per canvas height; damping on a slow renderer lands short, so drag in steps to 45°.
    const azimuthChange = (o: { azimuthDeg: number }) => Math.abs(((o.azimuthDeg - o0.azimuthDeg + 540) % 360) - 180);
    let o1 = o0;
    for (let i = 0; i < 6 && azimuthChange(o1) < 40; i++) {
      await drag(page, centre, box.height / 48, 0);
      o1 = await settled(page);
    }
    expect(azimuthChange(o1), 'azimuth change').toBeGreaterThanOrEqual(40);
    expect(azimuthChange(o1), 'azimuth change').toBeLessThan(90);

    // Dragging up lowers the camera towards the horizon so the extruded side walls show.
    let o2 = o1;
    for (let i = 0; i < 4 && o2.polarDeg - o1.polarDeg < 8; i++) {
      await drag(page, centre, 0, -box.height / 72);
      o2 = await settled(page);
    }
    expect(o2.polarDeg - o1.polarDeg, 'tilt change').toBeGreaterThanOrEqual(8);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, -500);
    const o3 = await settled(page);
    expect(o3.distance, 'wheel zooms in').toBeLessThan(o2.distance * 0.92);

    // The 3D marker and the WGS84 projection agree, and the DOM label keeps its screen offset from the port point.
    expect(await markerError(page, 'VSL-0001'), 'VSL-0001 marker vs projection (px)').toBeLessThan(4);
    const label1 = await labelOffset(page);
    expect(label1, 'Singapore port label still visible').not.toBeNull();
    expect(Math.hypot(label1!.x - label0!.x, label1!.y - label0!.y), 'label drift (px)').toBeLessThan(12);
    await evidence(page, '11-region-orbit-tilt');
  });

  test('M07 · clicking an underway ship selects the same vessel in map, inspector and track without moving the clock', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA');
    await globeReady(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await regionReady(page);
    await flightDone(page);
    const timeBefore = await page.evaluate(() => window.__portos!.clock().timeMs);
    // An isolated underway ship in open map area (clear of the ribbon, KPI rail and tool column).
    const target = await page.evaluate(() => {
      const a = window.__portos!;
      for (const id of a.vesselsNear(720, 450, 2000)) {
        const p = a.vesselPoint(id);
        if (!p?.visible || p.x < 320 || p.x > 1300 || p.y < 180 || p.y > 780) continue;
        if (a.vesselPose(id)?.state !== 'underway' || a.vesselsNear(p.x, p.y, 28).length !== 1) continue;
        return { id, ...p };
      }
      return null;
    });
    expect(target, 'an isolated underway ship on screen').not.toBeNull();
    await page.mouse.click(target!.x, target!.y);
    await expect(page).toHaveURL(new RegExp(`[?&]vessel=${target!.id}`));
    await expect(inspector(page)).toContainText(target!.id);
    await expect.poll(() => page.evaluate(() => window.__portos!.overlayStats()?.trackRuns.length ?? 0)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__portos!.clock().timeMs)).toBe(timeBefore);
  });

  test('M11 · 3D ↔ 2D keeps the selected vessel, time, layer filters and centre', async ({ page }) => {
    await open(page, '/ops/port/PRT-SIN?vessel=VSL-0001&time=2026-11-09T10:00:00Z');
    await globeReady(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await page.waitForFunction(() => window.__portos?.twin()?.portId === 'PRT-SIN' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 });
    await flightDone(page);
    await expectHeading(page, 'MV Pacific Horizon');
    await page.getByTestId('layer-group-weather').click();
    await expect(page.getByTestId('layer-group-weather')).toHaveAttribute('aria-pressed', 'false');
    const layersOn = () => page.evaluate(() => JSON.stringify([...document.querySelectorAll('[data-testid^="layer-group-"]')].map((b) => `${b.getAttribute('data-testid')}:${b.getAttribute('aria-pressed')}`)));
    const layers = await layersOn();

    await page.getByRole('button', { name: /^2D/ }).click();
    await expect(page.getByTestId('map-workspace')).toHaveAttribute('data-view-mode', '2d');
    const q2 = new URL(page.url()).searchParams;
    expect(q2.get('vessel')).toBe('VSL-0001');
    expect(q2.get('time')).toMatch(/^2026-11-09T10:00/);
    expect(await layersOn()).toBe(layers);
    await expectHeading(page, 'MV Pacific Horizon');
    await expect(page.getByTestId('layer-group-weather')).toHaveAttribute('aria-pressed', 'false');
    const centre2d = await page.waitForFunction(() => {
      const m = window.__portos2d as { loaded?(): boolean; getCenter?(): { lat: number; lng: number } } | undefined;
      return m?.loaded?.() && m.getCenter ? m.getCenter() : null;
    }, null, { timeout: 20_000 }).then((h) => h.jsonValue());
    // Singapore port (1.26 N, 103.8 E) stays in frame: the 2D centre is within ~0.3° of it.
    expect(Math.abs(centre2d!.lat - 1.26)).toBeLessThan(0.3);
    expect(Math.abs(centre2d!.lng - 103.8)).toBeLessThan(0.3);
    await evidence(page, '12-port-2d-vsl0001');

    await page.getByRole('button', { name: /^3D/ }).click();
    await expect(page.getByTestId('map-workspace')).toHaveAttribute('data-view-mode', '3d');
    await flightDone(page);
    const q3 = new URL(page.url()).searchParams;
    expect(q3.get('vessel')).toBe('VSL-0001');
    expect(await layersOn()).toBe(layers);
    expect(q3.get('time')).toMatch(/^2026-11-09T10:00/);
    await expectHeading(page, 'MV Pacific Horizon');
    await page.waitForFunction(() => window.__portos?.twin()?.portId === 'PRT-SIN', null, { timeout: 30_000 });
  });

  test('M15 · Back and Forward restore the scene and time with one renderer', async ({ page }) => {
    await open(page, '/ops/earth?time=2026-11-09T08:00:00Z');
    await globeReady(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await flightDone(page);
    const t0 = await page.evaluate(() => window.__portos!.clock().timeMs);
    await page.getByTestId('region-label-REG-SEA').click();
    await regionReady(page);
    await page.goBack();
    await page.waitForFunction(() => window.__portos?.surfaceKind() === 'globe' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/ops\/earth/);
    await page.goForward();
    await regionReady(page);
    await flightDone(page);
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA\?.*time=2026-11-09T08/);
    expect(await page.evaluate(() => window.__portos!.clock().timeMs)).toBe(t0);
    expect(await page.getByTestId('map-workspace').locator('.earth__host canvas').count(), 'one WebGL canvas').toBe(1);
    expect(await page.evaluate(() => window.__portos!.bridge().stageVisible), 'no handoff frame left on screen').toBe(false);
  });

  test('M16 · v1 corridor and weather links open their selection under /ops', async ({ page }) => {
    await open(page, '/corridors/RTE-SIN-RTM');
    await expect(page).toHaveURL(/\/ops\/[a-z]+.*route=RTE-SIN-RTM/);
    await expect(inspector(page)).toBeVisible();
    await page.goto('/weather/WX-0001');
    await expect(page).toHaveURL(/\/ops\/[a-z]+.*hazard=WX-0001/);
    await expect(inspector(page)).toBeVisible();
  });

  test('M17 · a scene that fails to load keeps the last stable view, explains itself and retries', async ({ page }) => {
    let fail = true;
    await page.route(/\/geo\/region\/REG-SEA\.json/, (route) => (fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fallback()));
    await open(page, '/ops/earth');
    await globeReady(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await flightDone(page);
    await page.getByTestId('region-label-REG-SEA').click();
    const alert = page.getByTestId('scene-failure');
    await expect(alert).toContainText('Southeast Asia could not be loaded');
    expect(await page.evaluate(() => window.__portos!.surfaceKind())).toBe('globe');
    expect(await page.evaluate(() => window.__portos!.bridge()), 'no zombie handoff frame or hidden labels').toMatchObject({ stageVisible: false, labelsHidden: false });
    // The globe frames Southeast Asia instead, so scope, URL, labels and camera agree while the extruded scene is down.
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA/);
    await flightDone(page);
    await expect(page.getByTestId('port-label-PRT-SIN')).toBeVisible();
    await evidence(page, '13-scene-failure-retry');
    fail = false;
    await alert.getByTestId('scene-retry').click();
    await regionReady(page);
    await expect(alert).toHaveCount(0);
    expect(await page.evaluate(() => window.__portos!.surfaceKind())).toBe('planar');
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('M20 · with reduced motion, keyboard drives 100× playback at the right rate and Escape closes the inspector', async ({ page }) => {
      await open(page, '/ops/region/REG-SEA?vessel=VSL-0047&panel=replay');
      await globeReady(page);
      await flightDone(page);
      expect(await page.evaluate(() => window.__portos!.reducedMotion())).toBe(true);
      await page.getByTestId('replay-rate').focus();
      await page.getByTestId('replay-rate').selectOption('100');
      await page.getByTestId('replay-play').focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('playing');
      const ratio = await page.evaluate(async () => {
        const a = { wall: performance.now(), sim: window.__portos!.clock().frameMs };
        await new Promise((r) => setTimeout(r, 1500));
        const b = { wall: performance.now(), sim: window.__portos!.clock().frameMs };
        return (b.sim - a.sim) / (b.wall - a.wall);
      });
      expect(ratio).toBeGreaterThan(85);
      expect(ratio).toBeLessThan(115);
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('paused');
      await expectHeading(page, 'MV Emerald Star 047');
      await inspector(page).getByRole('tab', { name: 'Overview' }).focus();
      await page.keyboard.press('Escape');
      await expect(page).not.toHaveURL(/[?&]vessel=VSL-0047/);
    });
  });

  test('M19 · searching VSL-0047 from Earth and from the region resolves the same vessel, data, history and model', async ({ page }) => {
    const read = async () => {
      await expectHeading(page, 'MV Emerald Star 047');
      await expect(page).toHaveURL(/[?&]vessel=VSL-0047/);
      return {
        model: await inspector(page).getByTestId('ship-silhouette').getAttribute('data-model'),
        progress: (await inspector(page).getByTestId('route-progress').textContent())?.trim(),
        events: (await inspector(page).getByTestId('vessel-recent-events').textContent())?.trim(),
        pose: await page.evaluate(() => window.__portos!.vesselPose('VSL-0047')?.model ?? null),
      };
    };

    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    await search(page, 'VSL-0047');
    await flightDone(page);
    const fromEarth = await read();

    await page.goto('/ops/region/REG-SEA');
    await globeReady(page);
    await flightDone(page);
    await search(page, 'VSL-0047');
    await flightDone(page);
    const fromRegion = await read();

    expect(fromEarth.model).toBeTruthy();
    expect(fromRegion).toEqual(fromEarth);
  });
});
