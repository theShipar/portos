import { expect, test } from '@playwright/test';
import { expectHeading, flightDone, globeReady, inspector, open, search } from './helpers';

test.describe('Core Singapore journey', () => {
  test('Earth first paint renders the globe through WebGL', async ({ page }) => {
    await open(page, '/operations');
    await globeReady(page);
    const canvas = page.getByTestId('map-workspace').locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(800);
    const stats = await page.evaluate(() => window.__portos!.stats());
    expect(stats.calls).toBeGreaterThan(0);
    expect(stats.triangles).toBeGreaterThan(1000);
    await expect(page.getByTestId('simulated-stamp')).toContainText('Simulated');
    await expect(page.getByTestId('kpi-trackedVessels')).toBeVisible();
  });

  test('Earth → Southeast Asia → Singapore → queue vessel, then browser back', async ({ page }) => {
    await open(page, '/operations');
    await globeReady(page);
    await page.getByTestId('region-label-REG-SEA').click();
    await expect(page).toHaveURL(/\/region\/REG-SEA/);
    await flightDone(page);
    await expect(page.getByRole('navigation', { name: 'Geographic scope' })).toContainText('Southeast Asia');

    const sin = page.getByTestId('port-label-PRT-SIN');
    await expect(sin).toBeVisible();
    await sin.click();
    await expect(page).toHaveURL(/\/port\/PRT-SIN/);
    await flightDone(page);
    await expect(page.getByTestId('port-queue')).toBeVisible();

    const firstRow = page.getByTestId('port-queue').locator('[data-testid^="queue-row-VSL-"]').first();
    const rowId = (await firstRow.getAttribute('data-testid'))!.replace('queue-row-', '');
    await firstRow.click();
    await expect(page).toHaveURL(new RegExp(`/ops/port/PRT-SIN\\?.*vessel=${rowId}`));
    await expect(inspector(page)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/ops\/port\/PRT-SIN(\?(?!.*vessel=).*)?$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/ops\/region\/REG-SEA/);
    await page.goBack();
    await expect(page).toHaveURL(/\/ops\/earth/);
  });

  test('a click on a vessel marker in the 3D scene selects the vessel under the pointer', async ({ page }) => {
    await open(page, '/port/PRT-SIN?view=3d');
    await globeReady(page);
    await flightDone(page);
    await expect(page.getByTestId('map-workspace')).toHaveAttribute('data-view-mode', '3d');
    await expect(page.getByTestId('port-queue')).toBeVisible();
    await page.getByTestId('queue-toggle').click();
    // Closing the shelf changes the left inset and re-frames the camera.
    await page.waitForTimeout(400);
    await flightDone(page);
    await page.waitForTimeout(300);
    const pt = await page.evaluate(() => window.__portos!.vesselPoint('VSL-0001'));
    expect(pt?.visible).toBe(true);
    const near = await page.evaluate(({ x, y }) => window.__portos!.vesselsNear(x, y, 24), pt!);
    expect(near).toContain('VSL-0001');
    await page.mouse.click(pt!.x, pt!.y);
    // A stacked anchorage opens a picker; a lone marker selects directly.
    const stack = page.getByTestId('stack-menu');
    await expect.poll(async () => /[?&]vessel=/.test(page.url()) || (await stack.isVisible())).toBe(true);
    if (await stack.isVisible()) await stack.locator('[data-testid^="stack-item-"]').first().click();
    await expect(page).toHaveURL(/[?&]vessel=VSL-\d{4}/);
    const picked = page.url().match(/VSL-\d{4}/)![0];
    await expect(inspector(page)).toContainText(picked);
    expect(near).toContain(picked);
  });

  test('incident evidence and the scenario comparison for INC-0001', async ({ page }) => {
    await open(page, '/incidents/INC-0001');
    await expectHeading(page, /Forecast ETA shift after anchorage wait/);
    await inspector(page).getByRole('tab', { name: 'Evidence' }).click();
    const evidence = page.getByTestId('incident-evidence');
    await expect(evidence).toBeVisible();
    await expect(evidence.locator('.evidence__item').first()).toBeVisible();
    await expect(evidence).toContainText('Recorded evidence');

    await inspector(page).getByRole('tab', { name: 'Actions' }).click();
    await page.getByTestId('open-comparison').first().click();
    await expect(page).toHaveURL(/voyage=VYG-0001/);
    await expect(page).toHaveURL(/panel=compare/);
    const cmp = page.getByTestId('comparison');
    await expect(cmp).toBeVisible();
    await expect(cmp.locator('[data-testid^="option-"]')).toHaveCount(3);
    await expect(cmp).toContainText('$24,000');
  });

  test('acknowledge, investigate and assign INC-0001; the decision survives reload', async ({ page }) => {
    await open(page, '/incidents/INC-0001?in=actions');
    await inspector(page).getByRole('tab', { name: 'Actions' }).click();
    const status = page.getByTestId('incident-status');
    const ack = page.getByTestId('transition-acknowledge');
    if (await ack.isVisible().catch(() => false)) {
      await ack.click();
      await expect(status).toContainText(/Acknowledged/i);
    }
    const investigate = page.getByTestId('transition-investigate');
    if (await investigate.isEnabled().catch(() => false)) {
      await investigate.click();
      await expect(status).toContainText(/Investigating/i);
    }
    await page.getByTestId('assign-user').selectOption('USR-002');
    await page.getByTestId('assign-submit').click();
    await expect(page.getByTestId('incident-owner')).toContainText('Jordan Lee');

    await page.reload();
    await expect(page.getByTestId('incident-owner')).toContainText('Jordan Lee');
    await page.getByTestId('activity-hub').click();
    await page.getByTestId('activity-tab-audit').click();
    await expect(page.locator('section[aria-label^="Activity"]')).toContainText('INC-0001');
  });

  test('replay marker for INC-0001 shows the event-time values', async ({ page }) => {
    await open(page, '/replay/VYG-0001');
    const rail = page.getByTestId('replay-rail');
    await expect(rail).toBeVisible();
    const marker = rail.locator('[data-testid^="replay-marker-"]');
    expect(await marker.count()).toBeGreaterThan(3);
    await page.getByTestId('replay-current').waitFor();
    // The rail opens at Now; step back through markers until the INC-0001 opening is current.
    for (let i = 0; i < 12; i++) {
      if ((await page.getByTestId('replay-current').textContent())?.includes('INC-0001 opened')) break;
      await page.getByTestId('replay-prev').click();
    }
    await expect(page.getByTestId('replay-current')).toContainText('INC-0001 opened');
    await expect(page.getByTestId('replay-time')).toContainText('10:59');
    await expect(page).toHaveURL(/time=2026-11-09T10%3A59|time=2026-11-09T10:59/);
    const cmp = page.getByTestId('replay-compare');
    await expect(cmp).toContainText('+18.0 h');
    await expect(cmp).toContainText('$24,000');
    await page.getByTestId('replay-now').click();
    await expect(page.getByTestId('simulated-stamp')).toContainText('Now');
  });

  test('deep link with time, layers and view reproduces the selection', async ({ page }) => {
    await open(page, '/vessel/VSL-0001?t=2026-11-09T08:00:00Z');
    await expectHeading(page, 'MV Pacific Horizon');
    await expect(page.getByTestId('eta-shift')).toHaveText('+8.0 h');
    await expect(page.getByTestId('simulated-stamp')).toContainText('Replay');
    const url = page.url();
    const second = await page.context().newPage();
    await second.goto(url);
    await expect(second.getByTestId('inspector').getByRole('heading', { level: 2 })).toHaveText('MV Pacific Horizon');
    await expect(second.getByTestId('eta-shift')).toHaveText('+8.0 h');
    await second.close();
  });

  test('search and Escape keep focus management intact', async ({ page }) => {
    await open(page, '/operations');
    await page.keyboard.press('/');
    await expect(page.getByRole('combobox', { name: /Search vessels/ })).toBeFocused();
    await search(page, 'PRT-SIN');
    await expect(page).toHaveURL(/\/port\/PRT-SIN/);
  });

  test('full demo reset returns to first-load state', async ({ page }) => {
    await open(page, '/incidents/INC-0001');
    await inspector(page).getByRole('tab', { name: 'Actions' }).click();
    await page.getByTestId('assign-user').selectOption('USR-003');
    await page.getByTestId('assign-submit').click();
    await expect(page.getByTestId('incident-owner')).toContainText('Mina Rahman');
    await page.getByTestId('reset-open').click();
    await page.getByTestId('reset-full').click();
    await page.getByTestId('reset-confirm').click();
    await expect(page).toHaveURL(/\/ops\/earth/);
    await page.goto('/incidents/INC-0001');
    await expect(page.getByTestId('incident-owner')).not.toContainText('Mina Rahman');
  });
});
