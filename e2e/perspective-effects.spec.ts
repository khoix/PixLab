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
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.evaluate(() => window.__PIXLAB_TEST__!.updateSettings({ gameplayView: 'perspective' }));
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

test('cached fog distances preserve reference pixels through vision changes and viewport changes', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PerspectiveFog } = await import('/src/lib/game/renderer/perspectiveFog.ts');
    const { createPerspectiveCamera, screenToGround } = await import('/src/lib/game/renderer/projection.ts');
    const { fogAlphaAtDistance } = await import('/src/lib/game/renderer/fogGradient.ts');
    const fog = new PerspectiveFog(), canvas = document.createElement('canvas'), reference = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!, ref = reference.getContext('2d')!;
    let differences = 0;
    for (const quality of ['low', 'medium', 'high']) for (const height of [240, 320]) for (const radius of [3.5, 1.75, 0, 1000]) {
      const camera = createPerspectiveCamera({ player: { x: 12.25, y: 14.5 }, width: 320, height, tileSize: 32, isMobile: true });
      canvas.width = reference.width = camera.width; canvas.height = reference.height = height;
      const step = quality === 'high' ? 4 : quality === 'medium' ? 6 : 8;
      const sample = document.createElement('canvas'); sample.width = Math.ceil(camera.width / step); sample.height = Math.ceil(height / step);
      const small = sample.getContext('2d')!, pixels = small.createImageData(sample.width, sample.height);
      for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
        const point = screenToGround(camera, { x: (x + 0.5) * camera.width / sample.width, y: (y + 0.5) * height / sample.height });
        pixels.data[(y * sample.width + x) * 4 + 3] = Math.round(255 * (point
          ? fogAlphaAtDistance(Math.hypot(point.x - camera.focus.x, point.y - camera.focus.y), radius) : 1));
      }
      small.putImageData(pixels, 0, 0); ref.imageSmoothingEnabled = true; ref.drawImage(sample, 0, 0, camera.width, height);
      fog.prepare(camera, radius, quality).drawGround(ctx, camera);
      const expected = ref.getImageData(0, 0, camera.width, height).data, actual = ctx.getImageData(0, 0, camera.width, height).data;
      for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) differences++;
    }
    return differences;
  });
  expect(result).toBe(0);
});
