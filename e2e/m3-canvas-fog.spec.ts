import { test, expect } from '@playwright/test';
import { startSectorRun, waitForPerfSamples } from './helpers';

test.describe('M3 — Canvas DPR and fog cache', () => {
  test('canvas dimensions API reports DPR capped at 2', async ({ page }) => {
    await startSectorRun(page);

    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
      const dims = window.__PIXLAB_CANVAS__!.getDimensions(canvas);
      return {
        dims,
        bufferWidth: canvas.width,
        bufferHeight: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      };
    });

    expect(info.dims.dpr).toBeLessThanOrEqual(2);
    expect(info.dims.logicalWidth).toBeGreaterThan(0);
    expect(info.dims.logicalHeight).toBeGreaterThan(0);
    expect(info.bufferWidth).toBe(Math.max(1, Math.floor(info.dims.logicalWidth * info.dims.dpr)));
    expect(info.bufferHeight).toBe(Math.max(1, Math.floor(info.dims.logicalHeight * info.dims.dpr)));
    expect(info.dims.logicalWidth).toBeLessThanOrEqual(info.clientWidth + 1);
    expect(info.dims.logicalHeight).toBeLessThanOrEqual(info.clientHeight + 1);
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
