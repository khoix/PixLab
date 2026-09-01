import { test, expect } from '@playwright/test';

async function openVendorStation(page: import('@playwright/test').Page, coins = 500) {
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.evaluate((coinAmount) => {
    window.__PIXLAB_TEST__?.setCoins(coinAmount);
    window.__PIXLAB_TEST__?.setScreen('shop');
  }, coins);
  await page.locator('.vendor-station-page').waitFor({ state: 'visible' });
}

test.describe('M5 — Vendor station mobile layout', () => {
  test('mobile shows header coins and divider instead of coins bar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openVendorStation(page);

    await expect(page.getByTestId('vendor-coins-header')).toBeVisible();
    await expect(page.getByTestId('vendor-coins-header')).toContainText('COINS:');
    await expect(page.getByTestId('vendor-station-divider')).toBeVisible();
    await expect(page.getByTestId('vendor-coins-bar')).toHaveCount(0);
  });

  test('mobile vendor shell fills viewport for CRT overlay coverage', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openVendorStation(page);

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('.vendor-station-page') as HTMLElement | null;
      const rect = shell?.getBoundingClientRect();
      return {
        shellHeight: rect?.height ?? 0,
        viewportHeight: window.innerHeight,
      };
    });

    expect(metrics.shellHeight).toBeGreaterThanOrEqual(metrics.viewportHeight - 2);
  });

  test('desktop keeps coins bar below header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openVendorStation(page);

    await expect(page.getByTestId('vendor-coins-bar')).toBeVisible();
    await expect(page.getByTestId('vendor-coins-header')).toHaveCount(0);
    await expect(page.getByTestId('vendor-station-divider')).toHaveCount(0);
  });

  test('desktop item hover does not trigger panel overflow scrollbar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop-only hover regression');
    await page.setViewportSize({ width: 1280, height: 720 });
    await openVendorStation(page);

    const panel = page.getByTestId('vendor-buy-panel');
    await expect(panel).toBeVisible();

    const before = await panel.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));

    const statButton = panel.locator('.vendor-station-item-btn:not([disabled])').first();
    await statButton.hover();

    const after = await panel.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));

    expect(after.scrollHeight).toBe(before.scrollHeight);
    expect(after.clientHeight).toBe(before.clientHeight);
  });
});
