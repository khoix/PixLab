import { test, expect } from '@playwright/test';
import { openLobby, startSectorRun } from './helpers';

/** Sum of every mob's distance from origin — a cheap "did anything move" probe. */
async function mobPositionFingerprint(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    window
      .__PIXLAB_LEVEL__!.getEntities()
      .map((e) => `${e.id}:${e.pos.x.toFixed(3)},${e.pos.y.toFixed(3)}`)
      .sort()
      .join('|'),
  );
}

test.describe('M6.2 — the run pauses, not just the countdown', () => {
  test('the game clock stops and resumes where it left off', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const clock = window.__PIXLAB_CLOCK__!;
      clock.reset();

      const before = clock.now();
      clock.pause('menu');
      const atPause = clock.now();
      await new Promise((r) => setTimeout(r, 250));
      const duringPause = clock.now();
      const pausedReasons = clock.getReasons();
      clock.resume('menu');
      const afterResume = clock.now();

      return {
        advancedBeforePause: before <= atPause,
        frozenDuringPause: duringPause === atPause,
        pausedReasons,
        // The 250ms spent paused must not appear in the clock.
        driftAcrossPause: afterResume - atPause,
        isPausedAfterResume: clock.isPaused(),
      };
    });

    expect(result.advancedBeforePause).toBe(true);
    expect(result.frozenDuringPause).toBe(true);
    expect(result.pausedReasons).toEqual(['menu']);
    expect(result.driftAcrossPause).toBeLessThan(50);
    expect(result.isPausedAfterResume).toBe(false);
  });

  test('overlapping dialogs resume only once the last one closes', async ({ page }) => {
    await page.goto('/');
    const states = await page.evaluate(() => {
      const clock = window.__PIXLAB_CLOCK__!;
      clock.reset();
      const seen: boolean[] = [];
      clock.pause('inventory');
      seen.push(clock.isPaused());
      clock.pause('menu');
      seen.push(clock.isPaused());
      clock.resume('menu');
      seen.push(clock.isPaused()); // inventory still open
      clock.resume('inventory');
      seen.push(clock.isPaused());
      return seen;
    });

    expect(states).toEqual([true, true, true, false]);
  });

  test('the simulation stops while the in-game menu is open', async ({ page }) => {
    await startSectorRun(page);
    await page.waitForTimeout(300);

    // The scheduler counts one `considered` per mob per update() call, so it is
    // a direct read on whether the simulation is ticking — unlike watching a
    // single mob's position, which stays put whenever greedy cardinal movement
    // walks it into a wall.
    const sample = async (ms: number) => {
      await page.evaluate(() => window.__PIXLAB_AI__!.resetStats());
      await page.waitForTimeout(ms);
      return page.evaluate(() => window.__PIXLAB_AI__!.getStats());
    };

    const running = await sample(500);
    expect(running.considered).toBeGreaterThan(0);
    expect(running.frames).toBeGreaterThan(0);

    await page.getByTestId('game-menu-button').click();
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(true);

    const positionsBefore = await mobPositionFingerprint(page);
    const paused = await sample(1200);
    const positionsAfter = await mobPositionFingerprint(page);

    // update() is not running at all: no frames, no mob ticks, nothing moved.
    expect(paused.frames).toBe(0);
    expect(paused.considered).toBe(0);
    expect(positionsAfter).toBe(positionsBefore);

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(false);

    const resumed = await sample(500);
    expect(resumed.considered).toBeGreaterThan(0);
  });

  test('no attack burst on resume: cooldowns do not advance behind the menu', async ({ page }) => {
    await openLobby(page);
    await page.evaluate(() => window.__PIXLAB_TEST__?.updateStats({ hp: 100_000, maxHp: 100_000 }));
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.getByTestId('game-menu-button').click();
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(true);

    const hpBefore = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerHp());
    // A long pause is exactly what used to fast-forward every cooldown at once.
    await page.waitForTimeout(2500);
    const hpDuring = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerHp());
    expect(hpDuring).toBe(hpBefore);

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(false);
    // One frame after resume must not settle 2.5s of banked cooldowns at once.
    await page.waitForTimeout(120);
    const hpJustAfter = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerHp());
    expect(hpBefore - hpJustAfter).toBeLessThanOrEqual(0);
  });

  test('the sector timer and the game clock pause together', async ({ page }) => {
    await startSectorRun(page);
    await page.waitForTimeout(300);

    await page.getByTestId('game-menu-button').click();
    const both = await page.evaluate(() => ({
      timer: window.__PIXLAB_TIMER__!.isPaused(),
      clock: window.__PIXLAB_CLOCK__!.isPaused(),
    }));
    expect(both).toEqual({ timer: true, clock: true });

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(false);
    const after = await page.evaluate(() => ({
      timer: window.__PIXLAB_TIMER__!.isPaused(),
      clock: window.__PIXLAB_CLOCK__!.isPaused(),
    }));
    expect(after).toEqual({ timer: false, clock: false });
  });
});

