import { test, expect } from '@playwright/test';

test('all equipment mappings and supporting layers load at the registered size', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const map = await import('/src/lib/game/compendium-image-map.ts');
    const { renderOperatorWithGear } = await import('/src/lib/game/compendium.ts');
    const groups = [
      ['weapon', ['sword', 'spear', 'axe', 'dagger', 'mace'], map.getWeaponSubtype, map.getWeaponImagePath],
      ['armor', ['armor', 'shield', 'helmet', 'boots', 'gauntlets'], map.getArmorSubtype, map.getArmorImagePath],
      ['utility', ['scope', 'thruster', 'scanner', 'amplifier'], map.getUtilitySubtype, map.getUtilityImagePath],
    ] as const;
    const records = [];
    for (const [type, names, subtype, imagePath] of groups) for (const name of names) {
      const item = { id: name, name: name[0].toUpperCase() + name.slice(1), type, rarity: 'common', stats: {}, price: 0, description: '' } as const;
      const resolved = subtype(item);
      const url = imagePath(resolved);
      records.push({ name, resolved, url, expected: `/imgs/compendium/ops/${type === 'weapon' ? 'weapons' : type}/${name}.png` });
      const canvas = document.createElement('canvas');
      await renderOperatorWithGear(canvas, { weapon: null, armor: null, utility: null, [type]: item });
      if (canvas.width !== 320 || canvas.height !== 320) throw Error('Wrong composite dimensions');
    }
    const support = [map.getOperatorBasePath(), map.getOperatorHandPath(), map.getGauntletsSleeveImagePath()];
    const dimensions = [];
    for (const url of [...records.map(r => r.url), ...support]) {
      const response = await fetch(url);
      if (!response.ok) throw Error(`Missing asset ${url}`);
      const image = await createImageBitmap(await response.blob());
      dimensions.push([image.width, image.height]); image.close();
    }
    return { records, support, dimensions, gauntlets: map.getGauntletsImagePath() };
  });
  expect(result.records).toHaveLength(14);
  for (const r of result.records) { expect(r.resolved).toBe(r.name); expect(r.url).toBe(r.expected); }
  expect(result.support).toEqual(['/imgs/compendium/ops/operator.png', '/imgs/compendium/ops/operator-hand.png', '/imgs/compendium/ops/armor/gauntlets-sleeve.png']);
  expect(result.gauntlets).toBe('/imgs/compendium/ops/armor/gauntlets.png');
  expect(result.dimensions).toHaveLength(17);
  for (const size of result.dimensions) expect(size).toEqual([256, 256]);
});

test('boots retain two registered legs on a genuinely transparent canvas', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const img = new Image();
    img.src = '/imgs/compendium/ops/armor/boots.png';
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, 256, 256).data;
    // Original independent leg envelopes, before the artwork revision.
    const envelopes = [[70, 142, 125, 215], [130, 144, 191, 213]];
    const pixels = [0, 0];
    let outside = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      if (rgba[(y * 256 + x) * 4 + 3] < 32) continue;
      const leg = envelopes.findIndex(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
      if (leg === -1) outside++;
      else pixels[leg]++;
    }
    return { pixels, outside };
  });
  expect(result.outside).toBe(0);
  for (const count of result.pixels) expect(count).toBeGreaterThan(1000);
});
