import { expect, test, type Page } from '@playwright/test';
import { globeReady, inspector, open } from './helpers';

interface WorkshopHook {
  stats(): {
    mode: string;
    exploded: boolean;
    explode: number;
    modelKey: string | null;
    archetype: string | null;
    slots: number;
    filled: number;
    compartments: number;
    selected: string | null;
    hold: number | null;
    hullOpacity: number;
    cameraDistance: number;
    cameraBehind: number;
    drawCalls: number;
    triangles: number;
    frames: number;
  };
  project(id: string): { x: number; y: number } | null;
}

const ws = (page: Page) => page.evaluate(() => (window as unknown as { __portosWorkshop: WorkshopHook }).__portosWorkshop.stats());

/** VSL-0255 alongside BRH-SIN-W-3 before its four quay cranes start at 11:50Z (520 boxes on board). */
const BEFORE = '2026-11-09T11:40:00Z';
const FLAG = '/ops/port/PRT-SIN?vessel=VSL-0255';

async function ready(page: Page, path: string) {
  await open(page, path);
  await globeReady(page);
  await expect(inspector(page)).toBeVisible();
  await expect(page.getByTestId('vessel-workshop')).toHaveAttribute('data-ready', '1', { timeout: 20_000 });
  await expect(page.getByTestId('cargo-summary')).toBeVisible({ timeout: 20_000 });
}

