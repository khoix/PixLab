import { test, expect } from '@playwright/test';

async function openLobby(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.locator('.lobby-page').waitFor({ state: 'visible' });
}

test.describe('M5.2 — Viewport-locked lobby layout', () => {
  test('lobby has no document-level scroll on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLobby(page);

    const metrics = await page.evaluate(() => ({
      docScrollHeight: document.documentElement.scrollHeight,
      docClientHeight: document.documentElement.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      lobbyOverflow: getComputedStyle(document.querySelector('.lobby-page')!).overflowY,
    }));

    expect(metrics.docScrollHeight).toBeLessThanOrEqual(metrics.docClientHeight + 1);
    expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.docClientHeight + 1);
    expect(metrics.lobbyOverflow).toBe('hidden');
  });

  test('lobby has no document-level scroll on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openLobby(page);

    const metrics = await page.evaluate(() => ({
      docScrollHeight: document.documentElement.scrollHeight,
      docClientHeight: document.documentElement.clientHeight,
    }));

    expect(metrics.docScrollHeight).toBeLessThanOrEqual(metrics.docClientHeight + 1);
  });

  test('lobby content block is vertically centered', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLobby(page);

    const centered = await page.evaluate(() => {
      const title = document.querySelector('.lobby-page-title');
      const grid = document.querySelector('.lobby-page-grid');
      if (!title || !grid) return false;

      const titleRect = title.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const contentTop = titleRect.top;
      const contentBottom = gridRect.bottom;
      const contentMid = (contentTop + contentBottom) / 2;
      const viewportMid = window.innerHeight / 2;

      return Math.abs(contentMid - viewportMid) < 80;
    });

    expect(centered).toBe(true);
  });

  test('settings tab panel scrolls internally', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLobby(page);
    await page.getByTestId('lobby-settings-tab').click();

    const panelMetrics = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="lobby-settings-panel"]');
      if (!panel) return null;

      const style = getComputedStyle(panel);
      return {
        overflowY: style.overflowY,
        scrollHeight: panel.scrollHeight,
        clientHeight: panel.clientHeight,
      };
    });

    expect(panelMetrics).not.toBeNull();
    expect(panelMetrics!.overflowY).toMatch(/auto|scroll/);
    expect(panelMetrics!.scrollHeight).toBeGreaterThanOrEqual(panelMetrics!.clientHeight);
  });
});
