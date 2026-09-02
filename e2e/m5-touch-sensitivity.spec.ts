import { test, expect } from '@playwright/test';
import { openLobby, openLobbySettings, clickLobbySettingsTab } from './helpers';

test.describe('M5.3 — Floating touch sensitivity & settings', () => {
  test('touchpad option is removed from settings', async ({ page }) => {
    await openLobbySettings(page, true);
    await expect(page.getByLabel('Touchpad (Swipe & Tap)')).toHaveCount(0);
    await expect(page.getByLabel('Directional Pad')).toBeVisible();
    await expect(page.getByLabel('Floating Touch (anywhere)')).toBeVisible();
  });

  test('legacy touchpad setting normalizes to floating touch', async ({ page }) => {
    await openLobby(page);

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'touchpad' as 'dpad' });
    });

    await clickLobbySettingsTab(page);
    const floatingSelected = await page.evaluate(() => {
      const el = document.querySelector('#floating-touch') as HTMLButtonElement | null;
      return el?.getAttribute('data-state') === 'checked';
    });

    expect(floatingSelected).toBeTruthy();
  });

  test('floating touch is the default control scheme', async ({ page }) => {
    await openLobbySettings(page, true);

    const floatingSelected = await page.evaluate(() => {
      const el = document.querySelector('#floating-touch') as HTMLButtonElement | null;
      return el?.getAttribute('data-state') === 'checked';
    });

    expect(floatingSelected).toBeTruthy();
  });

  test('floating mode shows sensitivity slider and HUD sliders, hides d-pad size', async ({ page }) => {
    await openLobbySettings(page, true);

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'floating' });
    });

    const order = await page.evaluate(() => {
      const sensitivity = document.querySelector('[data-testid="touch-sensitivity-settings"]');
      const hud = document.querySelector('[data-testid="mobile-hud-settings"]');
      if (!sensitivity || !hud) return null;
      return sensitivity.compareDocumentPosition(hud) & Node.DOCUMENT_POSITION_FOLLOWING;
    });

    expect(order).toBeTruthy();
    await expect(page.getByTestId('touch-sensitivity-settings')).toBeVisible();
    await expect(page.getByTestId('touch-sensitivity-slider')).toBeVisible();
    await expect(page.getByTestId('mobile-hud-settings')).toBeVisible();
    await expect(page.getByTestId('hud-opacity-slider')).toBeVisible();
    await expect(page.getByTestId('hud-size-slider')).toBeVisible();
    await expect(page.getByTestId('sector-timer-side-settings')).toBeVisible();
    await expect(page.getByTestId('dpad-size-slider')).toHaveCount(0);
  });

  test('dpad mode shows d-pad size slider before HUD sliders, hides sensitivity', async ({ page }) => {
    await openLobbySettings(page, true);

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'dpad' });
    });

    const order = await page.evaluate(() => {
      const dpad = document.querySelector('[data-testid="dpad-size-settings"]');
      const hud = document.querySelector('[data-testid="mobile-hud-settings"]');
      if (!dpad || !hud) return null;
      return dpad.compareDocumentPosition(hud) & Node.DOCUMENT_POSITION_FOLLOWING;
    });

    expect(order).toBeTruthy();
    await expect(page.getByTestId('dpad-size-settings')).toBeVisible();
    await expect(page.getByTestId('dpad-size-slider')).toBeVisible();
    await expect(page.getByTestId('hud-opacity-slider')).toBeVisible();
    await expect(page.getByTestId('hud-size-slider')).toBeVisible();
    await expect(page.getByTestId('sector-timer-side-settings')).toBeVisible();
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

  test('sensitivity slider extends to 150% with 3px slop at max', async ({ page }) => {
    await openLobbySettings(page, true);

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'floating', touchSensitivity: 1.5 });
    });

    const result = await page.evaluate(() => {
      const thumb = document.querySelector(
        '[data-testid="touch-sensitivity-slider"] [role="slider"]',
      ) as HTMLElement | null;
      const max = thumb?.getAttribute('aria-valuemax');
      const slop = window.__PIXLAB_FLOATING_TOUCH__?.slopPxFromSensitivity?.(1.5);
      const label = document.querySelector('[data-testid="touch-sensitivity-settings"] span.text-lg')?.textContent;
      return { max, slop, label };
    });

    expect(result.max).toBe('1.5');
    expect(result.slop).toBe(3);
    expect(result.label).toBe('150%');
  });
});
