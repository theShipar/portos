import { selectOption } from './selectOption';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectHeading, flightDone, globeReady, inspector, open, search } from './helpers';

/**
 * Phase 9 flagship journey (V2 plan): Earth → Southeast Asia → Singapore → port twin → VSL-0001 / INC-0001 →
 * follow VSL-0047 at 1×, 10×, 100× → compare → save a decision → replay. One continuous browser session.
 */
const evidenceDir = process.env.PORTOS_EVIDENCE ? 'docs/qa/v2-phase9' : null;

async function shot(page: Page, name: string) {
  const png = await page.screenshot();
  expect(png.byteLength, `${name} is not blank`).toBeGreaterThan(40_000);
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(`${evidenceDir}/${name}.png`, png);
  }
}

const scene = (page: Page, key: string) =>
  page.waitForFunction((k) => window.__portos?.director()?.activeSceneKey === k && window.__portos.director()?.phase === 'idle', key, { timeout: 30_000 });

function offCentre(page: Page) {
  return page.evaluate(() => {
    const f = window.__portos!.follow();
    return f.ship && f.centre ? Math.hypot(f.ship.x - f.centre.x, f.ship.y - f.centre.y) : Infinity;
  });
}

function measureRatio(page: Page, realMs: number) {
  return page.evaluate(async (ms) => {
    const a = { wall: performance.now(), sim: window.__portos!.clock().frameMs };
    await new Promise((r) => setTimeout(r, ms));
    const b = { wall: performance.now(), sim: window.__portos!.clock().frameMs };
    return (b.sim - a.sim) / (b.wall - a.wall);
  }, realMs);
}

