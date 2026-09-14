/** Non-destructive baseline capture using the real lobby OperatorPreview.
 * Run (starts Vite unless BASE_URL is set): node scripts/operator-art-baseline.mjs
 * Optional BASE_URL, BROWSER_EXECUTABLE_PATH, OUTPUT_DIR.
 * CAPTURE_SET: weapon-foundation, armor-gate, weapon-family, cuirass, boots; omitted = original baseline.
 * Production files are read-only. Use a new OUTPUT_DIR for after captures.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

const out = process.env.OUTPUT_DIR || 'docs/operator-art-baseline';
await mkdir(out, { recursive: true });
const server = process.env.BASE_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5000', '--strictPort'], { stdio: 'ignore' });
if (server) {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:5000')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) { server.kill(); throw Error('Vite did not become ready'); }
}
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && /operator|image/i.test(m.text())) errors.push(m.text()); });
const groups = { weapons: ['sword', 'spear', 'axe', 'dagger', 'mace'],
  armor: ['armor', 'shield', 'helmet', 'boots', 'gauntlets', 'gauntlets-sleeve'],
  utility: ['scope', 'thruster', 'scanner', 'amplifier'] };
const assets = ['operator.png', 'operator-hand.png', ...Object.entries(groups).flatMap(([g, names]) => names.map(n => `${g}/${n}.png`))];
const cases = process.env.CAPTURE_SET === 'boots' ? [
  ['boots-amplifier', null, 'boots', 'amplifier'],
  ['dagger-boots-amplifier', 'dagger', 'boots', 'amplifier'],
] : process.env.CAPTURE_SET === 'cuirass' ? [
  ['armor-only', null, 'armor', null],
  ['armor-thruster', null, 'armor', 'thruster'],
  ['sword-armor-scope', 'sword', 'armor', 'scope'],
] : process.env.CAPTURE_SET === 'weapon-family' ? [
  ['axe-armor-scanner', 'axe', 'armor', 'scanner'],
  ['dagger-armor-amplifier', 'dagger', 'armor', 'amplifier'],
  ['mace-armor-thruster', 'mace', 'armor', 'thruster'],
  ...groups.weapons.map(w => [`${w}-gauntlets-scope`, w, 'gauntlets', 'scope']),
] : process.env.CAPTURE_SET === 'armor-gate' ? [
  ['sword-armor-scope', 'sword', 'armor', 'scope'],
  ['spear-shield-scanner', 'spear', 'shield', 'scanner'],
  ['sword-helmet-scope', 'sword', 'helmet', 'scope'],
  ['sword-shield-thruster', 'sword', 'shield', 'thruster'],
  ['spear-helmet-amplifier', 'spear', 'helmet', 'amplifier'],
] : process.env.CAPTURE_SET === 'weapon-foundation' ? [
  ['sword-armor-scope', 'sword', 'armor', 'scope'],
  ['sword-gauntlets-scope', 'sword', 'gauntlets', 'scope'],
  ['sword-shield-scanner', 'sword', 'shield', 'scanner'],
  ['spear-armor-thruster', 'spear', 'armor', 'thruster'],
  ['spear-shield-scanner', 'spear', 'shield', 'scanner'],
  ['spear-gauntlets-scope', 'spear', 'gauntlets', 'scope'],
] : [
  ['bare', null, null, null],
  ['sword-armor-scope', 'sword', 'armor', 'scope'],
  ['spear-shield-scanner', 'spear', 'shield', 'scanner'],
  ['dagger-boots-amplifier', 'dagger', 'boots', 'amplifier'],
  ['mace-helmet-thruster', 'mace', 'helmet', 'thruster'],
  ['axe-gauntlets-scanner', 'axe', 'gauntlets', 'scanner'],
  ...groups.weapons.map(w => [`${w}-gauntlets-scope`, w, 'gauntlets', 'scope']),
  ['helmet-scope', null, 'helmet', 'scope'],
  ['shield-thruster', null, 'shield', 'thruster'],
  ['armor-thruster', null, 'armor', 'thruster'],
  ['boots-amplifier', null, 'boots', 'amplifier'],
];
try {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5000');
  const measured = await page.evaluate(async assets => {
    const result = [];
    window.__artBaselineImages = {};
    for (const file of assets) {
      const img = new Image(); img.src = `/imgs/compendium/ops/${file}`; await img.decode();
      window.__artBaselineImages[file] = img;
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const bounds = threshold => {
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1, pixels = 0, edgePixels = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (data[(y*c.width+x)*4+3] >= threshold) {
          x0 = Math.min(x0,x); y0 = Math.min(y0,y); x1 = Math.max(x1,x); y1 = Math.max(y1,y); pixels++;
          if (!x || !y || x === c.width-1 || y === c.height-1) edgePixels++;
        }
        return { x0, y0, x1, y1, pixels, edgePixels };
      };
      result.push({ file, width: img.width, height: img.height, alphaNonzero: bounds(1), alphaSolid: bounds(128),
        transparentPixels: Array.from(data).filter((v,i) => i%4===3 && v===0).length });
    }
    return result;
  }, assets);
  for (const m of measured) {
    const bytes = await readFile(`client/public/imgs/compendium/ops/${m.file}`);
    m.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  await page.getByTestId('start-run-button').click();
  await page.evaluate(() => window.__PIXLAB_TEST__.setLobbyTab('loadout'));
  const items = Object.entries(groups).flatMap(([g, names]) => names.filter(n => n !== 'gauntlets-sleeve').map(n => ({
    id: `baseline-${n}`, name: n[0].toUpperCase()+n.slice(1), type: g === 'weapons' ? 'weapon' : g,
    rarity: 'common', stats: {}, price: 0, description: 'Baseline capture fixture',
  })));
  await page.evaluate(items => { for (const item of items) window.__PIXLAB_TEST__.addConsumable(item); }, items);
  const renders = [];
  for (const [name, weapon, armor, utility] of cases) {
    for (const slot of ['weapon', 'armor', 'utility']) {
      const button = page.getByTestId(`unequip-${slot}`);
      if (await button.count()) await button.click();
    }
    for (const subtype of [weapon, armor, utility].filter(Boolean)) await page.getByTestId(`item-action-baseline-${subtype}`).click();
    const loadout = Object.fromEntries(['weapon','armor','utility'].map((slot, i) => [slot, items.find(item => item.id === `baseline-${[weapon,armor,utility][i]}`) || null]));
    // Wait for the React component's async compositor, comparing to the exact
    // same production rendering function, rather than assuming a fixed delay.
    const expected = await page.evaluate(async loadout => {
      const { renderOperatorWithGear } = await import('/src/lib/game/compendium.ts');
      const c = document.createElement('canvas'); await renderOperatorWithGear(c, loadout);
      return c.toDataURL();
    }, loadout);
    await page.waitForFunction(expected => document.querySelector('[data-testid="operator-preview"] canvas')?.toDataURL() === expected, expected);
    const canvas = page.getByTestId('operator-preview').locator('canvas');
    const data = await canvas.evaluate(c => ({ width: c.width, height: c.height, png: c.toDataURL(),
      display: { width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height },
      smoothing: c.getContext('2d').imageSmoothingEnabled, cssImageRendering: getComputedStyle(c).imageRendering }));
    if (data.width !== 320 || data.height !== 320) throw Error(`Unexpected composite size: ${name}`);
    await writeFile(path.join(out, `${name}.png`), Buffer.from(data.png.split(',')[1], 'base64'));
    const { png, ...dimensions } = data;
    renders.push({ name, loadout: { weapon, armor, utility }, ...dimensions });
    console.log(`Captured ${name}`);
  }
  await page.getByTestId('operator-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'lobby-desktop.png') });
  await page.setViewportSize({ width: 393, height: 727 });
  await page.getByTestId('operator-preview').scrollIntoViewIfNeeded();
  const phone = await page.getByTestId('operator-preview').locator('canvas').boundingBox();
  await page.screenshot({ path: path.join(out, 'lobby-phone.png') });
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(path.join(out, 'measurements.json'), JSON.stringify({
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    coordinateConvention: 'Source pixels; inclusive bounds. Multiply by 1.25 for canvas coordinates. Alpha threshold 1 includes antialiasing.',
    assets: measured, composites: renders, phoneDisplay: phone, runtimeErrors: errors,
  }, null, 2)+'\n');
  console.log(`Saved ${renders.length} real OperatorPreview composites and ${measured.length} asset measurements to ${out}`);
} finally { await browser.close(); server?.kill(); }
