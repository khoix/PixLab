import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('raised pickups, portals and switches retain grounding, quality and activation', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PerspectiveItems } = await import('/src/lib/game/renderer/perspectiveItems.ts');
    const { PerspectiveLandmarks } = await import('/src/lib/game/renderer/perspectiveLandmarks.ts');
    const { PerspectiveEffects } = await import('/src/lib/game/renderer/perspectiveEffects.ts');
    const { PerspectiveEntities } = await import('/src/lib/game/renderer/perspectiveEntities.ts');
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { createPerspectiveCamera, worldToScreen, perspectiveScale } = await import('/src/lib/game/renderer/projection.ts');
    const { installShadowQualityGate } = await import('/src/lib/game/renderQuality.ts');
    const { preloadItemIcons } = await import('/src/lib/game/itemIcons.ts');
    await preloadItemIcons();
    const stairs = new Image(); stairs.src = '/imgs/stairs.png'; await stairs.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700;
    const ctx = canvas.getContext('2d')!;
    const level = { width: 30, height: 30, levelNumber: 1,
      tiles: Array.from({ length: 30 }, () => Array(30).fill('floor')), entities: [],
      items: ['weapon', 'armor', 'utility', 'consumable'].map((type, i) => ({
        pos: { x: 11 + i * 2, y: 16 }, item: { id: type, name: type, type, rarity: ['common', 'rare', 'epic', 'legendary'][i] } })),
      portals: [{ pos: { x: 12, y: 19 } }], lightswitches: [{ pos: { x: 15, y: 19 }, activated: false }],
      particles: [], footprints: [], afterimages: [] };
    level.tiles[19][18] = 'exit';
    for (let x = 10; x <= 19; x++) level.tiles[14][x] = 'wall';
    for (let y = 15; y <= 21; y++) { level.tiles[y][9] = 'wall'; level.tiles[y][20] = 'wall'; }
    const before = JSON.stringify(level), items = new PerspectiveItems(), landmarks = new PerspectiveLandmarks(),
      effects = new PerspectiveEffects(), entities = new PerspectiveEntities(), world = new VoxelWorldRenderer();
    const input = { player: { x: 15, y: 21 }, width: 1000, height: 700, tileSize: 32, isMobile: false };
    const camera = createPerspectiveCamera(input), old = createPerspectiveCamera({ ...input, settings: { distanceTiles: 8 } });
    const captures = [], raisedPixels = [];
    for (const quality of ['high', 'low'] as const) {
      const restore = installShadowQualityGate(ctx, quality);
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 1000, 700);
      const entries = items.prepare(level.items, entities.prepare(level, camera, quality, 1000, false,
        effects.prepare(level, 1000, quality, [], landmarks.prepare(level, '#304055', stairs, 1000))));
      world.draw(ctx, camera, level, { floor: '#304055', wall: '#243044' }, quality, entries);
      captures.push(canvas.toDataURL());
      // Raised portal/switch bodies exist independently of floor decals at both tiers.
      ctx.clearRect(0, 0, 1000, 700);
      const props = landmarks.prepare(level, '#304055', stairs, 1000);
      for (const prop of props) prop.draw(ctx, camera);
      const pixels = ctx.getImageData(0, 0, 1000, 700).data;
      raisedPixels.push(pixels.filter((v, i) => i % 4 === 3 && v > 0).length);
      restore();
    }
    const entries = landmarks.prepare(level, '#304055', stairs, 1000), first = entries[0];
    const pooled = landmarks.prepare(level, '#304055', stairs, 1100)[0] === first;
    const unchanged = JSON.stringify(level) === before;
    level.lightswitches[0].activated = true;
    const remaining = landmarks.prepare(level, '#304055', stairs, 1200).length;
    return { captures, raisedPixels, pooled, unchanged, remaining,
      ratio: perspectiveScale(camera, camera.focus)! / perspectiveScale(old, old.focus)!,
      anchor: worldToScreen(camera, camera.focus), oldAnchor: worldToScreen(old, old.focus) };
  });
  expect(result.ratio).toBeCloseTo(0.8);
  expect(result.anchor).toEqual(result.oldAnchor);
  expect(result.raisedPixels[0]).toBeGreaterThan(50);
  expect(result.raisedPixels[1]).toBe(result.raisedPixels[0]);
  expect(result.pooled).toBe(true); expect(result.unchanged).toBe(true); expect(result.remaining).toBe(2);
  for (let i = 0; i < result.captures.length; i++) await writeFile(testInfo.outputPath(`props-${i ? 'low' : 'high'}.png`), Buffer.from(result.captures[i].split(',')[1], 'base64'));
});