test.describe('Flagship V2 journey (Phase 9)', () => {
  test.setTimeout(240_000);
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Earth → SEA → Singapore → port twin → VSL-0001 / INC-0001 → follow VSL-0047 → compare → decision → replay', async ({ page }) => {
    // 1 · Earth
    await open(page, '/ops/earth');
    await globeReady(page);
    await flightDone(page);
    await expect(page.getByTestId('simulated-stamp')).toContainText('Simulated');
    await expect(page.getByTestId('map-kpi-rail')).toContainText(/tracked · \d+ in scope/);
    await shot(page, '01-earth');

    // 2 · Southeast Asia (extruded regional scene, not a sphere zoom)
    await page.getByTestId('region-label-REG-SEA').click();
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA/);
    await scene(page, 'region3d:REG-SEA');
    await flightDone(page);
    expect(await page.evaluate(() => window.__portos!.surfaceKind())).not.toBe('globe');
    await shot(page, '02-region-sea');

    // 3 · Singapore city
    await page.getByTestId('city-label-CTY-SIN').click();
    await expect(page).toHaveURL(/\/ops\/city\/CTY-SIN/);
    await scene(page, 'city3d:CTY-SIN');
    await flightDone(page);
    await shot(page, '03-city-singapore');

    // 4 · Port twin with contextual KPIs and the compact queue
    await page.getByTestId('port-label-PRT-SIN').click();
    await expect(page).toHaveURL(/\/ops\/port\/PRT-SIN/);
    await page.waitForFunction(() => window.__portos?.twin()?.portId === 'PRT-SIN' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 });
    await flightDone(page);
    await expect(page.getByTestId('map-kpi-rail')).toContainText('Berth queue');
    await expect(page.getByTestId('port-queue')).toBeVisible();
    await expect(page.getByTestId('twin-caption')).toContainText('Simulated');
    await shot(page, '04-port-twin');

    // 5 · VSL-0001: anchored, +18 h, $24,000, case first among priorities
    await search(page, 'VSL-0001');
    await expectHeading(page, 'MV Pacific Horizon');
    await expect(page.getByTestId('port-call-eta')).toContainText('+18.0 h');
    await expect(page.getByTestId('port-call-exposure')).toContainText('$24,000');
    await expect(page.getByTestId('port-call-berth')).toContainText('unconfirmed');
    await expect(page.getByTestId('vessel-priorities').locator('[data-testid^="priority-"]').first()).toContainText('INC-0001');
    await shot(page, '05-vessel-vsl0001');

    // 6 · INC-0001 from the priority action
    await page.getByTestId('priority-incident').getByRole('button', { name: 'Investigate' }).click();
    await expectHeading(page, /Forecast ETA shift after anchorage wait/);
    await expect(page).toHaveURL(/incident=INC-0001|\/incidents\/INC-0001/);
    await shot(page, '06-incident-inc0001');

    // 7 · Follow VSL-0047 at 1×, 10× and 100×
    await page.goto('/ops/region/REG-SEA?vessel=VSL-0047&panel=replay');
    await scene(page, 'region3d:REG-SEA');
    await flightDone(page);
    await page.getByTestId('vessel-follow').click();
    await expect(page.getByTestId('follow-bar')).toContainText('MV Emerald Star 047');
    await expect.poll(() => offCentre(page), { timeout: 5_000 }).toBeLessThan(24);
    for (const rate of [1, 10, 100]) {
      await selectOption(page, page.getByTestId('replay-rate'), String(rate));
      await expect(page.getByTestId('replay-rate').locator('option:checked')).toHaveText(`Simulation ×${rate}`);
      if (!(await page.evaluate(() => window.__portos!.clock().mode === 'playing'))) await page.getByTestId('replay-play').click();
      const ratio = await measureRatio(page, 1200);
      expect(ratio, `×${rate} ratio`).toBeGreaterThan(rate * 0.85);
      expect(ratio, `×${rate} ratio`).toBeLessThan(rate * 1.15);
      expect(await offCentre(page), `centred at ×${rate}`).toBeLessThan(40);
      if (rate === 100) await shot(page, '07-follow-vsl0047-x100');
      await page.getByTestId('replay-play').click();
      await expect.poll(() => page.evaluate(() => window.__portos!.clock().mode)).toBe('paused');
    }
    await page.getByTestId('follow-stop').click();
    await page.getByTestId('replay-now').click();

    // 8 · Compare responses for VYG-0001 from the case
    await page.goto('/incidents/INC-0001');
    await expectHeading(page, /Forecast ETA shift after anchorage wait/);
    await inspector(page).getByRole('tab', { name: 'Actions' }).click();
    await page.getByTestId('open-comparison').first().click();
    const cmp = page.getByTestId('comparison');
    await expect(cmp).toBeVisible();
    const dc = page.getByTestId('decision-compare');
    await expect(dc).toBeVisible();
    expect(Number(await dc.getAttribute('data-columns'))).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('decision-compare-foot')).toContainText('not confirmed');
    await expect(cmp).toContainText('$24,000');
    await shot(page, '08-compare-vyg0001');

    // 9 · Save a decision: a local branch with baseline and simulated outcome, no external dispatch
    await cmp.locator('[data-testid^="propose-"]:enabled').first().click();
    const branch = cmp.locator('[data-testid^="branch-LOC-BR"]').first();
    await expect(branch).toBeVisible();
    await expect(branch).toContainText(/Proposed/);
    await expect(branch.getByTestId('branch-outcome')).not.toBeEmpty();
    await shot(page, '09-decision-branch');

    // 10 · Replay: the case opening, values at that time, and the saved decision as a bookmark
    await page.goto('/replay/VYG-0001');
    const rail = page.getByTestId('replay-rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('[data-testid^="replay-bookmark-"]')).not.toHaveCount(0);
    for (let i = 0; i < 12; i++) {
      if ((await page.getByTestId('replay-current').textContent())?.includes('INC-0001 opened')) break;
      await page.getByTestId('replay-prev').click();
    }
    await expect(page.getByTestId('replay-current')).toContainText('INC-0001 opened');
    await expect(page.getByTestId('replay-time')).toContainText('10:59');
    await rail.getByTestId('replay-expand').click();
    await expect.poll(async () => (await rail.boundingBox())!.height).toBeGreaterThanOrEqual(110);
    await expect(page.getByTestId('replay-histogram')).toBeVisible();
    await expect(page.getByTestId('replay-compare')).toContainText('+18.0 h');
    await expect(page.getByTestId('replay-compare')).toContainText('Option proposed');
    await shot(page, '10-replay-inc0001');
    await page.getByTestId('replay-now').click();
    await expect(page.getByTestId('simulated-stamp')).toContainText('Now');
  });
});