test.describe('M6.2 — music freezes with the run', () => {
  test('the run track pauses and keeps its position while a dialog is open', async ({ page }) => {
    await startSectorRun(page);
    // Music needs a user gesture; the run-start clicks provide it.
    await page.waitForTimeout(600);

    const playingBefore = await page.evaluate(() => window.__PIXLAB_AUDIO__!.isMusicPlaying());
    test.skip(!playingBefore, 'music did not start (autoplay blocked in this environment)');

    await page.getByTestId('game-menu-button').click();
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(true);

    await expect
      .poll(() => page.evaluate(() => window.__PIXLAB_AUDIO__!.isMusicPausedForGamePause()))
      .toBe(true);
    expect(await page.evaluate(() => window.__PIXLAB_AUDIO__!.isMusicPlaying())).toBe(false);

    // The track is scored against the sector timer, so its position must hold —
    // neither running on nor restarting from zero.
    const atPause = await page.evaluate(() => window.__PIXLAB_AUDIO__!.getMusicCurrentTime());
    expect(atPause).not.toBeNull();
    expect(atPause!).toBeGreaterThan(0);
    await page.waitForTimeout(1200);
    const stillPaused = await page.evaluate(() => window.__PIXLAB_AUDIO__!.getMusicCurrentTime());
    expect(Math.abs(stillPaused! - atPause!)).toBeLessThan(0.15);

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_CLOCK__!.isPaused())).toBe(false);
    await expect
      .poll(() => page.evaluate(() => window.__PIXLAB_AUDIO__!.isMusicPausedForGamePause()))
      .toBe(false);
    await expect.poll(() => page.evaluate(() => window.__PIXLAB_AUDIO__!.isMusicPlaying())).toBe(true);

    // Resumes from where it stopped, not from the start.
    const afterResume = await page.evaluate(() => window.__PIXLAB_AUDIO__!.getMusicCurrentTime());
    expect(afterResume!).toBeGreaterThanOrEqual(atPause! - 0.05);
  });

  test('re-arming the same track behind an open dialog does not restart it', async ({ page }) => {
    await startSectorRun(page);
    await page.waitForTimeout(600);
    const playing = await page.evaluate(() => window.__PIXLAB_AUDIO__!.isMusicPlaying());
    test.skip(!playing, 'music did not start (autoplay blocked in this environment)');

    await page.getByTestId('game-menu-button').click();
    await expect
      .poll(() => page.evaluate(() => window.__PIXLAB_AUDIO__!.isMusicPausedForGamePause()))
      .toBe(true);

    const before = await page.evaluate(() => {
      const track = window.__PIXLAB_AUDIO__!.getCurrentTrack();
      return { track, time: window.__PIXLAB_AUDIO__!.getMusicCurrentTime() };
    });

    // A re-render calling playMusic for the track already loaded must be a no-op
    // while paused, rather than resuming or seeking to zero.
    await page.evaluate(() => window.__PIXLAB_TEST__?.setCoins(1));
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => ({
      playing: window.__PIXLAB_AUDIO__!.isMusicPlaying(),
      paused: window.__PIXLAB_AUDIO__!.isMusicPausedForGamePause(),
      time: window.__PIXLAB_AUDIO__!.getMusicCurrentTime(),
      track: window.__PIXLAB_AUDIO__!.getCurrentTrack(),
    }));

    expect(after.playing).toBe(false);
    expect(after.paused).toBe(true);
    expect(after.track).toBe(before.track);
    expect(Math.abs(after.time! - before.time!)).toBeLessThan(0.15);
  });
});
