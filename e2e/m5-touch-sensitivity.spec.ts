import { test, expect } from '@playwright/test';

async function openLobbySettings(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.getByTestId('lobby-settings-tab').click();
}

test.describe('M5.3 — Floating touch sensitivity & settings', () => {
  test('touchpad option is removed from settings', async ({ page }) => {
    await openLobbySettings(page);
    await expect(page.getByLabel('Touchpad (Swipe & Tap)')).toHaveCount(0);
    await expect(page.getByLabel('Directional Pad')).toBeVisible();
    await expect(page.getByLabel('Floating Touch (anywhere)')).toBeVisible();
  });

  test('legacy touchpad setting normalizes to floating touch', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'touchpad' as 'dpad' });
    });

    await page.getByTestId('lobby-settings-tab').click();
    const floatingSelected = await page.evaluate(() => {
      const el = document.querySelector('#floating-touch') as HTMLButtonElement | null;
      return el?.getAttribute('data-state') === 'checked';
    });

    expect(floatingSelected).toBeTruthy();
  });

  test('floating touch is the default control scheme', async ({ page }) => {
    await openLobbySettings(page);

    const floatingSelected = await page.evaluate(() => {
      const el = document.querySelector('#floating-touch') as HTMLButtonElement | null;
      return el?.getAttribute('data-state') === 'checked';
    });

    expect(floatingSelected).toBeTruthy();
  });

  test('floating mode shows sensitivity slider and HUD sliders, hides d-pad size', async ({ page }) => {
    await openLobbySettings(page);

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'floating' });
    });

    await expect(page.getByTestId('touch-sensitivity-settings')).toBeVisible();
    await expect(page.getByTestId('touch-sensitivity-slider')).toBeVisible();
    await expect(page.getByTestId('mobile-hud-settings')).toBeVisible();
    await expect(page.getByTestId('hud-opacity-slider')).toBeVisible();
    await expect(page.getByTestId('hud-size-slider')).toBeVisible();
    await expect(page.getByTestId('dpad-size-slider')).toHaveCount(0);
  });

  test('dpad mode shows d-pad size slider, hides sensitivity, keeps HUD sliders', async ({ page }) => {
    await openLobbySettings(page);

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'dpad' });
    });

    await expect(page.getByTestId('dpad-size-settings')).toBeVisible();
    await expect(page.getByTestId('dpad-size-slider')).toBeVisible();
    await expect(page.getByTestId('hud-opacity-slider')).toBeVisible();
    await expect(page.getByTestId('hud-size-slider')).toBeVisible();
    await expect(page.getByTestId('touch-sensitivity-slider')).toHaveCount(0);
  });

  test('recogniser respects configurable slop from sensitivity', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_FLOATING_TOUCH__!;
      const highSlop = api.createRecogniser(20);
      highSlop.begin({ x: 100, y: 100, t: 0 });
      const blocked = highSlop.move({ x: 115, y: 100, t: 40 });

      const lowSlop = api.createRecogniser(6);
      lowSlop.begin({ x: 100, y: 100, t: 0 });
      const registered = lowSlop.move({ x: 115, y: 100, t: 40 });

      const mappedSlop = api.slopPxFromSensitivity?.(1);

      return {
        blocked: blocked.length,
        registered: registered.find((i) => i.kind === 'direction'),
        mappedSlop,
      };
    });

    expect(result.blocked).toBe(0);
    expect(result.registered).toEqual({ kind: 'direction', direction: { x: 1, y: 0 } });
    expect(result.mappedSlop).toBe(6);
  });
});
