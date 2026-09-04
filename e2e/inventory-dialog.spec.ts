import { test, expect, type Page } from '@playwright/test';
import type { Item } from '../client/src/lib/game/types';

// Long names and a full loadout make the dialog as wide as it can get.
const ITEMS: Array<Partial<Item> & { id: string }> = [
  { id: 'inv-1', name: 'Legendary Masterwork Greatsword of the Eternal Catacombs Lv12', type: 'weapon', rarity: 'legendary', stats: { damage: 42 } },
  { id: 'inv-2', name: 'Enhanced Plate Armor of Unyielding Resolve Lv9', type: 'armor', rarity: 'rare', stats: { defense: 12 } },
  { id: 'inv-3', name: 'Lens of Farsight Lv7', type: 'utility', rarity: 'epic', stats: { vision: 2 } },
  { id: 'inv-4', name: 'Scroll of Threat-sense', type: 'consumable', rarity: 'epic', stats: {} },
  { id: 'inv-5', name: 'Genesis Elixir Lv8', type: 'consumable', rarity: 'legendary', stats: { heal: 200, speed: 1 } },
];

async function openInGameInventory(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.evaluate((items) => {
    for (const it of items) window.__PIXLAB_TEST__?.addConsumable({ ...it, price: 10, description: '' } as Partial<Item>);
  }, ITEMS);
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  await page.getByTestId('game-menu-button').click();
  await page.getByRole('menuitem', { name: /inventory/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(250);
  return dialog;
}

test.describe('In-game inventory dialog', () => {
  test('renders beneath the CRT scanline overlay', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const dialog = await openInGameInventory(page);

    const stacking = await dialog.evaluate((dlg) => {
      const blinds = document.querySelector('[data-testid="crt-blinds-overlay"]') as HTMLElement;
      const r = dlg.getBoundingClientRect();
      // The overlay is pointer-events:none so hit-testing skips it; briefly make
      // it hittable to read the real paint order at the dialog's centre.
      blinds.style.pointerEvents = 'auto';
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      blinds.style.pointerEvents = '';
      return {
        topmostIsBlinds: hit === blinds,
        blindsZ: Number(getComputedStyle(blinds).zIndex),
        dialogZ: Number(getComputedStyle(dlg).zIndex),
        toastZ: Number(getComputedStyle(document.querySelector('[data-testid="toast-viewport"]')!).zIndex),
      };
    });

    expect(stacking.topmostIsBlinds).toBe(true);
    expect(stacking.blindsZ).toBeGreaterThan(stacking.dialogZ);
    // Toasts clear the dialog but stay under the scanlines too.
    expect(stacking.toastZ).toBeGreaterThan(stacking.dialogZ);
    expect(stacking.toastZ).toBeLessThan(stacking.blindsZ);
  });

  for (const vp of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    test(`cannot scroll horizontally at ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      const dialog = await openInGameInventory(page);

      const scroll = await dialog.evaluate((dlg) => {
        const before = dlg.scrollLeft;
        dlg.scrollLeft = 500;
        const after = dlg.scrollLeft;
        dlg.scrollLeft = before;
        // Any descendant that is itself a horizontal scroller would be a second escape hatch.
        const innerScrollers = Array.from(dlg.querySelectorAll<HTMLElement>('*')).filter((el) => {
          const ox = getComputedStyle(el).overflowX;
          return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
        }).length;
        const statsRow = dlg.querySelector('[data-testid="inventory-stats-row"]') as HTMLElement;
        return {
          movedBy: after,
          overflowX: getComputedStyle(dlg).overflowX,
          scrollWidth: dlg.scrollWidth,
          clientWidth: dlg.clientWidth,
          innerScrollers,
          statsRowFits: statsRow.scrollWidth <= statsRow.clientWidth + 1,
          dialogWidth: dlg.getBoundingClientRect().width,
          viewportWidth: window.innerWidth,
        };
      });

      expect(scroll.movedBy).toBe(0);
      expect(scroll.overflowX).toBe('hidden');
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);
      expect(scroll.innerScrollers).toBe(0);
      expect(scroll.statsRowFits).toBe(true);
      expect(scroll.dialogWidth).toBeLessThanOrEqual(scroll.viewportWidth + 1);
    });
  }
});
