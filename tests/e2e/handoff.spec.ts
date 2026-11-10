import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, open } from './helpers';

/** Map area right of the queue rail and left of the map tools. */
const MAP_CLIP = { x: 300, y: 130, width: 860, height: 560 };
/** A uniform frame compresses to a few KB; a rendered globe or extruded map is far larger. */
const MIN_FRAME_BYTES = 12_000;
const evidenceDir = process.env.PORTOS_EVIDENCE ? 'docs/qa/v2-phase3' : null;

async function frame(page: Page, name: string) {
  const png = await page.screenshot({ clip: MAP_CLIP, animations: 'allow' });
  expect(png.byteLength, `${name} is not blank`).toBeGreaterThan(MIN_FRAME_BYTES);
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(`${evidenceDir}/${name}.png`, png);
  }
}

const director = (page: Page) => page.evaluate(() => window.__portos!.director()!);
const bridge = (page: Page) => page.evaluate(() => window.__portos!.bridge());

test.describe('Earth → geography handoff (Phase 3 gate)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'GPU timing evidence is recorded on Chromium');

  test('Earth → SEA → Singapore city → back, without blank frames', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await frame(page, '00-earth');

    await page.getByTestId('region-label-REG-SEA').click();
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA/);
    // Four frames through the flight: focus, dive, reveal, settle.
    const shots: string[] = [];
    for (const [name, step] of [
      ['01-focus', 'prepare'],
      ['02-dive', 'focus'],
      ['03-handoff', 'dive'],
      ['04-settle', 'handoff'],
    ] as const) {
      let labelsDuringHandoff = 0;
      await expect
        .poll(
          async () => {
            const s = await page.evaluate((st) => {
              const steps = window.__portos!.bridge().timeline.map((t) => t.step);
              const shown = [...document.querySelectorAll('.earth__labels > *')].filter((e) => getComputedStyle(e).visibility === 'visible').length;
              return { seen: steps.includes(st), handoff: steps.includes('handoff'), shown };
            }, step);
            if (step === 'dive' && s.seen && !s.handoff) labelsDuringHandoff = s.shown;
            return s.seen;
          },
          { timeout: 10_000, intervals: [16] },
        )
        .toBe(true);
      expect(labelsDuringHandoff, 'no DOM labels float over the handoff frame').toBe(0);
      await frame(page, name);
      shots.push(name);
    }
    await flightDone(page);
    expect(shots).toHaveLength(4);
    const d = await director(page);
    expect(d).toMatchObject({ phase: 'idle', activeSceneKey: 'region3d:REG-SEA', lastOutcome: 'done' });
    const tl = (await bridge(page)).timeline;
    expect(tl.map((t) => t.step)).toEqual(['prepare', 'focus', 'dive', 'handoff', 'settle']);
    // Planned lengths sit inside the spec 05 budgets. Wall-clock time can only exceed them (frame quantisation and
    // gsap lag smoothing while this test takes screenshots), never undercut them.
    const budgets = { focus: [650, 1200], dive: [450, 850], handoff: [350, 650], settle: [300, 550] } as const;
    for (const [name, [lo, hi]] of Object.entries(budgets)) {
      const t = tl.find((x) => x.step === name)!;
      expect(t.plannedMs, `${name} planned`).toBeGreaterThanOrEqual(lo);
      expect(t.plannedMs, `${name} planned`).toBeLessThanOrEqual(hi);
      expect(t.ms, `${name} measured`).toBeGreaterThanOrEqual(t.plannedMs - 40);
      expect(t.ms, `${name} measured (not stalled)`).toBeLessThanOrEqual(t.plannedMs + 6000);
    }
    expect((await bridge(page)).stageVisible).toBe(false);
    expect((await bridge(page)).labelsHidden).toBe(false);
    await frame(page, '05-region');

    // Singapore is a few pixels wide at region scale and sits under port and vessel markers; its city chip drills in.
    await page.getByTestId('city-label-CTY-SIN').click();
    await expect(page).toHaveURL(/\/ops\/city\/CTY-SIN/);
    await expect.poll(async () => (await bridge(page)).timeline.some((t) => t.step === 'dive'), { timeout: 10_000, intervals: [16] }).toBe(true);
    await frame(page, '06-city-dive');
    await flightDone(page);
    expect(await director(page)).toMatchObject({ activeSceneKey: 'city3d:CTY-SIN', lastOutcome: 'done' });
    expect((await bridge(page)).timeline.map((t) => t.step)).toEqual(['prepare', 'dive', 'handoff', 'settle']);
    await frame(page, '07-city');

    await page.goBack();
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA/);
    await expect.poll(async () => (await bridge(page)).timeline.some((t) => t.step === 'rise'), { timeout: 10_000, intervals: [16] }).toBe(true);
    await frame(page, '08-rise-region');
    await flightDone(page);
    expect(await director(page)).toMatchObject({ activeSceneKey: 'region3d:REG-SEA' });

    await page.goBack();
    await expect(page).toHaveURL(/\/ops\/earth/);
    await expect.poll(async () => (await bridge(page)).timeline.some((t) => t.step === 'rise'), { timeout: 10_000, intervals: [16] }).toBe(true);
    await frame(page, '09-rise-earth');
    await flightDone(page);
    expect(await director(page)).toMatchObject({ activeSceneKey: 'earth', lastOutcome: 'done' });
    expect(await page.evaluate(() => window.__portos!.surfaceKind())).toBe('globe');
    await frame(page, '10-earth-again');
  });

  test('repeated Earth ↔ SEA ↔ Singapore loops do not grow GPU memory', async ({ page }) => {
    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    const atEarth: { geometries: number; textures: number }[] = [];
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('region-label-REG-SEA').click();
      await expect(page).toHaveURL(/REG-SEA/);
      await flightDone(page);
      await page.getByTestId('city-label-CTY-SIN').click();
      await expect(page).toHaveURL(/CTY-SIN/);
      await flightDone(page);
      await page.goBack();
      await expect(page).toHaveURL(/REG-SEA/);
      await flightDone(page);
      await page.goBack();
      await expect(page).toHaveURL(/\/ops\/earth/);
      await flightDone(page);
      const s = await page.evaluate(() => window.__portos!.stats());
      atEarth.push({ geometries: s.geometries, textures: s.textures });
    }
    expect(atEarth[2]).toEqual(atEarth[1]);
    const cache = await page.evaluate(() => window.__portos!.sceneCache()!);
    expect(cache.size).toBeLessThanOrEqual(3);
    expect(cache.created).toBe(3);
  });

  test('Back mid-flight cancels the handoff and restores Earth', async ({ page }) => {
    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await page.getByTestId('region-label-REG-SEA').click();
    await expect.poll(async () => (await director(page)).phase, { intervals: [16] }).toBe('flying');
    await page.goBack();
    await expect(page).toHaveURL(/\/ops\/earth/);
    await flightDone(page);
    const d = await director(page);
    expect(d).toMatchObject({ phase: 'idle', activeSceneKey: 'earth' });
    expect(d.cancelled).toBeGreaterThanOrEqual(1);
    const b = await bridge(page);
    expect(b.timeline.map((t) => t.step)).toContain('cancelled');
    expect(b.stageVisible).toBe(false);
    expect(b.labelsHidden).toBe(false);
    await expect(page.getByTestId('region-label-REG-SEA')).toBeVisible();
  });

  test('Escape during a flight returns to the previous scene', async ({ page }) => {
    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await page.getByTestId('region-label-REG-SEA').click();
    await expect.poll(async () => (await director(page)).phase, { intervals: [16] }).toBe('flying');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/ops\/earth/);
    await flightDone(page);
    expect(await director(page)).toMatchObject({ phase: 'idle', activeSceneKey: 'earth' });
  });

  test('reduced motion swaps scenes with a short crossfade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '/ops/earth');
    await globeReady(page);
    test.skip(!(await page.evaluate(() => window.__portos!.spatialV2)), 'spatialV2 disabled');
    await page.getByTestId('region-label-REG-SEA').click();
    await flightDone(page);
    const tl = (await bridge(page)).timeline;
    expect(tl.map((t) => t.step)).toEqual(['prepare', 'crossfade', 'settle']);
    const fade = tl.find((t) => t.step === 'crossfade')!;
    expect(fade.plannedMs).toBeLessThanOrEqual(150);
    expect(fade.ms).toBeLessThan(1000);
    expect(await director(page)).toMatchObject({ activeSceneKey: 'region3d:REG-SEA' });
  });
});
