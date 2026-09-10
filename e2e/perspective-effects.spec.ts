import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('projected fog, ground effects and sense markers preserve visibility and cache while following', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PerspectiveFog } = await import('/src/lib/game/renderer/perspectiveFog.ts');
    const { PerspectiveEffects } = await import('/src/lib/game/renderer/perspectiveEffects.ts');
    const { drawPerspectiveSenses } = await import('/src/lib/game/renderer/perspectiveSenses.ts');
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { createPerspectiveCamera, worldToScreen } = await import('/src/lib/game/renderer/projection.ts');
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d')!, fog = new PerspectiveFog(), effects = new PerspectiveEffects(), world = new VoxelWorldRenderer();
    const options = { player: { x: 12, y: 14 }, width: 800, height: 600, tileSize: 32, isMobile: false };
    let camera = createPerspectiveCamera(options);
    const level = { width: 30, height: 30, levelNumber: 1, tiles: Array.from({ length: 30 }, () => Array(30).fill('floor')),
      portals: [], afterimages: [{ pos: { x: 11, y: 14 }, createdAt: 0, lifetime: 2000 }],
      footprints: [{ pos: { x: 12, y: 15 }, direction: { x: 0, y: 1 }, isLeftFoot: true, createdAt: 0, lifetime: 2000 }],
      particles: [{ id: 'moth', pos: { x: 13, y: 14 }, createdAt: 0, lifetime: 2000 }],
      lightswitches: [{ pos: { x: 12, y: 13 }, activated: false }], items: [],
      entities: [{ type: 'enemy', pos: { x: 17, y: 14 } }] };
    level.tiles[13][11] = 'wall'; level.tiles[13][10] = 'wall';
    const draw = (radius, quality) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 800, 600);
      world.draw(ctx, camera, level, { floor: '#304055', wall: '#243044' }, quality,
        effects.prepare(level, 500, quality, [{ x: 12, y: 14 }]), fog.prepare(camera, radius, quality));
    };
    const sample = (x, y) => { const p = worldToScreen(camera, { x, y }); return [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data]; };
    const captures = [];
    draw(3.5, 'high'); captures.push(canvas.toDataURL());
    const near = sample(12.8, 14.8), distant = sample(17.5, 14.5), initial = fog.getStats().builds;
    camera = createPerspectiveCamera({ ...options, player: { x: 12.25, y: 14.25 } }); draw(3.5, 'high');
    const following = fog.getStats().builds;
    camera = createPerspectiveCamera(options); draw(1.75, 'low'); captures.push(canvas.toDataURL());
    const reduced = fog.getStats().builds;
    const marker = worldToScreen(camera, { x: 17.5, y: 14.5 });
    const before = [...ctx.getImageData(Math.round(marker.x), Math.round(marker.y) - 10, 1, 1).data];
    drawPerspectiveSenses(ctx, camera, level, 1.75, true, false, 500, 'low');
    const after = [...ctx.getImageData(Math.round(marker.x), Math.round(marker.y) - 10, 1, 1).data];
    return { near, distant, initial, following, reduced, before, after, captures };
  });
  expect(result.near.slice(0, 3).some(v => v > 0)).toBe(true);
  expect(result.distant.slice(0, 3)).toEqual([0, 0, 0]);
  expect(result.following).toBe(result.initial); expect(result.reduced).toBe(result.initial + 1);
  expect(result.after[0]).toBeGreaterThan(result.before[0]);
  for (let i = 0; i < result.captures.length; i++) await writeFile(testInfo.outputPath(`fog-${i}.png`), Buffer.from(result.captures[i].split(',')[1], 'base64'));
});

test('live perspective fog follows vision changes without rebuilding during ordinary movement', async ({ page }) => {
  await page.goto('/?perspective=1');
  await page.getByTestId('start-run-button').click();
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor();
  await page.evaluate(() => { window.__PIXLAB_LEVEL__!.clearMobs(); window.__PIXLAB_TEST__!.updateStats({ visionRadius: 3.5 }); });
  await expect.poll(() => page.evaluate(() => window.__PIXLAB_LEVEL__!.getPerspectiveFogStats().radiusTiles)).toBe(3.5);
  await page.evaluate(() => window.__PIXLAB_TEST__!.updateStats({ visionRadius: 1.75 }));
  await expect.poll(() => page.evaluate(() => window.__PIXLAB_LEVEL__!.getPerspectiveFogStats().radiusTiles)).toBe(1.75);
  const before = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPerspectiveFogStats().builds);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPerspectiveFogStats().builds)).toBe(before);
});
