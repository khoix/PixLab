import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Deterministic presentation fixtures use real renderer/cache modules and real
// Canvas pixels, without changing AI or adding gameplay-only test controls.
test('billboards, shadows, feedback and cardinal turret art retain cached subtype identity', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { PerspectiveEntities } = await import('/src/lib/game/renderer/perspectiveEntities.ts');
    const { createPerspectiveCamera } = await import('/src/lib/game/renderer/projection.ts');
    const { billboardLayout, entityAppearance } = await import('/src/lib/game/renderer/entityBillboard.ts');
    const { mobSpriteCache } = await import('/src/lib/game/renderer/mobSpriteCache.ts');
    const { installShadowQualityGate } = await import('/src/lib/game/renderQuality.ts');
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700;
    const ctx = canvas.getContext('2d')!;
    const subtypes = ['phase', 'charger', 'turret', 'sniper', 'moth', 'drone', 'guardian', 'swarm',
      'boss_zeus', 'boss_hades', 'boss_ares', 'cerberus'];
    const level = { width: 30, height: 30, levelNumber: 8,
      tiles: Array.from({ length: 30 }, () => Array(30).fill('floor')),
      entities: subtypes.map((mobSubtype, i) => ({ id: String(i), type: 'enemy', mobSubtype,
        pos: { x: 9.5 + i % 4 * 2.5, y: 11 + Math.floor(i / 4) * 2.5 },
        hp: 60, maxHp: 100, isBoss: mobSubtype.startsWith('boss_'), damage: 1,
        chargeDirection: mobSubtype === 'charger' || mobSubtype === 'boss_ares' ? { x: 1, y: 0 } : null,
        bossPhase: mobSubtype === 'boss_ares' ? 'telegraph' : 'ready' })),
      damageNumbers: [{ id: 'hit', pos: { x: 9.5, y: 13.5 }, amount: 42, createdAt: 800, lifetime: 800, isCrit: true }],
    };
    // Low walls at the edges keep the art review scene readable.
    for (let y = 9; y < 20; y++) { level.tiles[y][8] = 'wall'; level.tiles[y][20] = 'wall'; }
    const camera = createPerspectiveCamera({ player: { x: 14, y: 18 }, width: 1000, height: 700, tileSize: 32, isMobile: false });
    const world = new VoxelWorldRenderer(), entities = new PerspectiveEntities();
    mobSpriteCache.invalidate(); mobSpriteCache.resetStats();
    const draw = (quality = 'high', phasing = false) => {
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 1000, 700);
      const restore = installShadowQualityGate(ctx, quality);
      const entries = entities.prepare(level, camera, quality, 1000, phasing);
      world.draw(ctx, camera, level, { floor: '#304055', wall: '#243044' }, quality, entries);
      entities.drawDamageNumbers(ctx, camera, level, 1000);
      restore();
      return entries;
    };
    draw(); const warm = mobSpriteCache.getStats().builds;
    const captures = [{ name: 'all-subtypes', data: canvas.toDataURL() }];
    const turret = level.entities[2], aims = [];
    const t = billboardLayout(camera, { x: turret.pos.x + 0.5, y: turret.pos.y + 0.5 }, entityAppearance(turret))!;
    // Aimed barrel rotates without creating another static body sprite.
    for (const d of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
      turret.attackTelegraphVelocity = d;
      draw();
      aims.push([...ctx.getImageData(Math.floor(t.x - 30), Math.floor(t.centerY - 30), 60, 60).data]);
    }
    const afterAim = mobSpriteCache.getStats().builds;
    const shadowBands = [];
    for (const quality of ['low', 'medium', 'high']) {
      const entries = draw(quality, true);
      // Isolate actual shadow pixels from body/walls on an otherwise flat floor.
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, 700);
      entries[0].drawGround!(ctx, camera);
      const p = billboardLayout(camera, { x: level.entities[0].pos.x + 0.5, y: level.entities[0].pos.y + 0.5 }, entityAppearance(level.entities[0]))!;
      shadowBands.push([...ctx.getImageData(Math.round(p.x), Math.round(p.footY), 1, 1).data]);
      draw(quality, true);
      captures.push({ name: `phasing-${quality}`, data: canvas.toDataURL() });
    }
    draw('low');
    const flashed = level.entities[1];
    const f = billboardLayout(camera, { x: flashed.pos.x + 0.5, y: flashed.pos.y + 0.5 }, entityAppearance(flashed))!;
    const sample = () => [...ctx.getImageData(Math.round(f.x), Math.round(f.centerY), 1, 1).data];
    const normal = sample(); flashed.hitFlashUntil = 1200; draw('low'); const hit = sample();
    const bar = [...ctx.getImageData(Math.round(f.x - f.barWidth / 2 + 2), Math.round(f.topY - 6), 1, 1).data];
    captures.push({ name: 'hit-feedback', data: canvas.toDataURL() });
    const drawn = entities.drawnEntities;
    const originalEntities = level.entities;
    level.entities = Array.from({ length: 60 }, (_, i) => ({ ...originalEntities[i % 12], id: `stress-${i}` }));
    const performance = [];
    for (const quality of ['low', 'high']) {
      draw(quality); const builds = mobSpriteCache.getStats().builds, start = window.performance.now();
      for (let i = 0; i < 30; i++) { camera.focus.x += 0.001; draw(quality); }
      performance.push({ quality, avgDrawMs: (window.performance.now() - start) / 30,
        extraBuilds: mobSpriteCache.getStats().builds - builds, visible: entities.drawnEntities });
    }
    return { warm, afterAim, performance, distinctAims: new Set(aims.map(a => JSON.stringify(a))).size,
      shadowBands, normal, hit, bar, captures, drawn };
  });
  await testInfo.attach('entity-performance', { body: JSON.stringify(result.performance, null, 2), contentType: 'application/json' });
  console.log('ENTITY_PERFORMANCE', JSON.stringify(result.performance));
  for (const run of result.performance) { expect(run.extraBuilds).toBe(0); expect(run.visible).toBe(60); }
  expect(result.warm).toBe(12);
  expect(result.afterAim).toBe(result.warm);
  expect(result.distinctAims).toBe(4);
  expect(result.drawn).toBe(12);
  for (const color of result.shadowBands) expect(color[0]).toBeLessThan(230);
  expect(result.hit[1]).toBeGreaterThan(result.normal[1]);
  expect(result.bar.slice(0, 3)).toEqual([0, 255, 0]);
  for (const capture of result.captures) await writeFile(testInfo.outputPath(`${capture.name}.png`), Buffer.from(capture.data.split(',')[1], 'base64'));
});

