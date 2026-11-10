import { defineConfig, devices } from '@playwright/test';

const chromium = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } };
const TIMING_SPECS = /handoff\.spec\.ts/;

export default defineConfig({
  testDir: 'tests/e2e',
  snapshotPathTemplate: 'tests/visual/{arg}{ext}',
  timeout: 60_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: false,
  // WebGL runs on SwiftShader (CPU); more parallel browsers starve the frame loop and distort the handoff timing gate.
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: TIMING_SPECS, use: chromium },
    // Wall-clock handoff gates run after everything else, without other browsers competing for SwiftShader's CPU.
    { name: 'chromium-timing', testMatch: TIMING_SPECS, dependencies: ['chromium'], use: chromium },
  ],
  webServer: {
    command: 'npx vite build --mode e2e && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
