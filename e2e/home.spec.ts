import { test, expect } from '@playwright/test';

test.describe('Home', () => {
  test('loads title screen and start button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /pixel/i })).toBeVisible();
    await expect(page.getByTestId('start-run-button')).toBeVisible();
  });

  test('navigates to lobby after start run', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await expect(page.getByTestId('enter-sector-button')).toBeVisible();
    await expect(page.getByText(/SECTOR 1/i)).toBeVisible();
  });

  test('open graph image points at PixLab logo asset', async ({ page }) => {
    await page.goto('/');

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toBeTruthy();
    expect(ogImage).toMatch(/opengraph\.jpg$/);

    const imageResponse = await page.request.get(new URL(ogImage!, page.url()).toString());
    expect(imageResponse.ok()).toBeTruthy();
    expect(imageResponse.headers()['content-type']).toMatch(/image\/jpeg/);
  });
});
