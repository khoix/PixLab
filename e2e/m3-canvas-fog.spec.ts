import { test, expect } from '@playwright/test';
import { startSectorRun, waitForPerfSamples } from './helpers';

test.describe('M3 — Canvas DPR and fog cache', () => {
  test('canvas dimensions API reports DPR capped at 2', async ({ page }) => {
    await startSectorRun(page);

    const dims = await page.evaluate(() => window.__PIXLAB_CANVAS__?.getDimensions());
    expect(dims).toBeTruthy();
    expect(dims!.dpr).toBeLessThanOrEqual(2);
    expect(dims!.bufferWidth).toBe(Math.max(1, Math.floor(dims!.logicalWidth * dims!.dpr)));
    expect(dims!.bufferHeight).toBe(Math.max(1, Math.floor(dims!.logicalHeight * dims!.dpr)));
  });

  test('fog cache blits more than rebuilds during stationary gameplay', async ({ page }) => {
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 30);

    await page.evaluate(() => window.__PIXLAB_FOG__?.resetStats());
    await page.waitForTimeout(600);

    const stats = await page.evaluate(() => window.__PIXLAB_FOG__?.getStats());
    expect(stats).toBeTruthy();
    expect(stats!.blitCount).toBeGreaterThan(0);
    expect(stats!.blitCount).toBeGreaterThan(stats!.rebuildCount);
  });
});
