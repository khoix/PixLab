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

  test('lobby title is not clipped and tabs card is not over-stretched', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLobby(page);

    const layout = await page.evaluate(() => {
      const title = document.querySelector('.lobby-page-title h1');
      const tabsCard = document.querySelector('.lobby-tabs-card');
      const enterButton = document.querySelector('[data-testid="enter-sector-button"]');
      if (!title || !tabsCard || !enterButton) return null;

      const titleRect = title.getBoundingClientRect();
      const tabsRect = tabsCard.getBoundingClientRect();
      const enterRect = enterButton.getBoundingClientRect();

      return {
        titleTop: titleRect.top,
        tabsHeight: tabsRect.height,
        enterBottom: enterRect.bottom,
        tabsBottom: tabsRect.bottom,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.titleTop).toBeGreaterThanOrEqual(4);
    expect(layout!.tabsHeight).toBeGreaterThanOrEqual(340);
    expect(layout!.tabsHeight).toBeLessThan(580);
    expect(layout!.enterBottom).toBeLessThanOrEqual(layout!.tabsBottom + 2);
  });

  test('lobby layout stays pinned when switching tabs', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLobby(page);

    const missionTop = await page.evaluate(() => {
      const body = document.querySelector('.lobby-page-body');
      return body?.getBoundingClientRect().top ?? 0;
    });

    await page.getByTestId('lobby-settings-tab').click();
    const settingsTop = await page.evaluate(() => {
      const body = document.querySelector('.lobby-page-body');
      return body?.getBoundingClientRect().top ?? 0;
    });

    await page.getByRole('tab', { name: 'MISSION' }).click();
    const backTop = await page.evaluate(() => {
      const body = document.querySelector('.lobby-page-body');
      return body?.getBoundingClientRect().top ?? 0;
    });

    expect(Math.abs(settingsTop - missionTop)).toBeLessThan(2);
    expect(Math.abs(backTop - missionTop)).toBeLessThan(2);
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
