import { test, expect } from '@playwright/test';
import { startSectorRun } from './helpers';

test.describe('M5 — Mobile UX & controls', () => {
  test('input buffer stores and applies direction', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_GAME_INPUT__!;
      api.clear();
      api.bufferDirection({ x: 0, y: -1 });
      const applied = api.applyBuffered();
      return { applied, direction: api.getDirection() };
    });

    expect(result.applied).toBe(true);
    expect(result.direction).toEqual({ x: 0, y: -1 });
  });

  test('mobile control settings sliders are available in lobby', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('lobby-settings-tab').click();

    await expect(page.getByTestId('mobile-control-settings')).toBeVisible();
    await expect(page.getByTestId('control-opacity-slider')).toBeVisible();
    await expect(page.getByTestId('control-size-slider')).toBeVisible();
    await expect(page.getByTestId('haptics-settings')).toBeVisible();
  });

  test('quick heal button appears on mobile during run with potion', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    await page.evaluate(() => window.__PIXLAB_TEST__?.addHealingPotion());
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });

    const quickHeal = page.getByTestId('quick-heal-button');
    await expect(quickHeal).toBeVisible();
    await expect(quickHeal).toBeEnabled();
  });

  test('dpad control is positioned without overlapping sector badge on short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await startSectorRun(page);

    const dpad = page.getByTestId('mobile-dpad-control');
    await expect(dpad).toBeVisible();

    const overlap = await page.evaluate(() => {
      const pad = document.querySelector('[data-testid="mobile-dpad-control"]') as HTMLElement | null;
      const badge = document.querySelector('.mobile-hud-sector-badge') as HTMLElement | null;
      if (!pad || !badge) return false;

      const padBox = pad.getBoundingClientRect();
      const badgeBox = badge.getBoundingClientRect();

      const separated =
        padBox.top >= badgeBox.bottom - 4 ||
        padBox.bottom <= badgeBox.top + 4 ||
        padBox.right <= badgeBox.left + 4 ||
        padBox.left >= badgeBox.right - 4;

      return !separated;
    });

    expect(overlap).toBe(false);
  });
});
