// Ad-hoc screenshots of the running dev server: node scripts/dev/shots.mjs <outDir> <WxH> <path> [<path>...]
import { chromium } from '@playwright/test';

const [outDir, size, ...paths] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width, height } });
await page.addInitScript(() => {
  localStorage.removeItem('portos:workflow:v1');
  localStorage.removeItem('portos:assumptions:v1');
  localStorage.setItem('portos:preferences:v1', JSON.stringify({ userId: 'USR-005', reducedMotion: null }));
});
for (const p of paths) {
  await page.goto(`http://127.0.0.1:5173${p}`);
  await page.waitForTimeout(5000);
  const name = `${outDir}/${size}-${p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.png`;
  await page.screenshot({ path: name });
  console.log(name);
}
await browser.close();