test('entity bodies cross behind and in front of walls; only hidden player edges get a navigation hint', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { PerspectiveEntities } = await import('/src/lib/game/renderer/perspectiveEntities.ts');
    const { createPerspectiveCamera } = await import('/src/lib/game/renderer/projection.ts');
    const { billboardLayout, entityAppearance } = await import('/src/lib/game/renderer/entityBillboard.ts');
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const entity = { id: 'crossing', type: 'enemy', pos: { x: 12, y: 10 }, hp: 100, maxHp: 100 };
    const level = { width: 30, height: 30, levelNumber: 1,
      tiles: Array.from({ length: 30 }, () => Array(30).fill('floor')), entities: [entity] };
    const camera = createPerspectiveCamera({ player: { x: 12, y: 14 }, width: 800, height: 600, tileSize: 32, isMobile: false });
    const world = new VoxelWorldRenderer(), entities = new PerspectiveEntities();
    const draw = () => {
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 800, 600);
      const entries = entities.prepare(level, camera, 'low', 1000, false);
      world.draw(ctx, camera, level, { floor: '#304055', wall: '#243044' }, 'low', entries);
      return entries;
    };
    const sample = () => {
      const p = billboardLayout(camera, { x: entity.pos.x + 0.5, y: entity.pos.y + 0.5 }, entityAppearance(entity))!;
      return [...ctx.getImageData(Math.round(p.x), Math.round(p.footY - 4), 1, 1).data];
    };
    draw(); const withoutWall = sample();
    level.tiles[11][12] = 'wall'; draw(); const behind = sample();
    const captures = [{ name: 'behind-wall', data: canvas.toDataURL() }];
    entity.pos.y = 12; draw(); const front = sample();
    captures.push({ name: 'front-wall', data: canvas.toDataURL() });
    // Put a wall just in front of the player's footpoint.
    level.tiles[15][12] = 'wall';
    const entries = draw(), withHint = ctx.getImageData(0, 0, 800, 600).data;
    captures.push({ name: 'player-partially-occluded', data: canvas.toDataURL() });
    entries[entries.length - 1].drawOccluded = undefined;
    world.draw(ctx, camera, level, { floor: '#304055', wall: '#243044' }, 'low', entries);
    const noHint = ctx.getImageData(0, 0, 800, 600).data;
    let hintPixels = 0;
    for (let i = 0; i < noHint.length; i += 4) if (noHint[i + 1] !== withHint[i + 1]) hintPixels++;
    return { withoutWall, behind, front, hintPixels, captures };
  });
  expect(result.behind).not.toEqual(result.withoutWall);
  expect(result.front).toEqual(result.withoutWall);
  expect(result.hintPixels).toBeGreaterThan(0);
  expect(result.hintPixels).toBeLessThan(250); // Outline only, not the opaque body.
  for (const capture of result.captures) await writeFile(testInfo.outputPath(`${capture.name}.png`), Buffer.from(capture.data.split(',')[1], 'base64'));
});

