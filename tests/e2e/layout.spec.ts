import { expect, test, type Page } from '@playwright/test';
import { flightDone, globeReady, open } from './helpers';

/**
 * Phase 8 gate (V2 spec 13): with the inspector closed at 1440×900 the map keeps ≥ 80% of the workspace.
 * Coverage is the union of opaque chrome panels (backgrounds with alpha ≥ 0.5) sampled on an 8 px grid; map content
 * itself (canvas, scene labels and markers that sit on the map) is not chrome.
 */
async function chromeCoverage(page: Page) {
  return page.evaluate(() => {
    const ws = document.querySelector('main.workspace') as HTMLElement;
    const W = ws.getBoundingClientRect();
    const opaque = (el: Element) => {
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const parts = m[1].split(',').map((x) => parseFloat(x));
      return (parts[3] ?? 1) >= 0.5;
    };
    const rects: { r: DOMRect; name: string }[] = [];
    for (const el of ws.querySelectorAll('*')) {
      if (el instanceof HTMLCanvasElement || el.closest('[data-map-content]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (!opaque(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 64 || r.width * r.height > W.width * W.height * 0.9) continue;
      const name = (el.getAttribute('data-testid') ?? el.className.toString().split(' ')[0]) || el.tagName.toLowerCase();
      rects.push({ r, name });
    }
    const STEP = 8;
    let covered = 0;
    let total = 0;
    const hits = new Map<string, number>();
    for (let y = W.top + STEP / 2; y < W.bottom; y += STEP) {
      for (let x = W.left + STEP / 2; x < W.right; x += STEP) {
        total++;
        const hit = rects.find(({ r }) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
        if (hit) {
          covered++;
          hits.set(hit.name, (hits.get(hit.name) ?? 0) + 1);
        }
      }
    }
    const top = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => `${n}:${((c / total) * 100).toFixed(1)}%`);
    return { share: 1 - covered / total, top };
  });
}

test.describe('Phase 8 · map-first layout at 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const s of [
    { name: 'earth', path: '/', ready: async (page: Page) => globeReady(page) },
    { name: 'region', path: '/ops/region/REG-SEA', ready: async (page: Page) => { await globeReady(page); await page.waitForFunction(() => window.__portos?.director()?.phase === 'idle', null, { timeout: 30_000 }); } },
    { name: 'port', path: '/ops/port/PRT-SIN', ready: async (page: Page) => { await globeReady(page); await page.waitForFunction(() => window.__portos?.twin()?.portId === 'PRT-SIN' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 }); } },
  ]) {
    test(`${s.name}: map keeps ≥ 80% of the workspace with the inspector closed`, async ({ page }) => {
      await open(page, s.path);
      await s.ready(page);
      await flightDone(page);
      await expect(page.locator('[data-testid="inspector"]')).toHaveCount(0);
      const { share, top } = await chromeCoverage(page);
      test.info().annotations.push({ type: 'map-share', description: `${(share * 100).toFixed(1)}% · ${top.join(', ')}` });
      expect(share, `map share ${(share * 100).toFixed(1)}% (chrome: ${top.join(', ')})`).toBeGreaterThanOrEqual(0.8);
    });
  }

  test('density caps: ribbon ≤ 3 cases, KPI rail ≤ 4 values', async ({ page }) => {
    await open(page, '/');
    await globeReady(page);
    expect(await page.locator('[data-testid^="queue-case-"]').count()).toBeLessThanOrEqual(3);
    expect(await page.getByTestId('map-kpi-rail').locator('.kpi').count()).toBeLessThanOrEqual(4);
    await expect(page.getByTestId('map-kpi-rail')).toContainText(/\d+ tracked · \d+ in scope|tracked · \d+ in scope/);
  });

  test('replay timeline: 54–66 px collapsed, 90–130 px expanded, "Simulation ×" speed and UTC always visible', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA?panel=replay');
    await globeReady(page);
    const rail = page.getByTestId('replay-rail');
    await expect(rail).toBeVisible();
    const collapsed = (await rail.boundingBox())!.height;
    expect(collapsed).toBeGreaterThanOrEqual(54);
    expect(collapsed).toBeLessThanOrEqual(66);
    await expect(page.getByTestId('replay-rate').locator('option:checked')).toHaveText(/^Simulation ×\d+$/);
    await expect(page.getByTestId('replay-time')).toContainText('UTC');
    await rail.getByTestId('replay-expand').click();
    await expect.poll(async () => (await rail.boundingBox())!.height).toBeGreaterThanOrEqual(90);
    const expanded = (await rail.boundingBox())!.height;
    expect(expanded).toBeLessThanOrEqual(130);
    await expect(page.getByTestId('replay-histogram')).toBeVisible();
    await expect(page.getByTestId('replay-rate')).toBeVisible();
    await expect(page.getByTestId('replay-time')).toBeVisible();

    // Away from Now the compare panel joins on the right; every row still fits inside the expanded height.
    await rail.getByTestId('replay-prev').click();
    await expect(page.getByTestId('replay-compare')).toBeVisible();
    const box = (await rail.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(130);
    for (const id of ['replay-histogram', 'replay-range-24h', 'replay-loop', 'replay-follow', 'replay-now', 'replay-time']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.y + b.height, `${id} inside the timeline`).toBeLessThanOrEqual(box.y + box.height + 0.5);
      expect(b.y, `${id} inside the timeline`).toBeGreaterThanOrEqual(box.y - 0.5);
    }
  });

  test('port scope with replay open: queue, HUD, schedule, rail and legend never overlap', async ({ page }) => {
    await open(page, '/ops/port/PRT-SIN?panel=replay');
    await globeReady(page);
    await page.waitForFunction(() => window.__portos?.twin()?.portId === 'PRT-SIN' && window.__portos.director()?.phase === 'idle', null, { timeout: 30_000 });
    await flightDone(page);
    const ids = ['port-queue', 'map-kpi-rail', 'planar-hud', 'berth-gantt', 'replay-rail', 'map-legend'];
    for (const id of ids) await expect(page.getByTestId(id).first()).toBeVisible();
    const boxes = await Promise.all(ids.map(async (id) => ({ id, b: (await page.getByTestId(id).first().boundingBox())! })));
    const overlaps: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b;
        const b = boxes[j].b;
        const ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (ix > 1 && iy > 1) overlaps.push(`${boxes[i].id} × ${boxes[j].id}`);
      }
    expect(overlaps).toEqual([]);
  });

  test('layer palette groups toggle their layers; no dead controls', async ({ page }) => {
    await open(page, '/ops/region/REG-SEA');
    await globeReady(page);
    const weather = page.getByTestId('layer-group-weather');
    await expect(weather).toHaveAttribute('aria-pressed', 'true');
    await weather.click();
    await expect(weather).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => new URL(location.href).searchParams.get('layers') ?? '')).not.toContain('weather');
    await weather.click();
    await expect(weather).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('layer-toggle').click();
    for (const g of ['traffic', 'ports', 'weather', 'risk', 'plans']) await expect(page.getByTestId(`layer-panel-group-${g}`)).toBeVisible();
    await expect(page.getByTestId('layer-panel')).toContainText('Simulated');
  });
});
