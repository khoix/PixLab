/**
 * Captures M0 performance baseline snapshots for plan.md documentation.
 * Usage: npx tsx scripts/capture-baseline.ts
 */
import { chromium } from '@playwright/test';

const PORT = 5000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function capture(viewport: { width: number; height: number; label: string }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE_URL}/?perf=1`);
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas').waitFor({ state: 'visible' });

  await page.waitForFunction(
    () => (window.__PIXLAB_PERF__?.getSnapshot().sampleCount ?? 0) >= 60,
    { timeout: 15_000 },
  );

  const snapshot = await page.evaluate(() => window.__PIXLAB_PERF__!.getSnapshot());
  await browser.close();
  return { label: viewport.label, snapshot };
}

async function main() {
  const results = await Promise.all([
    capture({ width: 1280, height: 720, label: 'desktop' }),
    capture({ width: 375, height: 667, label: 'mobile' }),
  ]);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
