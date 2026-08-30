import { test, expect } from '@playwright/test';
import { readPerfSnapshot, startSectorRun, waitForPerfSamples } from './helpers';

test.describe('Performance overlay (M0)', () => {
  test('shows overlay when ?perf=1 and collects frame samples', async ({ page }) => {
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });

    await expect(page.getByTestId('perf-overlay')).toBeVisible();
    await waitForPerfSamples(page, 20);

    const snapshot = await readPerfSnapshot(page);
    expect(snapshot.sampleCount).toBeGreaterThanOrEqual(20);
    expect(snapshot.avgFrameMs).toBeGreaterThan(0);
    expect(snapshot.avgDrawMs).toBeGreaterThan(0);
    expect(snapshot.entityCount).toBeGreaterThan(0);
  });

  test('exposes perf API on window after entering a sector', async ({ page }) => {
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 15);

    const isActive = await page.evaluate(() => window.__PIXLAB_PERF__?.isActive() ?? false);
    expect(isActive).toBe(true);

    const snapshot = await readPerfSnapshot(page);
    expect(snapshot.fps).toBeGreaterThan(0);
    expect(snapshot.loopRestarts).toBeGreaterThanOrEqual(1);
  });

  test('does not show overlay without perf flag', async ({ page }) => {
    await startSectorRun(page);
    await expect(page.getByTestId('perf-overlay')).toHaveCount(0);
  });
});

test.describe('Performance baseline capture (M0)', () => {
  test('records desktop viewport metrics during sector 1', async ({ page }) => {
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 60);

    const snapshot = await readPerfSnapshot(page);
    expect(snapshot.sectorLevel).toBe(1);
    expect(snapshot.avgDrawMs).toBeLessThan(50);
  });

  test('records mobile viewport metrics during sector 1', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 60);

    const snapshot = await readPerfSnapshot(page);
    expect(snapshot.sectorLevel).toBe(1);
    expect(snapshot.sampleCount).toBeGreaterThanOrEqual(60);
  });
});
