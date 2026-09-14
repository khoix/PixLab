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
