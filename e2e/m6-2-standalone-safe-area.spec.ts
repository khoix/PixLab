import { test, expect } from '@playwright/test';
import { startSectorRun } from './helpers';

/**
 * "The screen still jumps on pause when the app is installed to the home
 * screen." It reproduced only there, which is the whole clue.
 *
 * Body carries the safe-area padding and is border-box, so that padding comes
 * out of its height. #root and .run-screen were sized to the *full* viewport,
 * so they overflowed body by exactly the insets and hung past the bottom of the
 * screen. iOS scrolls that overhang away as soon as something takes focus — and
 * opening the menu focuses the dropdown — carrying the whole HUD up with it.
 *
 * In Safari the insets are zero, because the browser chrome owns those strips,
 * so there is no overhang and nothing to scroll. Installed to the home screen
 * with `viewport-fit=cover` and a translucent status bar, they are not.
 *
 * `env()` cannot be emulated, so the insets are named as custom properties that
 * default to `env(...)`. Body's padding and the run height both read them, which
 * keeps the two from drifting apart and lets this test set a real phone's
 * values.
 */

// iPhone 14 Pro in standalone.
const INSETS = ':root { --safe-top: 59px !important; --safe-bottom: 34px !important; }';
const OLD_RULES =
  '#root { min-height: 100dvh !important; } .run-screen { height: 100dvh !important; }';

async function geometry(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const root = document.getElementById('root')!;
    const run = document.querySelector('.run-screen') as HTMLElement;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    return {
      rootOverhang: Math.round(root.getBoundingClientRect().bottom - window.innerHeight),
      runOverhang: Math.round(run.getBoundingClientRect().bottom - window.innerHeight),
      runHeight: Math.round(run.getBoundingClientRect().height),
      canvasHeight: Math.round(canvas.getBoundingClientRect().height),
      bodyPadTop: getComputedStyle(document.body).paddingTop,
    };
  });
}

test.describe('M6.2 — home-screen web app safe areas', () => {
  test('nothing hangs past the viewport once the insets are non-zero', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 393, height: 852 });
    await startSectorRun(page);
    await page.waitForTimeout(600);

    // Safari: no insets, so nothing changes and nothing can scroll.
    const bare = await geometry(page);
    expect(bare.bodyPadTop).toBe('0px');
    expect(bare.rootOverhang).toBe(0);
    expect(bare.runOverhang).toBe(0);

    await page.addStyleTag({ content: INSETS });
    await page.waitForTimeout(300);
    const standalone = await geometry(page);

    // Body took its padding...
    expect(standalone.bodyPadTop).toBe('59px');
    // ...and the run screen gave that height back instead of hanging past the
    // bottom. Negative means it ends above the viewport edge, inside the bottom
    // safe area, which is correct.
    expect(standalone.rootOverhang).toBeLessThanOrEqual(0);
    expect(standalone.runOverhang).toBeLessThanOrEqual(0);
    expect(standalone.runHeight).toBe(852 - 59 - 34);
    // The canvas follows, so the playfield fills the safe region exactly.
    expect(standalone.canvasHeight).toBe(standalone.runHeight);
  });

  test('the old rules put 59px of content past the bottom edge', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 393, height: 852 });
    await startSectorRun(page);
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: INSETS + OLD_RULES });
    await page.waitForTimeout(300);

    const old = await geometry(page);
    // This is the defect, reproduced: content hanging off the bottom by the top
    // inset, which is what iOS scrolled away — and it matches the ~59pt the HUD
    // was measured to jump on the device.
    expect(old.rootOverhang).toBe(59);
    expect(old.runOverhang).toBe(59);
  });
});
