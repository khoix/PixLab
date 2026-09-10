import { test, expect } from '@playwright/test';

/**
 * M5.9 — a rotated phone is still a phone.
 *
 * Reported: "I can see and adjust [the event log] in landscape, but then the
 * joystick no longer works."
 *
 * Both halves were one line. `useIsMobile` tested `innerWidth < 768`, and a
 * 390x844 handset is 844px wide once rotated — so the app classified the phone
 * as a desktop. `Game.tsx` gates the joystick, d-pad and quick actions on that
 * flag (they vanished) and the desktop event-log panel on its negation (it
 * appeared). `mobile.css` was scoped to the same 767px, so the safe-area insets
 * switched off too, in the orientation where the notch is on a *side*.
 *
 * Measured before the fix, at 844x390: `controlsRoot: false`, `panels: 2`,
 * `--safe-top: (unset)`.
 */

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function enterRun(page: import('@playwright/test').Page) {
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
}

/**
 * The sheet slides in over 500ms, and `toBeVisible()` resolves while it is
 * still off-screen — the first run of this test measured the drawer mid-flight
 * and read a bottom edge 147px past the viewport. Wait for the box to stop
 * moving before believing any of its coordinates.
 */
async function settledBox(locator: import('@playwright/test').Locator) {
  let previous: { x: number; y: number } | null = null;
  for (let i = 0; i < 30; i++) {
    const box = await locator.boundingBox();
    if (box && previous && Math.abs(box.x - previous.x) < 0.5 && Math.abs(box.y - previous.y) < 0.5) {
      return box;
    }
    previous = box;
    await locator.page().waitForTimeout(100);
  }
  throw new Error('drawer never stopped moving');
}

async function layout(page: import('@playwright/test').Page) {
  await page.waitForTimeout(500);
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    // The touch controls, gated on isMobile.
    touchControls: !!document.querySelector('.mobile-controls-root'),
    quickActions: !!document.querySelector('.mobile-quick-actions'),
    // The desktop split panel, gated on !isMobile: 1 panel means mobile.
    panelCount: document.querySelectorAll('[data-panel]').length,
    // Scoped to the same breakpoint, so it is the CSS half of the same bug.
    safeTopVar: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim() || '(unset)',
    timerHorizontal: !!document.querySelector('.mobile-sector-timer--bottom'),
  }));
}

