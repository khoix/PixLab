import { test, expect } from '@playwright/test';
import { tileCenter, worldToScreen } from '../client/src/lib/game/renderer/projection';

for (const scenario of [
  { name: 'mobile', sizes: [{ width: 393, height: 727 }, { width: 393, height: 652 }, { width: 727, height: 393 }] },
  { name: 'desktop', sizes: [{ width: 1280, height: 720 }] },
  { name: 'wide desktop', dpr: 2, sizes: [{ width: 1920, height: 800 }, { width: 1440, height: 600 }] },
  { name: 'high-DPR phone', dpr: 3, sizes: [{ width: 430, height: 820 }, { width: 430, height: 745 }, { width: 820, height: 360 }, { width: 740, height: 280 }] },
]) {
test.describe(scenario.name, () => {
  test.use({ deviceScaleFactor: scenario.dpr ?? 1 });
test(`${scenario.name}: perspective rendering and picking agree through follow, pause and resize`, async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Error in draw function')) errors.push(message.text());
  });
  await page.setViewportSize(scenario.sizes[0]);
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.evaluate(() => window.__PIXLAB_TEST__!.updateSettings({ gameplayView: 'perspective' }));
  await page.waitForURL('**/play**');
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
  await page.evaluate(() => window.__PIXLAB_LEVEL__!.clearMobs());
  let anchorClient = { x: 0, y: 0 };
  let previous: { width: number; anchorY: number } | null = null;
  for (const viewport of scenario.sizes) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      window.__PIXLAB_LEVEL__!.setPlayerPos({ x: 10.25, y: 10.75 });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      return { dims: window.__PIXLAB_CANVAS__!.getDimensions(canvas),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        player: window.__PIXLAB_LEVEL__!.getPlayerPos(), rendered: window.__PIXLAB_LEVEL__!.getRenderedPerspectiveCamera() };
    });
    // ResizeObserver can see intermediate canvas heights during HUD reflow.
    // Stable anchoring deliberately remembers those; a camera reconstructed from
    // only the final dimensions does not represent the frame under the pointer.
    const camera = info.rendered!;
    expect(camera).not.toBeNull();
    expect(camera.width).toBe(info.dims.logicalWidth);
    expect(camera.height).toBe(info.dims.logicalHeight);
    expect(camera.focus).toEqual({ x: info.player.x + 0.5, y: info.player.y + 0.5 });
    expect(camera.anchor.y).toBeGreaterThan(0);
    expect(camera.anchor.y).toBeLessThanOrEqual(camera.height - 48);
    if (previous?.width === camera.width) expect(camera.anchor.y).toBe(previous.anchorY);
    previous = { width: camera.width, anchorY: camera.anchor.y };
    expect(info.dims.dpr).toBeLessThanOrEqual(2);
    anchorClient = { x: info.rect.left + camera.anchor.x * info.rect.width / camera.width,
      y: info.rect.top + camera.anchor.y * info.rect.height / camera.height };
    for (const tile of [{ x: 10, y: 10 }, { x: 11, y: 8 }]) {
      const screen = worldToScreen(camera, tileCenter(tile))!;
      const client = { x: info.rect.left + screen.x * info.rect.width / camera.width,
        y: info.rect.top + screen.y * info.rect.height / camera.height };
      expect(await page.evaluate(p => window.__PIXLAB_LEVEL__!.screenToTile(p.x, p.y), client),
        JSON.stringify({ viewport, info, anchor: camera.anchor, tile })).toEqual(tile);
    }
    // Arbitrary test teleports can put the marker behind/in a wall now. Verify
    // the live voxel pass rather than requiring the marker to ignore occlusion.
    const world = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getWorldRenderStats());
    expect(world.walls).toBeGreaterThan(0);
    expect(world.faces).toBeGreaterThan(world.walls);
    await page.screenshot({ path: testInfo.outputPath(`viewport-${viewport.width}x${viewport.height}.png`) });
  }
  await page.getByTestId('game-menu-button').click();
  const pickedWhilePaused = await page.evaluate(p =>
    window.__PIXLAB_LEVEL__!.screenToTile(p.x, p.y), anchorClient);
  expect(pickedWhilePaused).toEqual({ x: 10, y: 11 });
  const paused = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getRenderedPerspectiveCamera()!);
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: viewport.height - 40 });
  // A resize while paused still redraws. Browser chrome must not move the anchor
  // unless the existing bottom-clearance clamp requires it.
  await expect.poll(() => page.evaluate(() => {
    const camera = window.__PIXLAB_LEVEL__!.getRenderedPerspectiveCamera();
    const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
    return camera?.height === window.__PIXLAB_CANVAS__!.getDimensions(canvas).logicalHeight;
  })).toBe(true);
  const afterPauseResize = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getRenderedPerspectiveCamera()!);
  expect(afterPauseResize.anchor.y).toBe(Math.min(paused.anchor.y, afterPauseResize.height - 48));
  expect(afterPauseResize.focus).toEqual(paused.focus);
  expect(errors).toEqual([]);
});
});
}
