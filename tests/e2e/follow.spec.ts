import { selectOption } from './selectOption';
import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, open } from './helpers';

async function regionReady(page: Page) {
  await globeReady(page);
  await page.waitForFunction(() => window.__portos?.director()?.activeSceneKey === 'region3d:REG-SEA' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 });
  await flightDone(page);
}

/** Pixel distance between the followed ship and the centre of the map canvas. */
function offCentre(page: Page) {
  return page.evaluate(() => {
    const f = window.__portos!.follow();
    return f.ship && f.centre ? Math.hypot(f.ship.x - f.centre.x, f.ship.y - f.centre.y) : Infinity;
  });
}

/** Scenario ms advanced per real ms, measured inside the page from rendered frame time. */
function measureRatio(page: Page, realMs: number) {
  return page.evaluate(async (ms) => {
    const a = { wall: performance.now(), sim: window.__portos!.clock().frameMs };
    await new Promise((r) => setTimeout(r, ms));
    const b = { wall: performance.now(), sim: window.__portos!.clock().frameMs };
    return (b.sim - a.sim) / (b.wall - a.wall);
  }, realMs);
}

test.describe('Scenario clock and follow camera (specs 09–10)', () => {
  test('follow VSL-0047 at 1×, 10× and 100×: centred while it moves, ratio holds, pan releases', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0047&panel=replay');
    await regionReady(page);
    await expect(page.getByTestId('replay-rail')).toBeVisible();

    await page.getByTestId('vessel-follow').click();
    await expect(page.getByTestId('follow-bar')).toContainText('MV Emerald Star 047');
    await expect(page.getByTestId('follow-bar')).toContainText('Simulated');
    await expect.poll(() => offCentre(page), { timeout: 5_000 }).toBeLessThan(24);

    for (const rate of [1, 10, 100]) {
      await selectOption(page, page.getByTestId('replay-rate'), String(rate));
      const before = await page.evaluate(() => window.__portos!.vesselPose('VSL-0047')!);
      if (!(await page.evaluate(() => window.__portos!.clock().mode === 'playing'))) await page.getByTestId('replay-play').click();
      const ratio = await measureRatio(page, 1200);
      expect(ratio, `×${rate} ratio`).toBeGreaterThan(rate * 0.85);
      expect(ratio, `×${rate} ratio`).toBeLessThan(rate * 1.15);
      expect(await offCentre(page), `centred at ×${rate}`).toBeLessThan(40);
      await page.getByTestId('replay-play').click();
      await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('paused');
      const after = await page.evaluate(() => window.__portos!.vesselPose('VSL-0047')!);
      if (rate >= 10) expect(Math.hypot(after.lat - before.lat, after.lon - before.lon), `moves at ×${rate}`).toBeGreaterThan(0);
    }
    await expect(page.getByTestId('replay-phase')).toContainText(/Simulat/);

    // Each mode keeps the vessel framed.
    for (const mode of ['above', 'orbit', 'courseUp', 'chase']) {
      await page.getByTestId(`follow-mode-${mode}`).click();
      await expect.poll(() => page.evaluate(() => window.__portos!.follow().follow?.mode)).toBe(mode);
      await expect.poll(() => offCentre(page), { timeout: 5_000 }).toBeLessThan(24);
    }

    // A deliberate pan hands the camera back to the user.
    const c = (await page.evaluate(() => window.__portos!.follow().centre))!;
    await page.mouse.move(c.x, c.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(c.x - 260, c.y + 120, { steps: 12 });
    await page.mouse.up({ button: 'right' });
    await expect(page.getByTestId('follow-resume')).toBeVisible();
    expect(await page.evaluate(() => window.__portos!.follow().hold)).toBe('panned');
    expect(await offCentre(page)).toBeGreaterThan(60);
    await page.getByTestId('follow-resume').click();
    await expect(page.getByTestId('follow-resume')).toHaveCount(0);
    await expect.poll(() => offCentre(page), { timeout: 5_000 }).toBeLessThan(24);

    await page.getByTestId('follow-stop').click();
    await expect(page.getByTestId('follow-bar')).toHaveCount(0);
    await expect(page.getByTestId('vessel-follow')).toHaveAttribute('aria-pressed', 'false');
  });

  test('loop ranges, pause at the end, loop wraps', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?panel=replay');
    await regionReady(page);
    const rail = page.getByTestId('replay-rail');
    // Collapsed (60 px) keeps play, speed and UTC; ranges, loop and stepping live in the expanded timeline.
    await expect(rail.getByTestId('replay-range-24h')).toHaveCount(0);
    await rail.getByTestId('replay-expand').click();
    await expect(rail).toHaveAttribute('data-expanded', 'true');
    await expect(rail.getByTestId('replay-range-24h')).toHaveAttribute('aria-pressed', 'true');
    await expect(rail.getByTestId('replay-loop')).toHaveAttribute('aria-pressed', 'false');

    await rail.getByTestId('replay-range-6h').click();
    const r = await page.evaluate(() => window.__portos!.clock());
    expect(r.rangeEndMs - r.rangeStartMs).toBe(6 * 3600_000);

    // Park 40 scenario seconds before the end and play at 100×: it stops on the last instant.
    await rail.getByTestId('replay-scrubber').focus();
    await page.keyboard.press('End');
    await selectOption(page, rail.getByTestId('replay-rate'), '100');
    await rail.getByTestId('replay-step-back').click();
    await rail.getByTestId('replay-play').click();
    await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode), { timeout: 8_000 }).toBe('paused');
    const end = await page.evaluate(() => window.__portos!.clock());
    expect(end.timeMs).toBe(end.rangeEndMs);

    // With loop on it wraps to the start of the range and keeps playing.
    await rail.getByTestId('replay-loop').click();
    await expect(rail.getByTestId('replay-loop')).toHaveAttribute('aria-pressed', 'true');
    await rail.getByTestId('replay-step-back').click();
    await rail.getByTestId('replay-play').click();
    await expect.poll(() => page.evaluate(() => { const c = window.__portos!.clock(); return c.timeMs < c.rangeStartMs + 3600_000; }), { timeout: 8_000 }).toBe(true);
    expect(await page.evaluate(() => window.__portos!.clock().mode)).toBe('playing');
    await rail.getByTestId('replay-play').click();

    await rail.getByTestId('replay-range-7d').click();
    const w = await page.evaluate(() => window.__portos!.clock());
    expect(w.rangeEndMs - w.rangeStartMs).toBe(7 * 24 * 3600_000);
  });

  test('a reporting gap is drawn as an unverified track run, never interpolated', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?vessel=VSL-0059');
    await regionReady(page);
    await expect.poll(() => page.evaluate(() => window.__portos!.overlayStats()?.trackRuns ?? [])).toContain('unverified');
    const runs = await page.evaluate(() => window.__portos!.overlayStats()!.trackRuns);
    expect(runs.filter((k) => k === 'unverified')).toHaveLength(1);
  });
});
