import { test, expect } from '@playwright/test';
import { readPerfSnapshot, startSectorRun, waitForPerfSamples } from './helpers';

test.describe('M1 — Input & game loop', () => {
  test('held keyboard direction does not restart loop or repeat input updates', async ({ page }) => {
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 30);

    const before = await readPerfSnapshot(page);

    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(800);

    const during = await readPerfSnapshot(page);

    expect(during.loopRestarts).toBe(before.loopRestarts);
    expect(during.inputDirectionUpdates).toBe(before.inputDirectionUpdates + 1);
    expect(during.sampleCount).toBeGreaterThan(before.sampleCount);

    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(100);

    const afterRelease = await readPerfSnapshot(page);
    expect(afterRelease.inputDirectionUpdates).toBe(during.inputDirectionUpdates + 1);
  });

  test('repeated identical direction writes are deduplicated', async ({ page }) => {
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 20);

    const updates = await page.evaluate(() => {
      const api = window.__PIXLAB_GAME_INPUT__;
      if (!api) throw new Error('game input API missing');
      let count = 0;
      for (let i = 0; i < 50; i++) {
        if (api.setDirection({ x: 0, y: -1 })) count += 1;
      }
      return count;
    });

    expect(updates).toBe(1);

    const snapshot = await readPerfSnapshot(page);
    expect(snapshot.inputDirectionUpdates).toBeGreaterThanOrEqual(1);
  });

  test('lobby screen does not mount game canvas or collect perf samples', async ({ page }) => {
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await expect(page.getByTestId('enter-sector-button')).toBeVisible();

    const samples = await page.evaluate(
      () => window.__PIXLAB_PERF__?.getSnapshot().sampleCount ?? 0,
    );
    expect(samples).toBe(0);
  });
});
