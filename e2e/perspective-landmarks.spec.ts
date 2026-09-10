import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('projected portal taps select the visible ground tile and teleport only on request', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 727 });
  await page.goto('/?perspective=1');
  await page.getByTestId('start-run-button').click();
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor();
  const portal = await page.evaluate(() => {
    const api = window.__PIXLAB_LEVEL__!; api.clearMobs(); api.clearPortals();
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) {
      if (api.isFloor(x, y) && api.spawnPortal({ x, y })) { api.setPlayerPos({ x, y }); return { x, y }; }
    }
    return null;
  });
  expect(portal).not.toBeNull();
  await expect(page.getByTestId('portal-prompt')).toBeVisible();
  expect(await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerPos())).toEqual(portal);
  const result = await page.evaluate(async () => {
    const { createPerspectiveCamera, worldToScreen, tileCenter } = await import('/src/lib/game/renderer/projection.ts');
    const api = window.__PIXLAB_LEVEL__!, canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
    const dims = window.__PIXLAB_CANVAS__!.getDimensions(canvas), rect = canvas.getBoundingClientRect();
    const before = api.getPlayerPos();
    const camera = createPerspectiveCamera({ player: before, width: dims.logicalWidth, height: dims.logicalHeight,
      stableHeight: dims.logicalHeight, tileSize: 32, isMobile: true });
    const p = worldToScreen(camera, tileCenter(before))!;
    const client = { x: rect.left + p.x * rect.width / camera.width, y: rect.top + p.y * rect.height / camera.height };
    const picked = api.screenToTile(client.x, client.y), accepted = api.tapAt(client.x, client.y);
    return { before, picked, accepted, after: api.getPlayerPos() };
  });
  expect(result.picked).toEqual(result.before);
  expect(result.accepted).toBe(true); expect(result.after).not.toEqual(result.before);
});

test('real stair texture and portal decals render on the floor at DPR 1 and 2', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PerspectiveLandmarks } = await import('/src/lib/game/renderer/perspectiveLandmarks.ts');
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { createPerspectiveCamera } = await import('/src/lib/game/renderer/projection.ts');
    const stairs = new Image(); stairs.src = '/imgs/stairs.png'; await stairs.decode();
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
    const level = { width: 30, height: 30, levelNumber: 1, tiles: Array.from({ length: 30 }, () => Array(30).fill('floor')),
      portals: [{ id: 'portal', pos: { x: 12, y: 14 }, exitPos: { x: 20, y: 20 } }] };
    level.tiles[14][14] = 'exit'; level.tiles[13][14] = 'wall';
    level.tiles[14][16] = 'exit';
    const landmarks = new PerspectiveLandmarks(), world = new VoxelWorldRenderer();
    const camera = createPerspectiveCamera({ player: { x: 14, y: 16 }, width: 800, height: 600, tileSize: 32, isMobile: false });
    const captures = [], counts = [];
    for (const dpr of [1, 2]) {
      canvas.width = 800 * dpr; canvas.height = 600 * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 800, 600);
      const entries = landmarks.prepare(level, '#304055', stairs, 1000);
      world.draw(ctx, camera, level, { floor: '#304055', wall: '#243044' }, 'high', entries);
      counts.push(entries.length); captures.push(canvas.toDataURL());
    }
    level.tiles[14][16] = 'floor';
    return { counts, afterRemoval: landmarks.prepare(level, '#304055', stairs, 1000).length, captures };
  });
  expect(result.counts).toEqual([3, 3]); expect(result.afterRemoval).toBe(2);
  for (let i = 0; i < result.captures.length; i++) await writeFile(testInfo.outputPath(`landmarks-dpr${i + 1}.png`), Buffer.from(result.captures[i].split(',')[1], 'base64'));
});

test('movement collects a projected pickup and entering the stairs completes the sector', async ({ page }) => {
  await page.goto('/?perspective=1');
  await page.getByTestId('start-run-button').click();
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor();
  await page.evaluate(() => {
    const api = window.__PIXLAB_LEVEL__!; api.clearMobs(); api.clearPortals();
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) {
      if (api.isFloor(x, y) && api.isFloor(x + 1, y)) {
        api.setPlayerPos({ x, y });
        api.spawnItem({ id: 'projected-pickup', name: 'Scanner Lv1', type: 'utility', rarity: 'common', price: 0, description: '' }, { x: x + 1, y });
        return;
      }
    }
    throw new Error('No pickup corridor');
  });
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__PIXLAB_LEVEL__!.getItems().some(i => i.item.id === 'projected-pickup'))).toBe(false);
  await page.keyboard.up('ArrowRight');
  const key = await page.evaluate(() => {
    const api = window.__PIXLAB_LEVEL__!, exit = api.getExitPos()!;
    for (const [dx, dy, key] of [[-1, 0, 'ArrowRight'], [1, 0, 'ArrowLeft'], [0, -1, 'ArrowDown'], [0, 1, 'ArrowUp']] as const) {
      const pos = { x: exit.x + dx, y: exit.y + dy };
      if (api.isFloor(pos.x, pos.y)) { api.setPlayerPos(pos); return key; }
    }
    throw new Error('No accessible exit neighbor');
  });
  await page.keyboard.down(key);
  await expect(page.getByTestId('enter-sector-button')).toBeVisible();
  await page.keyboard.up(key);
});
