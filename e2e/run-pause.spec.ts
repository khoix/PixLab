import { test, expect, type Page } from '@playwright/test';
import { startSectorRun } from './helpers';

async function openMenu(page: Page) {
  await page.getByTestId('game-menu-button').click();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
}

async function openInventory(page: Page) {
  await openMenu(page);
  await page.getByRole('menuitem', { name: /inventory/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Run pause — indicator, layout stability, toast stacking', () => {
  test('a PAUSED badge appears while the menu or inventory is open and clears on resume', async ({ page }) => {
    await startSectorRun(page);
    const badge = page.getByTestId('pause-indicator');
    await expect(badge).toHaveCount(0);

    await openMenu(page);
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('PAUSED');
    expect(await page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(true);

    await page.keyboard.press('Escape');
    await expect(badge).toHaveCount(0);
    expect(await page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(false);

    // Let the dropdown finish its close animation before re-opening it.
    await page.waitForTimeout(350);
    await openInventory(page);
    await expect(badge).toBeVisible();
    // The badge sits under the dialog, not over it.
    const zs = await page.evaluate(() => ({
      badge: Number(getComputedStyle(document.querySelector('[data-testid="pause-indicator"]')!).zIndex),
      dialog: Number(getComputedStyle(document.querySelector('[role="dialog"]')!).zIndex),
    }));
    expect(zs.badge).toBeLessThan(zs.dialog);
    await page.keyboard.press('Escape');
    await expect(badge).toHaveCount(0);
  });

  test('the world dims while paused and the badge never intercepts input', async ({ page }) => {
    await startSectorRun(page);
    await page.waitForTimeout(300);

    const sample = () =>
      page.evaluate(() => {
        const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        // Average brightness of the player's neighbourhood (always lit floor).
        const [, , , cx, cy] = window.__PIXLAB_FOG__!.getStats().lastKey.split(':').map(Number);
        const scale = canvas.width / window.__PIXLAB_CANVAS__!.getDimensions(canvas).logicalWidth;
        const d = ctx.getImageData(Math.round((cx - 40) * scale), Math.round((cy - 40) * scale), Math.round(80 * scale), Math.round(80 * scale)).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        return sum / (d.length / 4) / 3;
      });

    const lit = await sample();
    await openMenu(page);
    await page.waitForTimeout(150);
    const dimmed = await sample();
    expect(dimmed).toBeLessThan(lit * 0.75);

    const pointer = await page.getByTestId('pause-indicator').evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointer).toBe('none');
  });

  test('pausing does not move the screen: run root fills the viewport and the document cannot scroll', async ({ page }) => {
    await startSectorRun(page);
    await page.waitForTimeout(200);

    const measure = () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-testid="run-screen"]')!.getBoundingClientRect();
        const canvas = document.querySelector('canvas.game-canvas')!.getBoundingClientRect();
        const html = document.documentElement;
        return {
          rootTop: root.top,
          rootHeight: root.height,
          canvasTop: canvas.top,
          innerHeight: window.innerHeight,
          scrollY: window.scrollY,
          docScrollable: html.scrollHeight > html.clientHeight,
          htmlOverflow: getComputedStyle(html).overflowY,
          bodyOverflow: getComputedStyle(document.body).overflowY,
          runActive: html.classList.contains('run-active'),
        };
      });

    const before = await measure();
    expect(before.runActive).toBe(true);
    expect(before.htmlOverflow).toBe('hidden');
    expect(before.bodyOverflow).toBe('hidden');
    expect(before.docScrollable).toBe(false);
    expect(Math.abs(before.rootHeight - before.innerHeight)).toBeLessThanOrEqual(1);

    await openMenu(page);
    await page.waitForTimeout(250);
    const menuOpen = await measure();
    expect(menuOpen.rootTop).toBe(before.rootTop);
    expect(menuOpen.canvasTop).toBe(before.canvasTop);
    expect(menuOpen.scrollY).toBe(0);

    await page.getByRole('menuitem', { name: /inventory/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(250);
    const inventoryOpen = await measure();
    expect(inventoryOpen.rootTop).toBe(before.rootTop);
    expect(inventoryOpen.canvasTop).toBe(before.canvasTop);
    expect(inventoryOpen.scrollY).toBe(0);
    expect(inventoryOpen.docScrollable).toBe(false);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const after = await measure();
    expect(after.rootTop).toBe(before.rootTop);
    expect(after.canvasTop).toBe(before.canvasTop);
  });

  test('leaving the run releases the document scroll lock', async ({ page }) => {
    await startSectorRun(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains('run-active'))).toBe(true);
    await page.evaluate(() => window.__PIXLAB_TEST__?.setScreen('lobby'));
    await page.locator('.lobby-page').waitFor({ state: 'visible' });
    expect(await page.evaluate(() => document.documentElement.classList.contains('run-active'))).toBe(false);
  });

  test('mobile: a toast paints beneath the CRT scanlines and above the HUD', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.evaluate(() =>
      window.__PIXLAB_TEST__?.addConsumable({ id: 'pt-heal', name: 'Potion of Healing', rarity: 'common', stats: { heal: 50 } }),
    );
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);

    await page.getByTestId('quick-heal-button').click();
    const toast = page.locator('[data-testid="toast-viewport"] li').first();
    await expect(toast).toBeVisible();

    const stacking = await toast.evaluate((el) => {
      const blinds = document.querySelector('[data-testid="crt-blinds-overlay"]') as HTMLElement;
      const r = el.getBoundingClientRect();
      blinds.style.pointerEvents = 'auto';
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      blinds.style.pointerEvents = '';
      const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const hud = document.querySelector('.mobile-hud-stats') as HTMLElement | null;
      return {
        blindsOnTop: top === blinds,
        toastUnderBlinds: !!under && el.contains(under),
        toastZ: Number(getComputedStyle(el.closest('[data-testid="toast-viewport"]')!).zIndex),
        hudZ: hud ? Number(getComputedStyle(hud).zIndex) : 0,
      };
    });
    expect(stacking.blindsOnTop).toBe(true);
    expect(stacking.toastUnderBlinds).toBe(true);
    expect(stacking.toastZ).toBeGreaterThan(stacking.hudZ);
  });
});
