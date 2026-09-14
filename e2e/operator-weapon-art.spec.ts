import { test, expect } from '@playwright/test';

// Full-frame registration is the attachment contract: the renderer has no
// per-weapon offset. Catch missing alpha, stray backgrounds and detached grips.
for (const weapon of ['sword', 'spear', 'axe', 'dagger', 'mace']) {
  test(`${weapon} loads as a transparent, hand-registered equipment layer`, async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async name => {
      const map = await import('/src/lib/game/compendium-image-map.ts');
      const read = async (url: string) => {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        return { width: image.width, height: image.height,
          data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
      };
      const art = await read(map.getWeaponImagePath(name));
      const hand = await read(map.getOperatorHandPath());
      let ink = 0, outside = 0, overlap = 0, sx = 0, sy = 0;
      for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
        const i = (y * art.width + x) * 4 + 3;
        if (!art.data[i]) continue;
        ink++;
        // Padded original weapon envelope, not a snapshot of the new artwork.
        if (x < 44 || x > 164 || y < 84 || y > 151) outside++;
        if (art.data[i] >= 128 && hand.data[i] >= 128) { overlap++; sx += x; sy += y; }
      }
      return { width: art.width, height: art.height, ink, outside, overlap,
        gripX: sx / overlap, gripY: sy / overlap };
    }, weapon);
    expect([result.width, result.height]).toEqual([256, 256]);
    expect(result.ink).toBeGreaterThan(200);
    expect(result.ink).toBeLessThan(5000);
    expect(result.outside).toBe(0);
    expect(result.overlap).toBeGreaterThan(50);
    expect(result.gripX).toBeGreaterThan(79);
    expect(result.gripX).toBeLessThan(84);
    expect(result.gripY).toBeGreaterThan(129);
    expect(result.gripY).toBeLessThan(134);
  });
}