test('live perspective run follows movement with player and mob sprites at mobile and desktop sizes', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && m.text().includes('Error in draw function')) errors.push(m.text()); });
  for (const width of [1000, 393]) {
    await page.setViewportSize({ width, height: 727 });
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
  await page.evaluate(() => window.__PIXLAB_TEST__!.updateSettings({ gameplayView: 'perspective' }));
    await page.getByTestId('enter-sector-button').click();
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_LEVEL__?.getWorldRenderStats().drawables ?? 0)).toBeGreaterThan(0);
    const start = await page.evaluate(() => {
      const api = window.__PIXLAB_LEVEL__!;
      api.clearMobs();
      // Choose an actual eastward corridor so this exercises movement, not a blocked key press.
      let found = false;
      for (let y = 10; y < 20 && !found; y++) for (let x = 10; x < 20; x++) {
        if (api.isFloor(x, y) && api.isFloor(x + 1, y)) { api.setPlayerPos({ x, y }); found = true; break; }
      }
      const p = api.getPlayerPos();
      const subtypes = ['phase', 'charger', 'turret', 'sniper', 'moth'];
      let index = 0;
      for (let y = p.y - 4; y <= p.y + 4; y++) for (let x = p.x - 4; x <= p.x + 4; x++) {
        // Keep the cache assertion meaningful: these mobs must be inside
        // vision after the eastward step, not hidden sprites that need no draw.
        if (api.isFloor(x, y) && Math.hypot(x - p.x, y - p.y) >= 2
          && Math.hypot(x - (p.x + 1), y - p.y) <= 2.5 && index < subtypes.length) {
          api.spawnMob(subtypes[index++] as never, { x, y });
        }
      }
      return p;
    });
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(180); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(200);
    expect((await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerPos())).x).toBeGreaterThan(start.x);
    const raw = await page.locator('canvas.game-canvas').evaluate(c => (c as HTMLCanvasElement).toDataURL());
    await writeFile(testInfo.outputPath(`live-${width}.png`), Buffer.from(raw.split(',')[1], 'base64'));
    const stats = await page.evaluate(() => ({ cache: window.__PIXLAB_MOB_SPRITES__!.getStats(), world: window.__PIXLAB_LEVEL__!.getWorldRenderStats() }));
    expect(stats.cache.entries).toBeGreaterThan(0);
    expect(stats.world.drawables).toBeGreaterThan(1);
  }
  expect(errors).toEqual([]);
});
