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

  // Fog key is "w:h:dpr:centerX:centerY:radius"; the fog is centred on the player.
  const readPlayerAnchor = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
      const dims = window.__PIXLAB_CANVAS__!.getDimensions(canvas);
      const [, , , centerX, centerY] = window.__PIXLAB_FOG__!.getStats().lastKey.split(':').map(Number);
      return { dims, centerX, centerY };
    });

  test('mobile: player (fog centre) sits 7% above the vertical middle of the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startSectorRun(page);
    await page.waitForTimeout(300);

    // The fog key stores rounded centres, so allow 1px.
    const info = await readPlayerAnchor(page);
    expect(Math.abs(info.centerX - info.dims.logicalWidth / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.centerY - info.dims.logicalHeight * 0.43)).toBeLessThanOrEqual(1);
    expect(info.centerY).toBeLessThan(info.dims.logicalHeight / 2 - info.dims.logicalHeight * 0.06);
  });

  test('desktop: player (fog centre) stays dead-centre', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await startSectorRun(page);
    await page.waitForTimeout(300);

    const info = await readPlayerAnchor(page);
    expect(Math.abs(info.centerX - info.dims.logicalWidth / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.centerY - info.dims.logicalHeight / 2)).toBeLessThanOrEqual(1);
  });
});

test.describe('M2/M3 — mobile backing-store pixel budget', () => {
  test.describe('large high-DPR phone', () => {
    test.use({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });

    test('backing store is capped to the mobile pixel budget', async ({ page }) => {
      await startSectorRun(page);

      const info = await page.evaluate(() => {
        const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
        const dims = window.__PIXLAB_CANVAS__!.getDimensions(canvas);
        return {
          dims,
          budget: window.__PIXLAB_CANVAS__!.mobileMaxBufferPixels,
          bufferPixels: canvas.width * canvas.height,
        };
      });

      expect(info.bufferPixels).toBeLessThanOrEqual(info.budget);
      expect(info.dims.dpr).toBeLessThan(2);
      expect(info.dims.dpr).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('compact phone', () => {
    test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });

    test('small viewports keep (nearly) full DPR under the budget', async ({ page }) => {
      await startSectorRun(page);

      const info = await page.evaluate(() => {
        const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
        const dims = window.__PIXLAB_CANVAS__!.getDimensions(canvas);
        return {
          dims,
          budget: window.__PIXLAB_CANVAS__!.mobileMaxBufferPixels,
          bufferPixels: canvas.width * canvas.height,
        };
      });

      expect(info.bufferPixels).toBeLessThanOrEqual(info.budget);
      expect(info.dims.dpr).toBeGreaterThan(1.9);
    });
  });

  test.describe('high-DPR desktop', () => {
    test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });

    test('desktop viewports are not budget-capped', async ({ page }) => {
      await startSectorRun(page);

      const info = await page.evaluate(() => {
        const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
        const dims = window.__PIXLAB_CANVAS__!.getDimensions(canvas);
        return {
          dims,
          budget: window.__PIXLAB_CANVAS__!.mobileMaxBufferPixels,
          bufferPixels: canvas.width * canvas.height,
        };
      });

      expect(info.dims.dpr).toBe(2);
      expect(info.bufferPixels).toBeGreaterThan(info.budget);
    });
  });
});
