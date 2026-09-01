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

  test('release clears buffered direction to prevent ghost movement', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_GAME_INPUT__!;
      api.clear();
      api.setDirection({ x: 1, y: 0 });
      api.bufferDirection({ x: 1, y: 0 });
      api.setDirection({ x: 0, y: 0 });
      const applied = api.applyBuffered();
      return {
        applied,
        direction: api.getDirection(),
        buffered: api.getBufferedDirection(),
      };
    });

    expect(result.applied).toBe(false);
    expect(result.direction).toEqual({ x: 0, y: 0 });
    expect(result.buffered).toBeNull();
  });

  test('mobile HUD settings sliders are available in lobby', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('lobby-settings-tab').click();

    await expect(page.getByTestId('mobile-hud-settings')).toBeVisible();
    await expect(page.getByTestId('hud-opacity-slider')).toBeVisible();
    await expect(page.getByTestId('hud-size-slider')).toBeVisible();
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

  test('sector badge sits in lower HUD band on short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'dpad' });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });

    const dpad = page.getByTestId('mobile-dpad-control');
    await expect(dpad).toBeVisible();

    const layout = await page.evaluate(() => {
      const badge = document.querySelector('.mobile-hud-sector-badge') as HTMLElement | null;
      if (!badge) return null;

      const badgeBox = badge.getBoundingClientRect();
      const vh = window.innerHeight;

      return {
        // Lower third of screen (not mid-screen like the M5 regression)
        inLowerBand: badgeBox.top > vh * 0.55,
        // Above the D-pad vertical center so label stays readable
        aboveDpadCenter: badgeBox.bottom <= vh - 80,
      };
    });

    expect(layout?.inLowerBand).toBe(true);
    expect(layout?.aboveDpadCenter).toBe(true);
  });

  test('mobile sector timer bar is on right edge away from browser chrome', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await startSectorRun(page);

    const timer = page.getByTestId('mobile-sector-timer-bar');
    await expect(timer).toBeVisible();
    await expect(page.getByTestId('hud-sector-timer')).toBeVisible();

    const layout = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="mobile-sector-timer-bar"]') as HTMLElement | null;
      if (!bar) return null;
      const rect = bar.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      return {
        onRightEdge: rect.right >= vw - 24,
        notBottomPinned: rect.bottom < vh - 48,
        hasHeight: rect.height > 80,
      };
    });

    expect(layout?.onRightEdge).toBe(true);
    expect(layout?.notBottomPinned).toBe(true);
    expect(layout?.hasHeight).toBe(true);

    const anchoredBottom = await page.evaluate(() => {
      const track = document.querySelector('.mobile-sector-timer-track') as HTMLElement | null;
      const fill = document.querySelector('[data-testid="mobile-sector-timer-fill"]') as HTMLElement | null;
      if (!track || !fill) return false;
      const trackRect = track.getBoundingClientRect();
      const fillRect = fill.getBoundingClientRect();
      return Math.abs(fillRect.bottom - trackRect.bottom) <= 3;
    });
    expect(anchoredBottom).toBe(true);
  });

  test('mobile sector timer and quick heal use HUD opacity and size variables', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ controlOpacity: 0.6, controlSize: 1.1 });
      window.__PIXLAB_TEST__?.addHealingPotion();
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });

    const styles = await page.evaluate(() => {
      const root = document.querySelector('.relative.w-full.h-screen') as HTMLElement | null;
      const timer = document.querySelector('.mobile-sector-timer') as HTMLElement | null;
      const quickHeal = document.querySelector('.mobile-quick-heal') as HTMLElement | null;
      const stats = document.querySelector('.mobile-hud-stats') as HTMLElement | null;
      const badge = document.querySelector('.mobile-hud-sector-badge') as HTMLElement | null;
      if (!root || !timer || !quickHeal || !stats || !badge) return null;
      const rootStyle = getComputedStyle(root);
      return {
        hudOpacity: rootStyle.getPropertyValue('--mobile-hud-opacity').trim(),
        hudScale: rootStyle.getPropertyValue('--mobile-hud-scale').trim(),
        timerOpacity: getComputedStyle(timer).opacity,
        quickHealOpacity: getComputedStyle(quickHeal).opacity,
        statsOpacity: getComputedStyle(stats).opacity,
        badgeOpacity: getComputedStyle(badge).opacity,
      };
    });

    expect(styles?.hudOpacity).toBe('0.6');
    expect(styles?.hudScale).toBe('1.1');
    expect(Number(styles?.timerOpacity)).toBeCloseTo(0.6, 1);
    expect(Number(styles?.quickHealOpacity)).toBeCloseTo(0.6, 1);
    expect(Number(styles?.statsOpacity)).toBeCloseTo(0.6, 1);
    expect(Number(styles?.badgeOpacity)).toBeCloseTo(0.6, 1);
  });

  test('toast viewport clears mobile status bar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const paddingTop = await page.evaluate(() => {
      const viewport = document.querySelector('[data-testid="toast-viewport"]') as HTMLElement | null;
      return viewport ? parseFloat(getComputedStyle(viewport).paddingTop) : 0;
    });

    expect(paddingTop).toBeGreaterThanOrEqual(40);
  });

  test('toast viewport stacks below global CRT blinds overlay', async ({ page }) => {
    await page.goto('/');

    const stacking = await page.evaluate(() => {
      const toast = document.querySelector('[data-testid="toast-viewport"]') as HTMLElement | null;
      const blinds = document.querySelector('[data-testid="crt-blinds-overlay"]') as HTMLElement | null;
      if (!toast || !blinds) return null;
      return {
        toastZ: Number(getComputedStyle(toast).zIndex),
        blindsZ: Number(getComputedStyle(blinds).zIndex),
      };
    });

    expect(stacking).not.toBeNull();
    expect(stacking!.toastZ).toBeLessThan(stacking!.blindsZ);
  });

  test('mobile toast stacks above HUD chrome during run', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.evaluate(() => window.__PIXLAB_TEST__?.setCoins(500));
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });

    const stacking = await page.evaluate(() => {
      const toast = document.querySelector('[data-testid="toast-viewport"]') as HTMLElement | null;
      const stats = document.querySelector('.mobile-hud-stats') as HTMLElement | null;
      const timer = document.querySelector('.mobile-sector-timer') as HTMLElement | null;
      const badge = document.querySelector('.mobile-hud-sector-badge') as HTMLElement | null;
      if (!toast || !stats || !timer || !badge) return null;
      const toastZ = Number(getComputedStyle(toast).zIndex);
      const hudZ = Math.max(
        Number(getComputedStyle(stats).zIndex),
        Number(getComputedStyle(timer).zIndex),
        Number(getComputedStyle(badge).zIndex),
      );
      return { toastZ, hudZ };
    });

    expect(stacking).not.toBeNull();
    expect(stacking!.toastZ).toBeGreaterThan(stacking!.hudZ);
  });
});
