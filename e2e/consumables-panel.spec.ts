import { test, expect, type Page } from '@playwright/test';
import type { Item } from '../client/src/lib/game/types';

const KINDS: Array<Partial<Item> & { id: string; name: string; rarity: Item['rarity'] }> = [
  { id: 'k-heal', name: 'Potion of Healing', rarity: 'common', stats: { heal: 50 } },
  { id: 'k-speed', name: 'Stim of Swiftness', rarity: 'epic', stats: { speed: 1 } },
  { id: 'k-vision', name: 'Potion of Light', rarity: 'rare', stats: { vision: 1 } },
  { id: 'k-scroll', name: 'Scroll of Threat-sense', rarity: 'epic', stats: {} },
  { id: 'k-both', name: 'Genesis Elixir Lv8', rarity: 'legendary', stats: { heal: 200, speed: 1 } },
];

async function enterWithConsumables(page: Page, items: Array<Partial<Item> & { id: string }>) {
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.evaluate((items) => {
    for (const it of items) window.__PIXLAB_TEST__?.addConsumable(it as Partial<Item>);
  }, items);
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
}

test.describe('Consumables — desktop panel', () => {
  test('one glyph per consumable kind, with a stat line for vision potions and scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await enterWithConsumables(page, KINDS);

    const panel = page.getByTestId('consumables-panel');
    await expect(panel).toBeVisible();

    const kinds = await panel.evaluate((el) =>
      Array.from(el.querySelectorAll('.consumable-button')).map((b) => ({
        name: (b.querySelector('.consumable-name') as HTMLElement).innerText,
        kind: b.querySelector('svg')?.getAttribute('data-consumable-kind'),
        summary: (b.querySelector('.consumable-stats') as HTMLElement | null)?.innerText ?? null,
      })),
    );
    expect(kinds).toEqual([
      { name: 'Potion of Healing', kind: 'heal', summary: '+50 HP' },
      { name: 'Stim of Swiftness', kind: 'speed', summary: '+1 SPD' },
      { name: 'Potion of Light', kind: 'vision', summary: '+1 VIS' },
      { name: 'Scroll of Threat-sense', kind: 'scroll', summary: 'SCROLL' },
      { name: 'Genesis Elixir Lv8', kind: 'heal', summary: '+200 HP +1 SPD' },
    ]);
    // Distinct glyphs, not one flask for everything.
    expect(new Set(kinds.map((k) => k.kind)).size).toBe(4);
  });

  test('a long list scrolls inside the panel and never covers the MENU button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `many-${i}`,
      name: i % 3 === 0 ? 'Scroll of Threat-sense' : 'Potion of Healing',
      rarity: (['common', 'rare', 'epic', 'legendary'] as const)[i % 4],
      stats: i % 3 === 0 ? {} : { heal: 25 + i },
    }));
    await enterWithConsumables(page, many);

    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="consumables-panel"]')!;
      const list = panel.querySelector('.consumables-panel-list')!;
      const menu = document.querySelector('[data-testid="game-menu-button"]')!;
      const canvas = document.querySelector('canvas.game-canvas')!;
      const p = panel.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      const buttons = Array.from(panel.querySelectorAll('.consumable-button')).map((b) => b.getBoundingClientRect().width);
      return {
        panelTop: p.top,
        panelBottom: p.bottom,
        menuBottom: m.bottom,
        canvasBottom: c.bottom,
        listScrollHeight: list.scrollHeight,
        listClientHeight: list.clientHeight,
        overflowY: getComputedStyle(list).overflowY,
        maxButtonWidth: Math.max(...buttons),
        count: buttons.length,
      };
    });

    expect(geometry.count).toBe(12);
    expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.menuBottom);
    expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.canvasBottom + 1);
    expect(geometry.listScrollHeight).toBeGreaterThan(geometry.listClientHeight);
    expect(geometry.overflowY).toMatch(/auto|scroll/);
    expect(geometry.maxButtonWidth).toBeLessThanOrEqual(212);

    // MENU is still clickable with the panel open.
    await page.getByTestId('game-menu-button').click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // The last consumable is reachable by scrolling the list and still usable.
    const last = page.getByTestId('consumable-button-many-11');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
    await last.click();
    await expect(page.getByTestId('consumable-button-many-11')).toHaveCount(0);
  });
});

test.describe('Consumables — mobile quick menu', () => {
  test('menu rows use the same per-kind glyphs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enterWithConsumables(page, KINDS);
    await page.getByTestId('quick-consumables-button').click();
    const menu = page.getByTestId('quick-consumables-menu');
    await expect(menu).toBeVisible();
    const kinds = await menu.evaluate((el) =>
      Array.from(el.querySelectorAll('li svg')).map((s) => s.getAttribute('data-consumable-kind')),
    );
    expect(kinds).toEqual(['heal', 'speed', 'vision', 'scroll', 'heal']);
  });
});
