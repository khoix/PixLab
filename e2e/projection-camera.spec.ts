import { test, expect } from '@playwright/test';
import { createPerspectiveCamera, tileCenter, worldToScreen } from '../client/src/lib/game/renderer/projection';
import { trackStableViewport, type StableViewport } from '../client/src/lib/game/renderer/cameraAnchor';

for (const scenario of [
  { name: 'mobile', sizes: [{ width: 393, height: 727 }, { width: 393, height: 652 }, { width: 727, height: 393 }] },
  { name: 'desktop', sizes: [{ width: 1280, height: 720 }] },
]) {
test(`${scenario.name}: perspective rendering and picking agree through follow, pause and resize`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Error in draw function')) errors.push(message.text());
  });
  await page.setViewportSize(scenario.sizes[0]);
  await page.goto('/?perspective=1');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
  await page.evaluate(() => window.__PIXLAB_LEVEL__!.clearMobs());
  let stable: StableViewport | null = null;
  let anchorClient = { x: 0, y: 0 };
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
        player: window.__PIXLAB_LEVEL__!.getPlayerPos() };
    });
    stable = trackStableViewport(stable, info.dims.logicalWidth, info.dims.logicalHeight);
    const camera = createPerspectiveCamera({ player: info.player, width: info.dims.logicalWidth,
      height: info.dims.logicalHeight, stableHeight: stable.height,
      isMobile: info.dims.logicalWidth < 768 || viewport.width < 768, tileSize: 32 });
    anchorClient = { x: info.rect.left + camera.anchor.x * info.rect.width / camera.width,
      y: info.rect.top + camera.anchor.y * info.rect.height / camera.height };
    for (const tile of [{ x: 10, y: 10 }, { x: 11, y: 8 }]) {
      const screen = worldToScreen(camera, tileCenter(tile))!;
      const client = { x: info.rect.left + screen.x * info.rect.width / camera.width,
        y: info.rect.top + screen.y * info.rect.height / camera.height };
      expect(await page.evaluate(p => window.__PIXLAB_LEVEL__!.screenToTile(p.x, p.y), client),
        JSON.stringify({ viewport, info, stable, anchor: camera.anchor, tile })).toEqual(tile);
    }
    // The cyan player marker proves the diagnostic pass actually rendered.
    const pixel = await page.evaluate(anchor => {
      const c = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
      const d = window.__PIXLAB_CANVAS__!.getDimensions(c).dpr;
      return [...c.getContext('2d')!.getImageData(Math.floor(anchor.x * d), Math.floor(anchor.y * d), 1, 1).data];
    }, camera.anchor);
    expect(pixel.slice(0, 3)).toEqual([5, 217, 232]);
  }
  await page.getByTestId('game-menu-button').click();
  const pickedWhilePaused = await page.evaluate(p =>
    window.__PIXLAB_LEVEL__!.screenToTile(p.x, p.y), anchorClient);
  expect(pickedWhilePaused).toEqual({ x: 10, y: 11 });
  expect(errors).toEqual([]);
});
}
