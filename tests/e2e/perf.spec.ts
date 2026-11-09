import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { test, type Page } from '@playwright/test';
import { flightDone, globeReady, open } from './helpers';

/**
 * Performance probe for docs/PERF_REPORT.md. Not a pass/fail gate: it records figures to docs/perf/.
 * PERF_ANGLE=metal runs headless Chromium on the hardware GPU; the default is SwiftShader (CPU).
 */
const angle = process.env.PERF_ANGLE ?? 'swiftshader';
test.use({ launchOptions: { args: angle === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist'] } });
test.skip(!process.env.PERF, 'Set PERF=1 to run the performance probe.');
test.setTimeout(240_000);

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN;
};

async function recordFrames(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __rec: boolean };
    w.__frames = [];
    w.__rec = true;
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__rec) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrames(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __rec: boolean };
    w.__rec = false;
    return w.__frames.slice(1);
  });
}

async function heapMb(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const h = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number; totalSize: number };
  await cdp.detach();
  return +(h.usedSize / 1048576).toFixed(1);
}

test('performance probe', async ({ page, browserName }) => {
  const t0 = Date.now();
  await open(page, '/operations');
  await globeReady(page);
  await page.getByRole('combobox', { name: /Search vessels/ }).waitFor();
  const firstInteractiveMs = Date.now() - t0;
  const navTiming = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) };
  });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  const ua = await page.evaluate(() => navigator.userAgent);
  await page.waitForTimeout(1500);
  const statsEarth = await page.evaluate(() => window.__portos!.stats());
  const heapStart = await heapMb(page);

  // Frame times across a full Earth → region flight, which is when the scene renders continuously.
  await recordFrames(page);
  const s0 = Date.now();
  await page.getByTestId('region-label-REG-SEA').click();
  await flightDone(page);
  const scopeSwitchMs = Date.now() - s0;
  const flightFrames = await stopFrames(page);
  await page.waitForTimeout(800);
  const statsRegion = await page.evaluate(() => window.__portos!.stats());

  const p0 = Date.now();
  await page.getByTestId('port-label-PRT-SIN').click();
  await flightDone(page);
  const portSwitchMs = Date.now() - p0;
  await page.waitForTimeout(800);
  const statsPort = await page.evaluate(() => window.__portos!.stats());

  // Orbit drag for sustained interactive rendering.
  await page.getByRole('navigation', { name: 'Geographic scope' }).getByRole('button', { name: /Earth/ }).click();
  await globeReady(page);
  await flightDone(page);
  const canvas = page.getByTestId('map-workspace').locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await recordFrames(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 90; i++) await page.mouse.move(box.x + box.width / 2 + Math.sin(i / 10) * 220, box.y + box.height / 2 + Math.cos(i / 14) * 80, { steps: 1 });
  await page.mouse.up();
  const dragFrames = await stopFrames(page);

  // 20 scope switches (PERF_ROUND_TRIPS × 2): Earth ↔ Southeast Asia, then measure retained heap and GPU objects.
  const switchTimes: number[] = [];
  const geometriesAtEarth: number[] = [];
  const heapPerRoundTrip: number[] = [];
  const roundTrips = Number(process.env.PERF_ROUND_TRIPS ?? 10);
  for (let i = 0; i < roundTrips; i++) {
    let s = Date.now();
    await page.getByTestId('region-label-REG-SEA').click();
    await flightDone(page);
    switchTimes.push(Date.now() - s);
    s = Date.now();
    await page.getByRole('button', { name: /Up one level/ }).click();
    await flightDone(page);
    switchTimes.push(Date.now() - s);
    geometriesAtEarth.push(await page.evaluate(() => window.__portos!.stats().geometries));
    heapPerRoundTrip.push(await heapMb(page));
  }
  await page.waitForTimeout(1000);
  const heapAfter20 = await heapMb(page);
  const statsAfter20 = await page.evaluate(() => window.__portos!.stats());

  const fps = (frames: number[]) => ({
    frames: frames.length,
    p50Fps: +(1000 / pct(frames, 50)).toFixed(1),
    p5Fps: +(1000 / pct(frames, 95)).toFixed(1),
    p95FrameMs: +pct(frames, 95).toFixed(1),
  });

  const result = {
    recordedAtUtc: new Date().toISOString(),
    angle,
    device: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGb: Math.round(os.totalmem() / 1073741824), platform: `${os.platform()} ${os.release()}`, arch: os.arch() },
    browser: { name: browserName, userAgent: ua, gpu },
    viewport: page.viewportSize(),
    firstInteractiveMs,
    navTiming,
    scopeSwitchMs: { earthToRegion: scopeSwitchMs, regionToPort: portSwitchMs, repeatedP50: pct(switchTimes, 50), repeatedMax: Math.max(...switchTimes) },
    flight: fps(flightFrames),
    orbitDrag: fps(dragFrames),
    renderer: { earth: statsEarth, region: statsRegion, port: statsPort, earthAfter20Switches: statsAfter20, geometriesAtEarthPerRoundTrip: geometriesAtEarth },
    heapMb: { start: heapStart, after20Switches: heapAfter20, delta: +(heapAfter20 - heapStart).toFixed(1), perRoundTrip: heapPerRoundTrip },
  };
  mkdirSync('docs/perf', { recursive: true });
  writeFileSync(`docs/perf/perf-${angle}${roundTrips === 10 ? '' : `-${roundTrips * 2}-switches`}.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
});