/** V3 Gate 5: cargo fixtures, workshop scene, cruise progress and the slot → manifest drill-down. */
test.describe('V3 vessel cargo workshop (Gate 5)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL checks run on Chromium');
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

  test('sidebar order: identity, cruise progress, cargo summary, then the slot picker', async ({ page }) => {
    await ready(page, `${FLAG}&time=${BEFORE}`);
    const ids = await page
      .getByTestId('vessel-overview-v3')
      .locator(':scope > [data-testid]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(ids.slice(0, 4)).toEqual(['vessel-identity', 'route-progress', 'cargo-summary', 'cargo-picker']);
    // Alongside between voyages: the progress slot stays in place and says why it is empty.
    await expect(page.getByTestId('route-progress')).toHaveAttribute('data-basis', 'none');
    await expect(page.getByTestId('cargo-summary')).toHaveAttribute('data-archetype', 'container');
    await expect(page.getByTestId('cargo-head-on-board')).toHaveText('520 boxes');
    await expect(page.getByTestId('cargo-summary')).toContainText('380 crane moves planned');
    await expect(page.getByTestId('vessel-workshop').getByText('Simulated')).toBeVisible();
    const s = await ws(page);
    expect(s).toMatchObject({ modelKey: 'container', archetype: 'container', slots: 800, filled: 520 });
  });

  test('VSL-0001 waits at anchor: a static 200-box stow and no crane plan until a berth is confirmed', async ({ page }) => {
    await ready(page, '/ops/port/PRT-SIN?vessel=VSL-0001&time=2026-11-10T16:00:00Z');
    await expect(page.getByTestId('route-progress')).toContainText(/Singapore|Rotterdam/);
    await expect(page.getByTestId('cargo-head-on-board')).toHaveText('200 boxes');
    await expect(page.getByTestId('cargo-summary')).toContainText('no berth confirmed');
    expect((await ws(page)).filled).toBe(200);
  });

  test('bay grid → slot → manifest, persisted in the URL and mirrored in 3D', async ({ page }) => {
    await ready(page, `${FLAG}&time=${BEFORE}`);
    await page.getByTestId('cargo-bay').selectOption('18');
    await page.getByTestId('slot-180284').click();
    await expect(page).toHaveURL(/[?&]cargo=180284/);
    await expect(page.getByTestId('cargo-detail')).toHaveAttribute('data-focus', '180284');
    await expect(page.getByTestId('cargo-manifest')).toContainText('PRSU 102184 0');
    await expect(page.getByTestId('cargo-location')).toContainText('On board');
    await expect.poll(async () => (await ws(page)).selected).toBe('180284');

    // One tab stop for the whole grid; arrows move along the tier, Enter picks.
    const grid = page.getByTestId('cargo-bay-grid');
    await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
    await page.getByTestId('slot-180284').focus();
    await page.keyboard.press('ArrowRight');
    const next = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    // Rows read port → starboard from aft (… 04 02 01 03 …), so row 02's right neighbour is row 01.
    expect(next).toBe('slot-180184');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`[?&]cargo=${next!.slice(5)}`));
    await page.getByTestId(next!).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]cargo=180284/);

    // Reload keeps the drill-down.
    await page.reload();
    await expect(page.getByTestId('cargo-manifest')).toContainText('PRSU 102184 0', { timeout: 20_000 });
  });

  test('camera rigs: chase sits 1.3 ship lengths astern, dragging hands over to free', async ({ page }) => {
    await ready(page, `${FLAG}&time=${BEFORE}`);
    const shop = page.getByTestId('vessel-workshop');
    await page.getByTestId('workshop-cam-chase').click();
    await expect(shop).toHaveAttribute('data-mode', 'chase');
    await expect(page).toHaveURL(/[?&]cam=chase/);
    await expect.poll(async () => (await ws(page)).cameraBehind, { timeout: 5000 }).toBeCloseTo(1.3, 2);

    await page.getByTestId('workshop-cam-above').click();
    await expect(shop).toHaveAttribute('data-mode', 'above');
    await expect.poll(async () => Math.abs((await ws(page)).cameraBehind), { timeout: 5000 }).toBeLessThan(0.01);

    for (const m of ['orbit', 'deck'] as const) {
      await page.getByTestId(`workshop-cam-${m}`).click();
      await expect(shop).toHaveAttribute('data-mode', m);
    }

    const box = (await shop.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 6 });
    await page.mouse.up();
    await expect(shop).toHaveAttribute('data-mode', 'free');
    await expect(page).not.toHaveURL(/[?&]cam=/);
  });

  test('hold filter and exploded view ghost the hull and dim the other holds', async ({ page }) => {
    await ready(page, `${FLAG}&time=${BEFORE}`);
    await page.getByTestId('cargo-hold').selectOption('3');
    await expect(page).toHaveURL(/[?&]hold=3/);
    await expect(page.getByTestId('cargo-bay')).toHaveValue('18');
    await expect.poll(async () => (await ws(page)).hold).toBe(3);

    await page.getByTestId('workshop-explode').click();
    await expect(page.getByTestId('vessel-workshop')).toHaveAttribute('data-exploded', '1');
    await expect(page).toHaveURL(/[?&]explode=1/);
    await expect.poll(async () => (await ws(page)).explode, { timeout: 5000 }).toBeCloseTo(1, 2);
    expect((await ws(page)).hullOpacity).toBeLessThan(0.3);
  });

  test('picking a box in the 3D preview opens the same manifest as the grid', async ({ page }) => {
    await ready(page, `${FLAG}&time=${BEFORE}&cam=above`);
    const shop = page.getByTestId('vessel-workshop');
    await shop.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await ws(page)).mode).toBe('above');
    await page.waitForTimeout(300);
    const p = await page.evaluate(() => (window as unknown as { __portosWorkshop: WorkshopHook }).__portosWorkshop.project('180284'));
    expect(p).not.toBeNull();
    await page.mouse.click(p!.x, p!.y);
    await expect(page).toHaveURL(/[?&]cargo=180284/);
    await expect(page.getByTestId('cargo-manifest')).toContainText('PRSU 102184 0');
  });

  test('restricted cargo hides commodity parties behind the role', async ({ page }) => {
    await ready(page, `${FLAG}&time=${BEFORE}&cargo=420202`);
    const card = page.getByTestId('cargo-manifest');
    await expect(card).toContainText('Restricted');
    await expect(card).toContainText('Restricted · cargo manager role');
    await expect(card).not.toContainText('Simulated Shipper');
  });

  test('a time scrub moves the box off the ship: slot empties, boxes on board drop', async ({ page }) => {
    // One minute before QC-SIN-W3-2 lifts 180284 at 11:50Z, then ten minutes after.
    await ready(page, `${FLAG}&cargo=180284&time=2026-11-09T11:49:00Z`);
    await expect(page.getByTestId('cargo-manifest')).toContainText('PRSU 102184 0');
    const before = (await ws(page)).filled;
    expect(before).toBe(520);

    await ready(page, `${FLAG}&cargo=180284&time=2026-11-09T12:00:00Z`);
    await expect(page.getByTestId('cargo-empty-slot')).toBeVisible();
    await expect.poll(async () => (await ws(page)).filled).toBeLessThan(before);
  });

  test('LNG carrier: tanks instead of slots; a container slot in the URL is refused with a notice', async ({ page }) => {
    await ready(page, '/ops/region/REG-SEA?vessel=VSL-0047');
    await expect(page.getByTestId('cargo-summary')).toHaveAttribute('data-archetype', 'lng');
    await expect(page.locator('[data-testid^="compartment-CMP-0047-T"]')).toHaveCount(4);
    await page.getByTestId('compartment-CMP-0047-T2').click();
    await expect(page).toHaveURL(/[?&]cargo=CMP-0047-T2/);
    await expect(page.getByTestId('cargo-detail')).toHaveAttribute('data-focus', 'CMP-0047-T2');
    await expect.poll(async () => (await ws(page)).selected).toBe('CMP-0047-T2');
    expect(await ws(page)).toMatchObject({ archetype: 'lng', modelKey: 'gas', compartments: 4, slots: 0 });

    await ready(page, '/ops/region/REG-SEA?vessel=VSL-0047&cargo=180182');
    await expect(page.getByText(/180182 is not part of .*cargo plan/)).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]cargo=/);
    await expect(page.getByTestId('cargo-detail')).toHaveCount(0);
  });

  for (const q of ['v3ShipPreview=0', 'v3=0']) {
    test(`\`?${q}\` restores the V2 vessel preview`, async ({ page }) => {
      await open(page, `${FLAG}&${q}`);
      await globeReady(page);
      await expect(inspector(page).getByTestId('vessel-preview')).toBeVisible();
      await expect(page.getByTestId('vessel-workshop')).toHaveCount(0);
      await expect(page.getByTestId('cargo-summary')).toHaveCount(0);
    });
  }
});
