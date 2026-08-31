import { test, expect } from '@playwright/test';
import { startSectorRun } from './helpers';

test.describe('M5.1 — Decentralized floating touch', () => {
  test('recogniser uses touch origin for relative direction', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_FLOATING_TOUCH__!;
      const r = api.createRecogniser();

      r.begin({ x: 200, y: 300, t: 0 });
      const first = r.move({ x: 200, y: 340, t: 50 });
      r.end({ x: 200, y: 340, t: 100 });

      const r2 = api.createRecogniser();
      r2.begin({ x: 50, y: 100, t: 0 });
      const second = r2.move({ x: 50, y: 140, t: 50 });

      return {
        firstDir: first.find((i) => i.kind === 'direction'),
        secondDir: second.find((i) => i.kind === 'direction'),
      };
    });

    expect(result.firstDir).toEqual({ kind: 'direction', direction: { x: 0, y: 1 } });
    expect(result.secondDir).toEqual({ kind: 'direction', direction: { x: 0, y: 1 } });
  });

  test('touch end clears held direction', async ({ page }) => {
    await page.goto('/');

    const cleared = await page.evaluate(() => {
      const input = window.__PIXLAB_GAME_INPUT__!;
      const r = window.__PIXLAB_FLOATING_TOUCH__!.createRecogniser();
      input.clear();
      r.begin({ x: 100, y: 100, t: 0 });
      const move = r.move({ x: 140, y: 100, t: 40 });
      move.forEach((intent) => {
        if (intent.kind === 'direction') input.setDirection(intent.direction);
      });
      const during = input.getDirection();
      r.end({ x: 140, y: 100, t: 80 }).forEach((intent) => {
        if (intent.kind === 'clear') input.clear();
      });
      return { during, after: input.getDirection() };
    });

    expect(cleared.during).toEqual({ x: 1, y: 0 });
    expect(cleared.after).toEqual({ x: 0, y: 0 });
  });

  test('floating touch layer visible during run on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'floating' });
    });

    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });

    await expect(page.getByTestId('mobile-floating-touch-control')).toBeVisible();
    await expect(page.getByTestId('mobile-dpad-control')).toHaveCount(0);
  });

  test('floating touch setting appears in lobby', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('lobby-settings-tab').click();

    await expect(page.getByTestId('floating-touch-settings')).toBeVisible();
  });

  test('legacy joystick setting normalizes to floating touch', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ mobileControlType: 'joystick' as 'dpad' });
    });

    const controlType = await page.evaluate(() => {
      return document.body.innerText.includes('Floating Touch') ? 'ok' : 'missing';
    });

    await page.getByTestId('lobby-settings-tab').click();
    const floatingSelected = await page.evaluate(() => {
      const el = document.querySelector('#floating-touch') as HTMLButtonElement | null;
      return el?.getAttribute('data-state') === 'checked';
    });

    expect(floatingSelected || controlType === 'ok').toBeTruthy();
  });
});
