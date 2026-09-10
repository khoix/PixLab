import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('projected floors have no background cracks while moving at DPR 1 and 2', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { createPerspectiveCamera } = await import('/src/lib/game/renderer/projection.ts');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const level = { width: 80, height: 80, tiles: Array.from({ length: 80 }, () => Array(80).fill('floor')) };
    const renderer = new VoxelWorldRenderer();
    let cracks = 0;
    for (const dpr of [1, 2]) {
      canvas.width = 800 * dpr; canvas.height = 600 * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 800, 600);
        const camera = createPerspectiveCamera({ player: { x: 40 + i / 8, y: 40 + i / 11 },
          width: 800, height: 600, tileSize: 32, isMobile: false });
        renderer.draw(ctx, camera, level, { id: 'test', floor: '#304055', wall: '#243044' }, 'low');
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let p = 0; p < pixels.length; p += 4) if (pixels[p] + pixels[p + 1] + pixels[p + 2] < 60) cracks++;
      }
    }
    return { cracks, stats: renderer.getStats() };
  });
  expect(result.cracks).toBe(0);
  expect(result.stats.cacheBuilds).toBe(1);
  expect(result.stats.visibleTiles).toBeLessThan(80 * 80 / 4);
});

test('near walls occlude submitted objects and an opened wall reveals them', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { createPerspectiveCamera, worldToScreen } = await import('/src/lib/game/renderer/projection.ts');
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const level = { width: 30, height: 30, tiles: Array.from({ length: 30 }, () => Array(30).fill('floor')) };
    level.tiles[11][12] = 'wall';
    const renderer = new VoxelWorldRenderer();
    const camera = createPerspectiveCamera({ player: { x: 12, y: 14 }, width: 800, height: 600, tileSize: 32, isMobile: false });
    const marker = (x: number, y: number, color: string, orderId: number) => ({ x, y, orderId,
      draw(context: CanvasRenderingContext2D, c: typeof camera) {
        const p = worldToScreen(c, this)!;
        context.fillStyle = color; context.fillRect(p.x - 6, p.y - 6, 12, 12);
      } });
    const behind = marker(12.5, 10.5, '#ff0066', 1000), front = marker(12.5, 12.5, '#00ff66', 1001);
    const sample = (m: typeof behind) => {
      const p = worldToScreen(camera, m)!;
      return [...ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data].slice(0, 3);
    };
    const draw = () => renderer.draw(ctx, camera, level, { id: 'test', floor: '#304055', wall: '#243044' }, 'high', [front, behind]);
    draw();
    const occluded = sample(behind), visible = sample(front), initial = renderer.getStats();
    level.tiles[11][12] = 'exit';
    draw();
    return { occluded, visible, revealed: sample(behind), initial, final: renderer.getStats() };
  });
  expect(result.occluded).not.toEqual([255, 0, 102]);
  expect(result.visible).toEqual([0, 255, 102]);
  expect(result.revealed).toEqual([255, 0, 102]);
  expect(result.initial.faces).toBeGreaterThan(1);
  expect(result.final.walls).toBe(0);
  expect(result.final.cacheBuilds).toBe(1);
  expect(result.final.tileEdits).toBe(1);
});

test('generated levels render, reuse topology while following, and respect quality tiers', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Error in draw function')) errors.push(message.text());
  });
  const measurements: unknown[] = [];
  for (const scenario of [
    { name: 'desktop-maze', width: 1280, height: 720, level: 1, quality: 'high' },
    { name: 'mobile-maze', width: 393, height: 727, level: 5, quality: 'low' },
    { name: 'desktop-arena', width: 1280, height: 720, level: 8, quality: 'high' },
    { name: 'landscape-arena', width: 844, height: 390, level: 16, quality: 'medium' },
  ] as const) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
  await page.evaluate(() => window.__PIXLAB_TEST__!.updateSettings({ gameplayView: 'perspective' }));
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await page.evaluate(s => {
      window.__PIXLAB_TEST__!.updateSettings({ renderQuality: s.quality });
      window.__PIXLAB_TEST__!.setCurrentLevel(s.level);
    }, scenario);
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_LEVEL__!.getWorldRenderStats().quality)).toBe(scenario.quality);
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_LEVEL__!.getWorldRenderStats().levelNumber)).toBe(scenario.level);
    await page.evaluate(async () => {
      const api = window.__PIXLAB_LEVEL__!;
      api.clearMobs();
      for (let y = 14; y < 20; y++) for (let x = 13; x < 20; x++) {
        if (api.isFloor(x, y)) {
          api.setPlayerPos({ x, y });
          await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          return;
        }
      }
    });
    const before = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getWorldRenderStats());
    expect(before.walls).toBeGreaterThan(0);
    expect(before.faces).toBeGreaterThan(before.walls);
    await page.locator('canvas.game-canvas').screenshot({ path: testInfo.outputPath(`${scenario.name}.png`) });
    const raw = await page.locator('canvas.game-canvas').evaluate(c => (c as HTMLCanvasElement).toDataURL());
    await writeFile(testInfo.outputPath(`${scenario.name}-world.png`), Buffer.from(raw.split(',')[1], 'base64'));
    await page.evaluate(async () => {
      const api = window.__PIXLAB_LEVEL__!, start = api.getPlayerPos();
      for (let i = 0; i <= 20; i++) {
        api.setPlayerPos({ x: start.x + i / 20, y: start.y + i / 40 });
        await new Promise<void>(r => requestAnimationFrame(() => r()));
      }
    });
    const after = await page.evaluate(() => ({ world: window.__PIXLAB_LEVEL__!.getWorldRenderStats(),
      perf: window.__PIXLAB_PERF__?.getSnapshot() }));
    expect(after.world.cacheBuilds).toBe(before.cacheBuilds);
    expect(after.world.projectedVertices).toBeLessThan(31 * 31 * 2);
    measurements.push({ scenario: scenario.name, ...after });
  }
  await testInfo.attach('world-measurements', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  console.log('WORLD_MEASUREMENTS', JSON.stringify(measurements));
  expect(errors).toEqual([]);
});
