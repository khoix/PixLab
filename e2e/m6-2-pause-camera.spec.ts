import { test, expect } from '@playwright/test';
import { startSectorRun } from './helpers';

/**
 * The camera anchor used to be a fraction of the *live* canvas height. On a
 * phone the run root is sized in `100dvh`, which tracks the browser chrome, so
 * the URL bar appearing cost ~75 px of height and dropped the anchor ~32 px —
 * the world visibly jumped up. Tapping the in-game menu is exactly when a phone
 * reveals that chrome, so it read as "the screen shifts when the game pauses".
 */
test.describe('M6.2 — browser chrome does not move the world', () => {
  test('the anchor holds when the viewport shrinks, and follows a real resize', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_CAMERA_ANCHOR__!;
      const fraction = 0.43; // PLAYER_SCREEN_ANCHOR_Y_MOBILE

      // Open at full height, then lose 75 px to the URL bar.
      let vp = api.trackStableViewport(null, 393, 727);
      const atFullHeight = api.resolveAnchorY(727, vp.height, fraction);
      vp = api.trackStableViewport(vp, 393, 652);
      const withChrome = api.resolveAnchorY(652, vp.height, fraction);
      // Chrome slides away again.
      vp = api.trackStableViewport(vp, 393, 727);
      const chromeGone = api.resolveAnchorY(727, vp.height, fraction);

      // Rotating changes the width, which is a real resize.
      const rotated = api.trackStableViewport(vp, 727, 393);
      const afterRotate = api.resolveAnchorY(393, rotated.height, fraction);

      // A viewport far shorter than the anchor must not push the player off.
      const squashed = api.resolveAnchorY(60, 727, fraction);

      return {
        atFullHeight,
        withChrome,
        chromeGone,
        afterRotate,
        rememberedAfterShrink: vp.height,
        rotatedViewport: rotated,
        squashed,
        margin: api.bottomMarginPx,
        // What the old code did, for the record.
        legacyWithChrome: 652 * fraction,
      };
    });

    // The anchor does not move when only the chrome does — in either direction.
    expect(result.withChrome).toBeCloseTo(result.atFullHeight, 5);
    expect(result.chromeGone).toBeCloseTo(result.atFullHeight, 5);
    expect(result.rememberedAfterShrink).toBe(727);

    // That is the jump this fixes: ~32 px under the old formula.
    expect(result.atFullHeight - result.legacyWithChrome).toBeGreaterThan(30);

    // A real resize still re-anchors: rotating gives a new width and height.
    expect(result.rotatedViewport).toEqual({ width: 727, height: 393 });
    expect(result.afterRotate).toBeCloseTo(393 * 0.43, 5);

    // And the player can never be pushed below a very short viewport.
    expect(result.squashed).toBe(60 - result.margin);
  });

  test('opening the menu leaves the rendered world exactly where it was', async ({ page }) => {
    test.setTimeout(90_000);
    await startSectorRun(page);
    await page.waitForTimeout(600);

    // Luminance down the centre column — a shifted world shows up as an offset.
    const column = async () =>
      page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement;
        const ctx = c.getContext('2d')!;
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const x = Math.floor(c.width / 2);
        const out: number[] = [];
        for (let y = 0; y < c.height; y += 2) {
          const i = (y * c.width + x) * 4;
          out.push(Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114));
        }
        return out;
      });

    const before = await column();
    await page.getByTestId('game-menu-button').click();
    await page.waitForTimeout(400);
    const after = await column();

    // Best-matching vertical offset between the two frames.
    let best = { shift: 0, score: Number.POSITIVE_INFINITY };
    for (let s = -40; s <= 40; s++) {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < before.length; i++) {
        const j = i + s;
        if (j < 0 || j >= after.length) continue;
        sum += Math.abs(before[i] - after[j]);
        n++;
      }
      if (n > before.length * 0.7 && sum / n < best.score) best = { shift: s, score: sum / n };
    }

    // Pause dims the scene, so the frames differ in brightness — but they must
    // still line up at zero offset.
    expect(best.shift).toBe(0);
  });

  test('losing viewport height to the URL bar mid-pause does not move the world', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 393, height: 727 });
    await startSectorRun(page);
    await page.waitForTimeout(600);

    const column = async () =>
      page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement;
        const ctx = c.getContext('2d')!;
        const rows = Math.min(c.height, 1200);
        const d = ctx.getImageData(0, 0, c.width, rows).data;
        const x = Math.floor(c.width / 2);
        const out: number[] = [];
        for (let y = 0; y < rows; y += 2) {
          const i = (y * c.width + x) * 4;
          out.push(Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114));
        }
        return out;
      });

    await page.getByTestId('game-menu-button').click();
    await page.waitForTimeout(400);
    const before = await column();
    // The URL bar slides in: `100dvh` loses 75 px.
    await page.setViewportSize({ width: 393, height: 652 });
    await page.waitForTimeout(500);
    const after = await column();

    let best = { shift: 0, score: Number.POSITIVE_INFINITY };
    for (let s = -60; s <= 60; s++) {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < before.length; i++) {
        const j = i + s;
        if (j < 0 || j >= after.length) continue;
        sum += Math.abs(before[i] - after[j]);
        n++;
      }
      if (n > before.length * 0.6 && sum / n < best.score) best = { shift: s, score: sum / n };
    }

    // Measured at -64 device px before this fix; 0 after.
    expect(best.shift).toBe(0);
  });
});
