import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('combined perspective scene retains caches across follow and all quality tiers', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { PerspectiveEntities } = await import('/src/lib/game/renderer/perspectiveEntities.ts');
    const { PerspectiveEffects } = await import('/src/lib/game/renderer/perspectiveEffects.ts');
    const { PerspectiveFog } = await import('/src/lib/game/renderer/perspectiveFog.ts');
    const { PerspectiveItems } = await import('/src/lib/game/renderer/perspectiveItems.ts');
    const { PerspectiveProjectiles } = await import('/src/lib/game/renderer/perspectiveProjectiles.ts');
    const { PerspectiveLandmarks } = await import('/src/lib/game/renderer/perspectiveLandmarks.ts');
    const { createPerspectiveCamera } = await import('/src/lib/game/renderer/projection.ts');
    const { mobSpriteCache } = await import('/src/lib/game/renderer/mobSpriteCache.ts');
    const { installShadowQualityGate } = await import('/src/lib/game/renderQuality.ts');
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
    const subtypes = ['phase', 'charger', 'turret', 'sniper', 'moth', 'boss_ares'];
    const level = { width: 80, height: 80, levelNumber: 8,
      tiles: Array.from({ length: 80 }, (_, y) => Array.from({ length: 80 }, (_, x) =>
        x % 4 === 0 && y % 4 !== 2 ? 'wall' : 'floor')),
      entities: Array.from({ length: 30 }, (_, i) => ({ id: String(i), type: 'enemy', mobSubtype: subtypes[i % 6],
        pos: { x: 35 + i % 6 * 2, y: 34 + Math.floor(i / 6) * 2 }, hp: 60, maxHp: 100,
        isBoss: i % 6 === 5, damage: 1, bossPhase: 'ready' })),
      particles: Array.from({ length: 30 }, (_, i) => ({ id: `moth-${i}`, pos: { x: 38 + i % 5, y: 37 + i % 7 }, createdAt: 0, lifetime: 3000 })),
      footprints: [], afterimages: [], lightswitches: [], damageNumbers: [],
      portals: [{ pos: { x: 39, y: 39 } }],
      items: [{ pos: { x: 41, y: 41 }, item: { id: 'item', type: 'utility', name: 'Scanner', rarity: 'common' } }],
      projectiles: Array.from({ length: 10 }, (_, i) => ({ id: `shot-${i}`, pos: { x: 38 + i % 4, y: 35 + i }, velocity: { x: 0, y: 1 } })),
    };
    level.tiles[38][41] = 'exit';
    const world = new VoxelWorldRenderer(), entities = new PerspectiveEntities(), effects = new PerspectiveEffects(),
      fog = new PerspectiveFog(), items = new PerspectiveItems(), shots = new PerspectiveProjectiles(), landmarks = new PerspectiveLandmarks();
    const runs = [], captures = [];
    for (const dpr of [1, 2]) for (const quality of ['low', 'medium', 'high']) {
      canvas.width = 1000 * dpr; canvas.height = 700 * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mobSpriteCache.setDpr(dpr);
      const camera = createPerspectiveCamera({ player: { x: 41, y: 42 }, width: 1000, height: 700, tileSize: 32, isMobile: false });
      let fogMs = 0;
      const visibility = { visibilityAt: p => fog.visibilityAt(p), drawGround: (c, cam) => {
        const start = performance.now(); fog.drawGround(c, cam); fogMs += performance.now() - start;
      } };
      const draw = radius => {
        const restore = installShadowQualityGate(ctx, quality);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1000, 700);
        const entries = shots.prepare(level.projectiles, quality, items.prepare(level.items,
          entities.prepare(level, camera, quality, 1000, false,
            effects.prepare(level, 1000, quality, [], landmarks.prepare(level, '#304055', null, 1000)))));
        fog.prepare(camera, radius, quality);
        world.draw(ctx, camera, level, { floor: '#304055', wall: '#243044' }, quality, entries, visibility);
        restore();
      };
      draw(5); const spriteBuilds = mobSpriteCache.getStats().builds, fogBuilds = fog.getStats().builds;
      fogMs = 0; let start = performance.now();
      for (let i = 0; i < 24; i++) { camera.focus.x += 0.005; draw(5); }
      const stableMs = (performance.now() - start) / 24, stableFogMs = fogMs / 24;
      const extraSprites = mobSpriteCache.getStats().builds - spriteBuilds, extraFog = fog.getStats().builds - fogBuilds;
      fogMs = 0; start = performance.now();
      for (let i = 0; i < 24; i++) draw(3 + i / 24);
      runs.push({ dpr, quality, stableMs, stableFogMs, decayMs: (performance.now() - start) / 24,
        decayFogMs: fogMs / 24, extraSprites, extraFog, tiles: world.getStats().visibleTiles });
      captures.push({ name: `${quality}-dpr${dpr}`, data: canvas.toDataURL() });
    }
    return { runs, captures };
  });
  console.log('COMBINED_PERFORMANCE', JSON.stringify(result.runs));
  await testInfo.attach('combined-performance', { body: JSON.stringify(result.runs, null, 2), contentType: 'application/json' });
  for (const run of result.runs) { expect(run.extraSprites).toBe(0); expect(run.extraFog).toBe(0); expect(run.tiles).toBeLessThan(1600); }
  for (const capture of result.captures) await writeFile(testInfo.outputPath(`${capture.name}.png`), Buffer.from(capture.data.split(',')[1], 'base64'));
});
