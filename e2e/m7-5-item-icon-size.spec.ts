import { test, expect } from '@playwright/test';

/**
 * A dropped item is drawn at the size the renderer asks for.
 *
 * `drawIcon` used to blit the bitmap at its native 20x20 and ignore the `size`
 * it was handed. Every caller happened to pass 20, so nothing looked wrong —
 * but the perspective drop and the loot-sense marker compute a size that scales
 * with distance, and both were pinned to a flat 20px at every depth. It also
 * made ICON_SIZE inert: raising it 20 -> 26 changed only the glow and the
 * not-yet-loaded placeholder, so the drops never grew.
 *
 * A unit test on the fit maths cannot catch this — the bug was that the maths
 * was never reached. This measures drawn pixels instead.
 */
test('item drops honour the requested size and shrink with distance', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const measured = await page.evaluate(async () => {
    const { PerspectiveItems } = await import('/src/lib/game/renderer/perspectiveItems.ts');
    const { createPerspectiveCamera, perspectiveScale } = await import('/src/lib/game/renderer/projection.ts');
    const { ICON_SIZE, ICON_HOVER } = await import('/src/lib/game/renderer/itemGlow.ts');
    const { preloadItemIcons } = await import('/src/lib/game/itemIcons.ts');
    await preloadItemIcons();

    // One drop at a time on a transparent canvas, so the only marks are the
    // icon and its pool; the icon is measured by full opacity, which the soft
    // pool never reaches.
    const measure = (dy: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 400;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const camera = createPerspectiveCamera({
        player: { x: 10, y: 10 + dy }, width: 400, height: 400, tileSize: 32, isMobile: false });
      const items = new PerspectiveItems();
      const drawables = items.prepare([
        { pos: { x: 10, y: 10 }, item: { id: 'w', name: 'w', type: 'weapon', rarity: 'common' } },
      ] as never);
      for (const d of drawables) { d.drawGround?.(ctx, camera); d.draw?.(ctx, camera); }
      const { data } = ctx.getImageData(0, 0, 400, 400);
      let minX = 400, maxX = -1;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 250) {
          const x = (i / 4) % 400;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      const ground = { x: 10.5, y: 10.5 };
      return {
        drawn: maxX >= 0 ? maxX - minX + 1 : 0,
        expected: ICON_SIZE * perspectiveScale(camera, ground, ICON_HOVER)!,
      };
    };
    // Both distances have to keep the drop inside the canvas: the projection
    // walks it up the screen as it recedes, and a drop measured off the top
    // edge reads as zero width rather than as a small one.
    return { near: measure(1), far: measure(5), iconSize: ICON_SIZE };
  });

  // Something was drawn at all, so a miss cannot pass as a small icon.
  expect(measured.near.drawn).toBeGreaterThan(0);
  expect(measured.far.drawn).toBeGreaterThan(0);

  // The drawn artwork tracks the requested box. The icons are discs with
  // transparent corners, so the opaque span runs a little under the full edge —
  // hence a ratio band rather than an exact match.
  for (const m of [measured.near, measured.far]) {
    expect(m.drawn / m.expected).toBeGreaterThan(0.8);
    expect(m.drawn / m.expected).toBeLessThanOrEqual(1.05);
  }

  // The regression itself: a native blit ignores the box, so both depths would
  // come back at a flat 20px — equal to each other and far under the request.
  expect(measured.near.drawn).toBeGreaterThan(24);
  expect(measured.near.drawn).toBeGreaterThan(measured.far.drawn + 2);

  // And the shrink matches the projection rather than merely being smaller.
  const drawnRatio = measured.near.drawn / measured.far.drawn;
  const expectedRatio = measured.near.expected / measured.far.expected;
  expect(Math.abs(drawnRatio - expectedRatio)).toBeLessThan(0.08);
});
