import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, inspector, open } from './helpers';

async function regionReady(page: Page) {
  await globeReady(page);
  await page.waitForFunction(() => window.__portos?.director()?.activeSceneKey === 'region3d:REG-SEA' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 });
  await flightDone(page);
}

/** One instant read from every surface in a single task: clock, map, inspector and timeline. */
function sample(page: Page, id: string) {
  return page.evaluate((vid) => {
    const a = window.__portos!;
    const clock = a.clock();
    const pose = a.vesselPose(vid);
    const pos = document.querySelector<HTMLElement>('[data-testid="vessel-position"]');
    const tl = document.querySelector<HTMLElement>('[data-testid="replay-time"]');
    const drawnAt = pose?.drawn?.atMs ?? null;
    return {
      timeMs: clock.timeMs,
      frameMs: clock.frameMs,
      mode: clock.mode,
      drawn: pose?.drawn ?? null,
      engineAtDrawn: drawnAt === null ? null : a.positionAt(vid, drawnAt),
      engineAtCommit: a.positionAt(vid, clock.timeMs),
      inspector: pos ? { timeMs: Number(pos.dataset.timeMs), lat: Number(pos.dataset.lat), lon: Number(pos.dataset.lon) } : null,
      timelineMs: tl ? Number(tl.dataset.timeMs) : null,
      follow: a.follow().follow?.vesselId ?? null,
    };
  }, id);
}

const near = (a: { lat: number; lon: number } | null, b: { lat: number; lon: number } | null) => !!a && !!b && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6;

