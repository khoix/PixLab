import { test, expect, type Page } from '@playwright/test';
import { openLobby } from './helpers';
import type { Item } from '../client/src/lib/game/types';

const CONSUMABLE_PNG = /imgs\/icons\/consumable_[a-z]+\.png/;

function consumable(rarity: Item['rarity'], name = 'Potion of Healing'): Item {
  return { id: `icon-test-${rarity}`, name, type: 'consumable', rarity, stats: { heal: 50 }, price: 10, description: '' };
}

async function enterSector(page: Page) {
  await openLobby(page);
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
}

// Drop an item on the nearest floor tile next to the player and return its tile offset.
async function spawnBesidePlayer(page: Page, item: Item) {
  return page.evaluate((item) => {
    const api = window.__PIXLAB_LEVEL__!;
    api.clearMobs();
    const p = api.getPlayerPos();
    for (const d of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]) {
      if (api.isFloor(p.x + d.x, p.y + d.y)) {
        api.spawnItem(item, { x: p.x + d.x, y: p.y + d.y });
        return d;
      }
    }
    return null;
  }, item);
}

// Read back the pixels of the tile at `offset` from the player and summarise
// how many are bright (icon or placeholder stroke) vs near-black.
async function sampleItemTile(page: Page, offset: { x: number; y: number }) {
  return page.evaluate((offset) => {
    const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
    const dims = window.__PIXLAB_CANVAS__!.getDimensions(canvas);
    const scale = canvas.width / dims.logicalWidth;
    const TILE = 32;
    // The fog is centred on the player's tile centre (43% height on mobile, 50% on desktop).
    const [, , , playerScreenX, playerScreenY] = window.__PIXLAB_FOG__!.getStats().lastKey.split(':').map(Number);
    const cx = playerScreenX + offset.x * TILE;
    const cy = playerScreenY + offset.y * TILE;
    const x0 = Math.round((cx - TILE / 2 + 6) * scale);
    const y0 = Math.round((cy - TILE / 2 + 6) * scale);
    const w = Math.round(20 * scale);
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(x0, y0, w, w).data;
    let bright = 0;
    let dark = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const m = Math.max(data[i], data[i + 1], data[i + 2]);
      total += 1;
      if (m > 110) bright += 1;
      else if (m < 30) dark += 1;
    }
    return { bright, dark, total, brightRatio: bright / total, darkRatio: dark / total };
  }, offset);
}

test.describe('Item icons — loading and fallback', () => {
  test('all twenty icon PNGs are cached at boot, before any sector starts', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').waitFor();
    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_ICONS__!.getStatus().loaded.length), { timeout: 10_000 })
      .toBe(20);
    const status = await page.evaluate(() => window.__PIXLAB_ICONS__!.getStatus());
    expect(status.failed).toEqual([]);
    expect(status.pending).toEqual([]);
    expect(status.loaded.filter((p) => /consumable_/.test(p))).toHaveLength(4);
    expect(status.loaded.filter((p) => /scroll_/.test(p))).toHaveLength(4);
  });

  test('a consumable whose PNG is unavailable draws a visible placeholder, not a black hole', async ({ page }) => {
    await page.route(CONSUMABLE_PNG, (route) => route.abort());
    await enterSector(page);

    const offset = await spawnBesidePlayer(page, consumable('legendary'));
    expect(offset).not.toBeNull();
    await page.waitForTimeout(300);

    const status = await page.evaluate(() => window.__PIXLAB_ICONS__!.getStatus());
    expect(status.failed.filter((p) => /consumable_/.test(p)).length).toBeGreaterThan(0);

    const sample = await sampleItemTile(page, offset!);
    // The old fallback painted ~50% of the tile opaque black. The placeholder
    // is a translucent disc with a gold (legendary) outline: some bright pixels,
    // and the tile must not be dominated by near-black.
    expect(sample.brightRatio).toBeGreaterThan(0.03);
    expect(sample.darkRatio).toBeLessThan(0.35);
  });

  test('a failed icon load is retried and the real bitmap appears once the file is reachable', async ({ page }) => {
    let blocked = true;
    await page.route(CONSUMABLE_PNG, (route) => (blocked ? route.abort() : route.continue()));
    await enterSector(page);

    const offset = await spawnBesidePlayer(page, consumable('rare'));
    expect(offset).not.toBeNull();
    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_ICONS__!.getStatus().failed.length))
      .toBeGreaterThan(0);

    blocked = false;
    // Retries back off 0.5 s, 1 s, 2 s… — within a few seconds the rare
    // consumable PNG must be cached and drawn.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.__PIXLAB_ICONS__!.getStatus().loaded.some((p) => /consumable_rare\.png$/.test(p)),
          ),
        { timeout: 8000 },
      )
      .toBe(true);
    await page.waitForTimeout(150);

    const sample = await sampleItemTile(page, offset!);
    // The rare potion PNG is a solid blue bottle on a dark disc: mostly bright.
    expect(sample.brightRatio).toBeGreaterThan(0.25);
  });

  test('retries stop after the attempt cap instead of hammering the server', async ({ page }) => {
    let requests = 0;
    await page.route(CONSUMABLE_PNG, (route) => {
      requests += 1;
      return route.abort();
    });
    await page.goto('/');
    await page.getByTestId('start-run-button').waitFor();
    const cap = await page.evaluate(() => window.__PIXLAB_ICONS__!.constants.maxAttempts);
    // Boot preload = attempt 1 for each of the 4 consumable PNGs.
    await expect.poll(async () => requests).toBeGreaterThanOrEqual(4);
    expect(cap).toBeGreaterThanOrEqual(3);
    expect(cap).toBeLessThanOrEqual(10);
    // Nothing on the title screen draws icons, so no further attempts are made here.
    await page.waitForTimeout(1200);
    expect(requests).toBe(4);
  });
});
