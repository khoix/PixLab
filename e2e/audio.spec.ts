import { test, expect } from '@playwright/test';

test.describe('Background music', () => {
  test('plays theme on title screen and maze music after entering a sector', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('start-run-button').click();
    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_AUDIO__?.getCurrentTrack() ?? null))
      .toBe('theme');

    await page.getByTestId('enter-sector-button').click();
    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_AUDIO__?.getCurrentTrack() ?? null))
      .toBe('maze');
  });
});
