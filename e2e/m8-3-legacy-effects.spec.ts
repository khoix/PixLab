import { test, expect } from '@playwright/test';
import { startSectorRun } from './helpers';

/**
 * M8.3 — the legacy 2D view's portal and sense effects are render-owned, and
 * bounded while the run is frozen.
 *
 * The rAF loop calls `draw()` while paused but not `update()`, deliberately, so
 * the camera follows a canvas resize with the inventory open. The effects used
 * to be spawned from inside that draw pass and expired against `getGameNow()`,
 * which stops while paused — so nothing aged out while the spawn roll kept
 * firing.
 *
 * Measured before the fix, standing on a portal: 20 in steady state, 75 after
 * three paused seconds, climbing about 17 a second for as long as the dialog
 * stayed open, each one re-filtered and re-drawn every frame.
 */
test.describe('M8.3 — legacy render effects', () => {
  test('portal effects stay bounded while the run is paused', async ({ page }) => {
    test.slow();
    await startSectorRun(page);
    await page.waitForTimeout(400);

    // Stand on a portal so the portal draw pass, which is what spawns them,
    // actually runs.
    await page.evaluate(() => {
      const level = window.__PIXLAB_LEVEL__!;
      level.clearPortals();
      level.spawnPortal(level.getPlayerPos());
    });

    const count = () =>
      page.evaluate(() => window.__PIXLAB_LEVEL__!.getLegacyEffectCount());

    // Let the field reach steady state: spawn rate against a 1-1.5s lifetime.
    await page.waitForTimeout(1800);
    const running = await count();
    expect(running, 'the portal pass should be producing effects at all').toBeGreaterThan(0);

    await page.keyboard.press('Tab'); // opens the inventory, which pauses the run
    await page.waitForTimeout(300);
    const atPause = await count();

    await page.waitForTimeout(3000);
    const afterPause = await count();

    // Frozen means frozen: no new effects, and the ones already out cannot age
    // because the clock they age against is stopped. So the count may only fall
    // or hold, never climb. The old code reached roughly atPause + 50 here.
    expect(
      afterPause,
      `effects grew while paused: ${atPause} -> ${afterPause} over 3s`,
    ).toBeLessThanOrEqual(atPause);
  });

  test('effects resume after the pause lifts and stay bounded', async ({ page }) => {
    test.slow();
    await startSectorRun(page);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const level = window.__PIXLAB_LEVEL__!;
      level.clearPortals();
      level.spawnPortal(level.getPlayerPos());
    });
    const count = () =>
      page.evaluate(() => window.__PIXLAB_LEVEL__!.getLegacyEffectCount());

    await page.waitForTimeout(1500);
    const before = await count();

    await page.keyboard.press('Tab');
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    const after = await count();
    expect(after, 'effects should still be spawning once the run resumes').toBeGreaterThan(0);
    // Steady state is a spawn rate against a fixed lifetime, so resuming must
    // settle back to the same order of magnitude rather than to a backlog.
    expect(after).toBeLessThan(before * 3 + 20);
  });
});
