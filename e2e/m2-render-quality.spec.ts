import { test, expect } from '@playwright/test';
import { startSectorRun, waitForPerfSamples } from './helpers';

async function openLobbySettings(page: import('@playwright/test').Page) {
  await page.getByTestId('lobby-settings-tab').click();
  await expect(page.getByTestId('render-quality-settings')).toBeVisible();
}

test.describe('M2 — Render quality preset', () => {
  test('auto quality is low on mobile viewport during run', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 20);

    const quality = await page.evaluate(() => window.__PIXLAB_RENDER__?.getActiveQuality());
    expect(quality).toBe('low');
  });

  test('auto quality is high on desktop viewport during run', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 20);

    const quality = await page.evaluate(() => window.__PIXLAB_RENDER__?.getActiveQuality());
    expect(quality).toBe('high');
  });

  test('user can override render quality in lobby settings', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    await openLobbySettings(page);
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateSettings({ renderQuality: 'high' });
    });
    await page.getByRole('tab', { name: 'MISSION' }).click();

    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await waitForPerfSamples(page, 20);

    const quality = await page.evaluate(() => window.__PIXLAB_RENDER__?.getActiveQuality());
    expect(quality).toBe('high');
  });

  test('canvas uses game-canvas class for mobile CSS hooks', async ({ page }) => {
    await startSectorRun(page);
    await expect(page.locator('canvas.game-canvas')).toBeVisible();
  });
});
