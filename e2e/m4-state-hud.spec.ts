import { test, expect } from '@playwright/test';
import { startSectorRun, waitForPerfSamples } from './helpers';

test.describe('M4 — State updates & HUD consistency', () => {
  test('modifiers multiply across Zeus, Hades, and Artemis', async ({ page }) => {
    await page.goto('/');

    const modifiers = await page.evaluate(() =>
      window.__PIXLAB_MODS__!.build([
        'zeus_mainframe',
        'hades_subnet',
        'artemis_drone',
      ]),
    );

    expect(modifiers.enemyHp).toBeCloseTo(1.2);
    expect(modifiers.coinMult).toBeCloseTo(1.5);
    expect(modifiers.timerMult).toBeCloseTo(0.8);
    expect(modifiers.visionMult).toBeCloseTo(0.7);
    expect(modifiers.explosiveDeaths).toBe(true);
    expect(modifiers.autoReveal).toBe(true);
  });

  test('sector timer pauses while menu is open', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await startSectorRun(page);
    await page.waitForTimeout(300);

    const before = await page.evaluate(() => window.__PIXLAB_TIMER__!.getTimeLeftSec([]));
    expect(before).toBeGreaterThan(0);

    await page.getByTestId('game-menu-button').click();
    await page.waitForTimeout(700);

    const duringMenu = await page.evaluate(() => ({
      timeLeft: window.__PIXLAB_TIMER__!.getTimeLeftSec([]),
      paused: window.__PIXLAB_TIMER__!.isPaused(),
    }));
    expect(duringMenu.timeLeft).toBeGreaterThanOrEqual(before - 0.5);
    expect(duringMenu.paused).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const afterMenu = await page.evaluate(() => window.__PIXLAB_TIMER__!.getTimeLeftSec([]));
    expect(afterMenu).toBeLessThanOrEqual(before);
  });

  test('game loop flushes batch hook each update frame during sector run', async ({ page }) => {
    await page.goto('/?perf=1');
    await startSectorRun(page);
    await waitForPerfSamples(page, 30);

    const batchStats = await page.evaluate(() => ({
      frameFlushes: window.__PIXLAB_BATCH__!.getFrameFlushCount(),
      samples: window.__PIXLAB_PERF__!.getSnapshot().sampleCount,
    }));

    expect(batchStats.frameFlushes).toBeGreaterThan(0);
    expect(batchStats.frameFlushes).toBeLessThanOrEqual(batchStats.samples);
  });
});