/** V3 Gate 6: one deterministic clock drives map, inspector, timeline and cargo at up to 100×. */
test.describe('V3 unified clock (Gate 6)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL checks run on Chromium');
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

  test('the speed menu offers the kit presets 0.25× … 100×', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?panel=replay');
    await globeReady(page);
    const rate = page.getByTestId('replay-rate');
    const values = await rate.locator('option').evaluateAll((os) => os.map((o) => Number((o as HTMLOptionElement).value)));
    expect(values).toEqual([0.25, 1, 2, 5, 10, 25, 50, 100]);
    await rate.selectOption('0.25');
    await expect.poll(() => page.evaluate(() => window.__portos!.clock().rate)).toBe(0.25);
    await expect(rate).toContainText('Simulation ×0.25');
  });

  test('VSL-0047 at 100×: map, inspector and timeline show the same instant and the same position', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0047&panel=replay');
    await regionReady(page);
    await expect(inspector(page).getByTestId('vessel-position')).toBeVisible();
    await page.getByTestId('replay-rate').selectOption('100');
    await page.getByTestId('replay-play').click();
    await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('playing');

    const seen: Awaited<ReturnType<typeof sample>>[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(250);
      const s = await sample(page, 'VSL-0047');
      seen.push(s);
      expect(s.mode).toBe('playing');
      expect(s.follow).toBeNull();
      // The map draws the committed instant, at the track engine's position for that instant.
      expect(s.drawn?.atMs, `map time #${i}`).toBe(s.timeMs);
      expect(near(s.drawn, s.engineAtDrawn), `map position #${i}`).toBe(true);
      // The inspector and the timeline read the same committed instant.
      expect(s.inspector?.timeMs, `inspector time #${i}`).toBe(s.timeMs);
      expect(near(s.inspector, s.engineAtCommit), `inspector position #${i}`).toBe(true);
      expect(s.timelineMs, `timeline time #${i}`).toBe(s.timeMs);
    }
    await page.getByTestId('replay-play').click();
    await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('paused');

    // 100×: about 100 simulated seconds per wall second, and the ship moved.
    const first = seen[0]!;
    const last = seen.at(-1)!;
    expect(last.timeMs - first.timeMs).toBeGreaterThan(150_000);
    expect(Math.hypot(last.drawn!.lat - first.drawn!.lat, last.drawn!.lon - first.drawn!.lon)).toBeGreaterThan(0);
  });

  test('pause, step away and step back: the same instant reproduces the same map and sidebar', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0047&panel=replay');
    await regionReady(page);
    await page.getByTestId('replay-rate').selectOption('100');
    await page.getByTestId('replay-play').click();
    await page.waitForTimeout(1200);
    await page.getByTestId('replay-play').click();
    await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('paused');
    const a = await sample(page, 'VSL-0047');
    const textA = await inspector(page).getByTestId('vessel-position').innerText();
    expect(a.frameMs).toBe(a.timeMs);

    await page.getByTestId('replay-expand').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('replay-step-forward').click();
    await expect.poll(async () => (await sample(page, 'VSL-0047')).timeMs).toBe(a.timeMs + 15 * 60_000);
    expect(await inspector(page).getByTestId('vessel-position').innerText()).not.toBe(textA);
    for (let i = 0; i < 3; i++) await page.getByTestId('replay-step-back').click();
    await expect.poll(async () => (await sample(page, 'VSL-0047')).timeMs).toBe(a.timeMs);
    const b = await sample(page, 'VSL-0047');
    expect(b.drawn).toEqual(a.drawn);
    expect(b.inspector).toEqual(a.inspector);
    expect(await inspector(page).getByTestId('vessel-position').innerText()).toBe(textA);
  });

  test('following at 100×: the live pose is the engine position at its own frame time', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0047&panel=replay');
    await regionReady(page);
    await page.getByTestId('vessel-follow').click();
    await expect.poll(() => page.evaluate(() => window.__portos!.follow().follow?.vesselId ?? null)).toBe('VSL-0047');
    await page.getByTestId('replay-rate').selectOption('100');
    await page.getByTestId('replay-play').click();
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(300);
      const s = await sample(page, 'VSL-0047');
      expect(near(s.drawn, s.engineAtDrawn), `live position #${i}`).toBe(true);
      // Between commits the followed ship runs on its frame's clock time: never behind the commit (whole-second
      // rounding aside), and ahead of it by at most one 10 Hz commit interval (10 s at 100×).
      expect(s.drawn!.atMs).toBeGreaterThanOrEqual(s.timeMs - 500);
      expect(s.drawn!.atMs - s.timeMs).toBeLessThanOrEqual(10_500);
    }
    await page.getByTestId('replay-play').click();
  });

  test('cargo advances on the same clock: crane discharges during 100× playback, workshop and summary agree', async ({ page }) => {
    await open(page, '/ops/port/PRT-SIN?vessel=VSL-0255&panel=replay&time=2026-11-09T11:48:00Z');
    await globeReady(page);
    await expect(page.getByTestId('vessel-workshop')).toHaveAttribute('data-ready', '1', { timeout: 20_000 });
    await expect(page.getByTestId('cargo-head-on-board')).toHaveText('520 boxes');
    await page.getByTestId('replay-rate').selectOption('100');
    await page.getByTestId('replay-play').click();
    await expect.poll(() => page.evaluate(() => window.__portos!.clock().timeMs), { timeout: 15_000 }).toBeGreaterThan(Date.parse('2026-11-09T12:02:00Z'));
    await page.getByTestId('replay-play').click();
    await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('paused');
    const onBoard = Number((await page.getByTestId('cargo-head-on-board').innerText()).replace(/\D/g, ''));
    expect(onBoard).toBeLessThan(520);
    const filled = await page.evaluate(() => (window as unknown as { __portosWorkshop: { stats(): { filled: number } } }).__portosWorkshop.stats().filled);
    expect(filled).toBe(onBoard);
    await expect(page.getByTestId('cargo-summary')).toContainText(new RegExp(`as of ${(await page.getByTestId('replay-time').innerText()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

    // Seeking backward replays the stow: the discharged boxes are back on board.
    await page.getByTestId('replay-expand').click();
    const firstLift = Date.parse('2026-11-09T11:50:00Z');
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__portos!.clock().timeMs)) >= firstLift; i++) {
      await page.getByTestId('replay-step-back').click();
    }
    expect(await page.evaluate(() => window.__portos!.clock().timeMs)).toBeLessThan(firstLift);
    await expect(page.getByTestId('cargo-head-on-board')).toHaveText('520 boxes');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __portosWorkshop: { stats(): { filled: number } } }).__portosWorkshop.stats().filled)).toBe(520);
  });

  test('a reload never resumes 100× playback on its own', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?panel=replay');
    await globeReady(page);
    await page.getByTestId('replay-rate').selectOption('100');
    await page.getByTestId('replay-play').click();
    await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('playing');
    await page.reload();
    await globeReady(page);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__portos!.clock().mode)).toBe('paused');
    await expect(page.getByTestId('simulated-stamp')).toBeVisible();
  });
});
