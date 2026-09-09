import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('normal, boss and shadow shots project, turn, and pass behind/in front of walls', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PerspectiveProjectiles } = await import('/src/lib/game/renderer/perspectiveProjectiles.ts');
    const { VoxelWorldRenderer } = await import('/src/lib/game/renderer/voxelWorld.ts');
    const { createPerspectiveCamera, worldToScreen } = await import('/src/lib/game/renderer/projection.ts');
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const camera = createPerspectiveCamera({ player: { x: 12, y: 14 }, width: 800, height: 600, tileSize: 32, isMobile: false });
    const level = { width: 30, height: 30, levelNumber: 1, tiles: Array.from({ length: 30 }, () => Array(30).fill('floor')) };
    const projectile = { id: 'shot', pos: { x: 12, y: 10 }, velocity: { x: 1, y: 0 }, damage: 1,
      ownerId: 'mob', cadenceMs: 1000, createdAt: 0, lifetime: 2000, isBoss: false, isShadowPulse: false };
    const world = new VoxelWorldRenderer(), adapter = new PerspectiveProjectiles();
    const draw = () => {
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 800, 600);
      world.draw(ctx, camera, level, { floor: '#304055', wall: '#243044' }, 'low', adapter.prepare([projectile], 'low'));
    };
    const sample = () => {
      const p = worldToScreen(camera, { x: projectile.pos.x + 0.5, y: projectile.pos.y + 0.5 })!;
      return [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data];
    };
    draw(); const open = sample();
    level.tiles[11][12] = 'wall'; draw(); const hidden = sample();
    projectile.pos.y = 12; draw(); const front = sample();
    projectile.isBoss = true; draw(); const boss = sample();
    projectile.isShadowPulse = true; draw(); const shadow = sample();
    projectile.isShadowPulse = false;
    const orientations = [];
    for (const velocity of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]) {
      projectile.velocity = velocity; draw();
      const p = worldToScreen(camera, { x: 12.5, y: 12.5 })!;
      const pixels = ctx.getImageData(Math.round(p.x) - 10, Math.round(p.y) - 10, 20, 20).data;
      orientations.push([...pixels]);
    }
    return { open, hidden, front, boss, shadow,
      horizontal: orientations[0], vertical: orientations[1], capture: canvas.toDataURL() };
  });
  expect(result.hidden).not.toEqual(result.open);
  expect(result.front).toEqual(result.open);
  expect(result.boss).toEqual(result.front);
  expect(result.shadow).not.toEqual(result.boss);
  expect(result.horizontal).not.toEqual(result.vertical);
  await writeFile(testInfo.outputPath('projectile-world.png'), Buffer.from(result.capture.split(',')[1], 'base64'));
});

test('pickup icons replace markers at projected ground anchors without changing items', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PerspectiveItems } = await import('/src/lib/game/renderer/perspectiveItems.ts');
    const { createPerspectiveCamera, worldToScreen } = await import('/src/lib/game/renderer/projection.ts');
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const camera = createPerspectiveCamera({ player: { x: 12, y: 14 }, width: 800, height: 600, tileSize: 32, isMobile: false });
    const items = ['weapon', 'armor', 'utility', 'consumable'].map((type, i) => ({ pos: { x: 10 + i, y: 12 },
      item: { id: String(i), type, rarity: 'common', name: 'Test' } }));
    const before = JSON.stringify(items), adapter = new PerspectiveItems();
    const entries = adapter.prepare(items);
    let visible = 0;
    for (const entry of entries) {
      ctx.clearRect(0, 0, 800, 600); entry.draw(ctx, camera);
      const p = worldToScreen(camera, entry)!;
      const pixels = ctx.getImageData(Math.floor(p.x) - 20, Math.floor(p.y) - 35, 40, 35).data;
      if (pixels.some((v, i) => i % 4 === 3 && v > 0)) visible++;
    }
    return { visible, unchanged: before === JSON.stringify(items), cleared: adapter.prepare([]).length };
  });
  expect(result.visible).toBe(4); expect(result.unchanged).toBe(true); expect(result.cleared).toBe(0);
});
