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

for (const layer of [
  { name: 'gauntlets', bounds: [[74, 119, 93, 139], [155, 102, 191, 129]], minimum: [180, 450] },
  { name: 'gauntlets-sleeve', bounds: [[77, 106, 96, 122]], minimum: [150] },
]) test(`${layer.name} preserves its independent attachment envelopes`, async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ name, bounds }) => {
    const img = new Image(); img.src = `/imgs/compendium/ops/armor/${name}.png`; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, 256, 256).data;
    const pixels = bounds.map(() => 0); let outside = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      if (data[(y * 256 + x) * 4 + 3] < 32) continue;
      const part = bounds.findIndex(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
      if (part < 0) outside++; else pixels[part]++;
    }
    return { pixels, outside };
  }, layer);
  expect(result.outside).toBe(0);
  result.pixels.forEach((n, i) => expect(n).toBeGreaterThan(layer.minimum[i]));
});

test('undersuit revision preserves original identity, grips and background anchors', async ({ page }) => {
  // Digests measured from the pre-revision operator, not the new image.
  const regions = [
    { name: 'head', rect: [110, 48, 159, 84], hash: '26e25cd998ca958679a90ab1c9d775c9125131fa36b1daca6ba786eccdd23a3e' },
    { name: 'grip', rect: [74, 124, 90, 139], hash: '9a6270dffb02c0491908f0a6f16ef04b370a56acf160178e81318b3011d9d460' },
    { name: 'raised fist', rect: [174, 102, 190, 123], hash: 'bd37d04779f29c6cc3c50393bc01d2067fbe9fd5818e004662194e0153acd16e' },
    { name: 'sky', rect: [0, 0, 255, 47], hash: '20fd78262d6e782697312f69aeb773833e38d1083e374ba4a4187ec0ff9fd9e1' },
    { name: 'ground', rect: [0, 211, 255, 255], hash: '46503d48c3b6620c24e3c4ff638179e29f32a2bd0ca27ae1606ecb8c4760c0fb' },
  ];
  await page.goto('/');
  const hashes = await page.evaluate(async regions => {
    const img = new Image(); img.src = '/imgs/compendium/ops/operator.png'; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return Promise.all(regions.map(async ({ rect: [x0, y0, x1, y1] }) => {
      const bytes = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }));
  }, regions);
  hashes.forEach((hash, i) => expect(hash, regions[i].name).toBe(regions[i].hash));
});
