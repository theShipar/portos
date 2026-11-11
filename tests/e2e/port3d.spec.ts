import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, inspector, open, openGantt } from './helpers';

const evidenceDir = process.env.PORTOS_EVIDENCE ? 'docs/qa/v2-phase5' : null;

async function evidence(page: Page, name: string) {
  const png = await page.screenshot();
  expect(png.byteLength, `${name} is not blank`).toBeGreaterThan(40_000);
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(`${evidenceDir}/${name}.png`, png);
  }
}

async function twinReady(page: Page, portId: string) {
  await page.waitForFunction((id) => window.__portos?.twin()?.portId === id && window.__portos.director()?.phase === 'idle', portId, { timeout: 30_000 });
  await flightDone(page);
}

test.describe('Port twin (spec 07)', () => {
  test('city → Singapore port twin: terminals, berths, anchorages, port vessels and the caption', async ({ page }) => {
    await open(page, '/ops/city/CTY-SIN');
    await globeReady(page);
    await page.waitForFunction(() => window.__portos?.director()?.activeSceneKey === 'city3d:CTY-SIN' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 });
    await flightDone(page);
    await page.getByTestId('port-label-PRT-SIN').click();
    await expect(page).toHaveURL(/\/ops\/port\/PRT-SIN(\?|$)/);
    await twinReady(page, 'PRT-SIN');
    expect(page.url()).not.toContain('view=');
    await expect(page.getByTestId('map-workspace')).toHaveAttribute('data-view-mode', '3d');
    const d = await page.evaluate(() => window.__portos!.director()!);
    expect(d.activeKind).toBe('port3d');
    expect(d.activeSceneKey).toBe('port3d:PRT-SIN');

    const twin = (await page.evaluate(() => window.__portos!.twin()))!;
    expect(twin.terminals).toBeGreaterThanOrEqual(2);
    expect(twin.berths).toBeGreaterThanOrEqual(6);
    expect(twin.anchorages).toBeGreaterThanOrEqual(2);
    expect(twin.cranes).toBeGreaterThan(20);
    expect(twin.containers).toBe(6000);
    expect(twin.landHeightM).toBeLessThanOrEqual(5);
    const queue = Number((await page.getByTestId('port-kpi-queue').locator('.kpi__value').innerText()).replace(/\D/g, ''));
    expect(twin.moored + queue, 'port vessels (alongside + queue)').toBeGreaterThanOrEqual(15);
    await expect(page.getByTestId('twin-caption')).toContainText('Illustrative terminal configuration');
    await expect(page.getByTestId('twin-caption')).toContainText('Simulated');
    await expect(page.getByTestId('twin-caption')).not.toContainText(/official|authentic|live/i);
    await expect(page.getByTestId('anchorage-label-ANC-SIN')).toBeVisible();

    const stats = await page.evaluate(() => window.__portos!.overlayStats()!);
    expect(stats.drawnVessels).toBeGreaterThanOrEqual(15);
    await evidence(page, '01-singapore-port-twin');
  });

  test('a berth click updates the scene, the berth card and the schedule together', async ({ page }) => {
    await open(page, '/ops/port/PRT-SIN');
    await globeReady(page);
    await twinReady(page, 'PRT-SIN');
    const pt = await page.evaluate(() => window.__portos!.berthPoint('BRH-SIN-E-3'));
    expect(pt?.visible).toBe(true);
    await page.mouse.click(pt!.x, pt!.y);
    await expect(page.getByTestId('berth-card-title')).toHaveText('East Berth 3');
    await expect.poll(() => page.evaluate(() => window.__portos!.twin()?.selected)).toBe('BRH-SIN-E-3');
    await expect(page.getByTestId('gantt-row-BRH-SIN-E-3')).toHaveClass(/gantt__row--active/);
    await expect(page.getByTestId('berth-label-BRH-SIN-E-3')).toHaveAttribute('aria-pressed', 'true');

    // Schedule row → same berth focus everywhere; the card names the overlap as not yet validated.
    await page.getByTestId('gantt-row-BRH-SIN-W-4').getByRole('button').first().click();
    await expect(page.getByTestId('berth-card-title')).toHaveText('West Berth 4');
    await expect.poll(() => page.evaluate(() => window.__portos!.twin()?.selected)).toBe('BRH-SIN-W-4');
    await expect(page.getByTestId('berth-card-conflicts')).toContainText('not yet validated');
    await flightDone(page);
    await expect(page.getByTestId('berth-label-BRH-SIN-W-4')).toBeVisible();
    await evidence(page, '02-berth-focus');

    // A bar opens the vessel; the berth stays in focus.
    const occupant = page.getByTestId('gantt-row-BRH-SIN-W-4').locator('[data-testid="gantt-bar"][data-kind="actual"]').first();
    await occupant.click();
    await expect(page).toHaveURL(/[?&]vessel=VSL-\d{4}/);
    await expect(inspector(page)).toBeVisible();
    expect(await page.evaluate(() => window.__portos!.twin()?.selected)).toBe('BRH-SIN-W-4');

    await page.getByTestId('berth-card-close').click();
    await expect(page.getByTestId('berth-card')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__portos!.twin()?.selected)).toBeNull();
  });

  test('berth schedule keeps actual, planned and forecast apart and shows the overlaps', async ({ page }) => {
    await open(page, '/ops/port/PRT-SIN');
    await globeReady(page);
    await twinReady(page, 'PRT-SIN');
    const gantt = page.getByTestId('berth-gantt');
    await expect(gantt).toBeVisible();
    await expect(gantt.getByTestId('gantt-summary')).toHaveText(/\d+ berths · \d+ occupied/);
    await openGantt(page);
    await expect(gantt).toContainText('Simulated');
    for (const kind of ['actual', 'planned', 'forecast']) expect(await gantt.locator(`[data-testid="gantt-bar"][data-kind="${kind}"]`).count(), kind).toBeGreaterThan(0);
    await expect(gantt.getByTestId('gantt-conflict')).toHaveCount(2);
    await expect(gantt.getByTestId('gantt-conflict-count')).toHaveText(/2 overlaps · not yet validated/);
    await expect(gantt.locator('[data-testid="gantt-conflict"][data-basis="planned"]')).toHaveCount(1);
    await expect(gantt.getByTestId('gantt-now')).toBeVisible();
    const styles = await gantt.evaluate((el) => {
      const pick = (k: string) => getComputedStyle(el.querySelector(`[data-kind="${k}"]`)!);
      return { actual: pick('actual').backgroundImage, planned: pick('planned').backgroundImage, forecast: pick('forecast').backgroundColor };
    });
    expect(styles.actual).toBe('none');
    expect(styles.planned).toContain('repeating-linear-gradient');
    // Translucent forecast fill (~30 % alpha); tokenized colours compute as rgba() or color(srgb … / a).
    expect(styles.forecast).toMatch(/(rgba\(.*|color\(srgb .*\/ )0\.3\d*\)/);
    await gantt.getByTestId('gantt-window-24').click();
    await expect(gantt.getByTestId('gantt-window-24')).toHaveAttribute('aria-pressed', 'true');
    await gantt.getByTestId('gantt-toggle').click();
    await expect(gantt.locator('.gantt__rows')).toHaveCount(0);
    await expect(gantt.getByTestId('gantt-conflict-count')).toBeVisible();
  });

  test('3D ↔ 2D keeps the focused berth and the replay time', async ({ page }) => {
    await open(page, '/ops/port/PRT-SIN?time=2026-11-09T10:00:00Z');
    await globeReady(page);
    await twinReady(page, 'PRT-SIN');
    await openGantt(page);
    await page.getByTestId('gantt-row-BRH-SIN-C-1').getByRole('button').first().click();
    await expect(page.getByTestId('berth-card-title')).toHaveText('Central Berth 1');
    await page.getByRole('button', { name: /^2D/ }).click();
    await expect(page).toHaveURL(/[?&]view=2d/);
    await expect(page).toHaveURL(/time=2026-11-09T10(%3A|:)00/);
    await expect(page.getByTestId('map-workspace')).toHaveAttribute('data-view-mode', '2d');
    const card = page.getByTestId('map-card');
    await expect(card).toContainText('Central Berth 1');
    await expect(card.getByTestId('map-card-next')).toBeVisible();
    await expect(page.getByTestId('gantt-row-BRH-SIN-C-1')).toHaveClass(/gantt__row--active/);
    await page.getByRole('button', { name: /^3D/ }).click();
    await expect(page.getByTestId('map-workspace')).toHaveAttribute('data-view-mode', '3d');
    await expect(page).toHaveURL(/time=2026-11-09T10(%3A|:)00/);
    await expect(page.getByTestId('berth-card-title')).toHaveText('Central Berth 1');
    expect(await page.evaluate(() => window.__portos!.twin()?.selected)).toBe('BRH-SIN-C-1');
  });

  test('Rotterdam and Genoa open procedural twins; other ports stay 2D', async ({ page }) => {
    for (const portId of ['PRT-RTM', 'PRT-GOA']) {
      await open(page, `/ops/port/${portId}`);
      await globeReady(page);
      await twinReady(page, portId);
      const t = (await page.evaluate(() => window.__portos!.twin()))!;
      expect(t.sceneKey).toBe(`port3d:${portId}`);
      expect(t.terminals).toBe(1);
      expect(t.berths).toBe(2);
      await expect(page.getByTestId('twin-caption')).toBeVisible();
      await expect(page.getByTestId('berth-gantt')).toBeVisible();
      if (portId === 'PRT-RTM') await evidence(page, '03-rotterdam-procedural');
    }
    await open(page, '/ops/port/PRT-SHA');
    await expect(page.getByTestId('map-workspace')).toHaveAttribute('data-view-mode', '2d');
    await expect(page.getByTestId('berth-gantt')).toHaveCount(0);
  });
});
