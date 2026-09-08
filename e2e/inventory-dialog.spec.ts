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

    test(`every action button is reachable at ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      const dialog = await openInGameInventory(page);

      // The assertions above only prove the dialog cannot be *scrolled*
      // horizontally. `DialogContent` is `overflow-x-hidden`, so a row that is
      // too wide is silently **clipped** instead — which is exactly how UNEQUIP
      // ended up off-screen and untappable while this suite stayed green.
      const buttons = await dialog.evaluate((dlg) => {
        const box = dlg.getBoundingClientRect();
        return Array.from(
          dlg.querySelectorAll<HTMLElement>('[data-testid^="unequip-"], [data-testid^="item-action-"]'),
        ).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            testid: el.dataset.testid ?? '?',
            label: (el.textContent ?? '').trim(),
            overflowRight: Math.round(r.right - box.right),
            overflowLeft: Math.round(box.left - r.left),
            width: Math.round(r.width),
            insideViewport: r.right <= window.innerWidth + 1 && r.left >= -1,
          };
        });
      });

      // The fixture equips a weapon, armor and a utility with long names, so
      // there is something to check.
      expect(buttons.length).toBeGreaterThanOrEqual(3);
      for (const b of buttons) {
        expect(b.width, `${b.testid} has no width`).toBeGreaterThan(0);
        expect(b.overflowRight, `${b.testid} (${b.label}) hangs ${b.overflowRight}px past the dialog`)
          .toBeLessThanOrEqual(1);
        expect(b.overflowLeft, `${b.testid} (${b.label}) hangs ${b.overflowLeft}px off the left`)
          .toBeLessThanOrEqual(1);
        expect(b.insideViewport, `${b.testid} is outside the viewport`).toBe(true);
      }

      // Clipping is not enough to prove tappability — the element also has to
      // be the one that receives the tap.
      const first = dialog.locator('[data-testid^="unequip-"]').first();
      await expect(first).toBeVisible();
      const hitsItself = await first.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el === at || el.contains(at);
      });
      expect(hitsItself, 'the UNEQUIP button is not the element at its own centre').toBe(true);
    });
  }

  // Checked at four widths on purpose. The first version of this test ran only
  // at 390x844 and passed while the buttons sat hard right on anything >= 768px
  // -- including an iPhone in landscape, which is 844px wide.
  for (const vp of [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
  ]) {
  test(`the filter buttons are centred at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    const dialog = await openInGameInventory(page);

    // The lobby centres these under 768px via `.lobby-page
    // .inventory-header-mobile` in mobile.css. The dialog is portaled to
    // document.body and the vendor is `.vendor-station-page`, so neither is
    // inside `.lobby-page` and neither ever saw that rule — the layout has to
    // travel with the component instead.
    const geometry = await dialog.evaluate((dlg) => {
      const bar = dlg.querySelector('[data-testid="item-type-filter-bar"]') as HTMLElement;
      const group = bar.querySelector('div:last-of-type') as HTMLElement;
      const buttons = Array.from(
        bar.querySelectorAll<HTMLElement>('[data-testid^="item-filter-"]'),
      ).map((b) => b.getBoundingClientRect());
      const barBox = bar.getBoundingClientRect();
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      return {
        count: buttons.length,
        stacked: getComputedStyle(bar).flexDirection === 'column',
        leftGap: Math.round(first.left - barBox.left),
        rightGap: Math.round(barBox.right - last.right),
        groupJustify: getComputedStyle(group).justifyContent,
      };
    });

    expect(geometry.count).toBe(5);
    expect(geometry.stacked, 'the bar should stack the heading above the buttons').toBe(true);
    expect(geometry.groupJustify).toBe('center');
    // Centred means equal slack either side, within a pixel of rounding.
    expect(
      Math.abs(geometry.leftGap - geometry.rightGap),
      `at ${vp.width}px: left gap ${geometry.leftGap}px vs right gap ${geometry.rightGap}px`,
    ).toBeLessThanOrEqual(2);
  });
  }

  test('the dialog can filter by item type', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openInGameInventory(page);

    const bar = dialog.locator('[data-testid="item-type-filter-bar"]');
    await expect(bar).toBeVisible();

    const rows = () => dialog.locator('[data-testid^="item-action-"]');
    const allCount = await rows().count();
    expect(allCount).toBeGreaterThan(0);

    // The fixture holds one weapon, one armor, one utility and two consumables.
    await dialog.locator('[data-testid="item-filter-weapon"]').click();
    await expect(rows()).toHaveCount(1);

    await dialog.locator('[data-testid="item-filter-consumable"]').click();
    // Consumables are not equippable, so they render no action button.
    await expect(rows()).toHaveCount(0);
    await expect(dialog.getByText(/NO CONSUMABLE ITEMS|EMPTY/)).toHaveCount(0);

    await dialog.locator('[data-testid="item-filter-all"]').click();
    await expect(rows()).toHaveCount(allCount);
  });
});