test.describe('M5.9 — orientation-aware mobile layout', () => {
  test('a phone keeps its touch controls when rotated', async ({ page }) => {
    test.slow();
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'phone-shaped viewports only');

    await page.goto('/?perf=1');
    await enterRun(page);

    await page.setViewportSize(PORTRAIT);
    const portrait = await layout(page);
    console.log(`[m5.9] portrait:  ${JSON.stringify(portrait)}`);

    await page.setViewportSize(LANDSCAPE);
    const landscape = await layout(page);
    console.log(`[m5.9] landscape: ${JSON.stringify(landscape)}`);

    // The regression, in one assertion: this read false before the fix.
    expect(landscape.touchControls).toBe(true);
    expect(landscape.quickActions).toBe(true);
    expect(portrait.touchControls).toBe(true);

    // The desktop event-log panel must not appear on a rotated phone — the log
    // is a drawer here, and the split panel is what displaced the controls.
    expect(portrait.panelCount).toBe(1);
    expect(landscape.panelCount).toBe(1);

    // The safe-area insets have to survive rotation; in landscape the notch is
    // on a side, so this is the orientation that needs them most.
    expect(landscape.safeTopVar).not.toBe('(unset)');

    // The timer runs along the bottom when height is the scarce dimension.
    expect(portrait.timerHorizontal).toBe(false);
    expect(landscape.timerHorizontal).toBe(true);
  });

  test('the event log opens as a drawer, from the in-run menu', async ({ page }) => {
    test.slow();
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'phone-shaped viewports only');

    await page.goto('/?perf=1');
    await page.setViewportSize(PORTRAIT);
    await enterRun(page);

    await expect(page.getByTestId('event-log-drawer')).toHaveCount(0);
    await page.getByTestId('game-menu-button').click();
    await page.getByTestId('menu-event-log').click();

    const drawer = page.getByTestId('event-log-drawer');
    await expect(drawer).toBeVisible();

    // Bottom in portrait, and inside the viewport: a drawer that overflows is
    // exactly the clipped-content failure M5.6 dealt with in the dialog.
    const box = await settledBox(drawer);
    const vh = await page.evaluate(() => window.innerHeight);
    console.log(`[m5.9] drawer portrait: ${JSON.stringify(box)} vh=${vh}`);
    expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(vh + 1);
    expect(box.y).toBeGreaterThan(vh / 2);
  });

  test('in landscape the drawer comes from the side, not the bottom', async ({ page }) => {
    test.slow();
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'phone-shaped viewports only');

    await page.goto('/?perf=1');
    await page.setViewportSize(LANDSCAPE);
    await enterRun(page);

    await page.getByTestId('game-menu-button').click();
    await page.getByTestId('menu-event-log').click();
    const drawer = page.getByTestId('event-log-drawer');
    await expect(drawer).toBeVisible();

    const box = await settledBox(drawer);
    const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    console.log(`[m5.9] drawer landscape: ${JSON.stringify(box)} vp=${JSON.stringify(size)}`);

    // Full height, pinned to the right edge — 390px of height is too little to
    // give a slice of to a bottom sheet.
    expect(Math.round(box.height)).toBe(size.h);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(size.w + 1);
    expect(box.x).toBeGreaterThan(size.w / 2);
  });

  test('the JS and CSS agree about what a phone is, at every shape', async ({ page }) => {
    test.slow();
    // The drift that made this necessary: the hook once decided "phone" from
    // the short edge while mobile.css decided it from `max-height: 500px`. On
    // a 1280x720 coarse-pointer viewport — which `consumables-panel.spec.ts`
    // sets on the mobile project — the hook said phone and the stylesheet said
    // desktop, and the desktop consumables panel vanished.
    //
    // Neither side is asserted directly here; what matters is that they never
    // disagree. `touchControls` is gated in JS on `useIsMobile`, `--safe-top`
    // is defined only inside the CSS query, so the two must rise and fall
    // together at every viewport.
    await page.goto('/?perf=1');
    await enterRun(page);

    const shapes = [
      { name: 'portrait phone', width: 390, height: 844 },
      { name: 'landscape phone', width: 844, height: 390 },
      { name: 'short wide viewport', width: 1280, height: 720 },
      { name: 'narrow window', width: 500, height: 900 },
    ];

    for (const shape of shapes) {
      await page.setViewportSize({ width: shape.width, height: shape.height });
      const seen = await layout(page);
      const jsMobile = seen.touchControls;
      const cssMobile = seen.safeTopVar !== '(unset)';
      console.log(
        `[m5.9] ${shape.name} ${shape.width}x${shape.height}: js=${jsMobile} css=${cssMobile}`,
      );
      expect(jsMobile, `${shape.name}: JS and CSS disagree`).toBe(cssMobile);
    }
  });

  test('desktop still gets the split panel and no touch controls', async ({ page }) => {
    test.slow();
    test.skip((page.viewportSize()?.width ?? 0) < 768, 'desktop viewports only');

    await page.goto('/?perf=1');
    await enterRun(page);
    const desktop = await layout(page);
    console.log(`[m5.9] desktop: ${JSON.stringify(desktop)}`);

    // A wide, fine-pointer viewport must be untouched by any of this.
    expect(desktop.touchControls).toBe(false);
    expect(desktop.panelCount).toBeGreaterThan(1);
    await expect(page.getByTestId('menu-event-log')).toHaveCount(0);
  });
});
