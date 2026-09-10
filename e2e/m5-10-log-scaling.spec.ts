import { test, expect } from '@playwright/test';

/**
 * M5.10 — three defects reported against the M5.9 drawer.
 *
 * 1. "The floating joystick still isn't working in landscape mode."
 *    M5.9 made `isMobile` orientation-aware, so React renders the control —
 *    but `FloatingTouchControl` also carried `md:hidden`, a *width* utility, so
 *    an 844px-wide rotated phone set `display: none` on it. It was in the DOM
 *    the whole time, which is exactly why M5.9's test passed: it asserted the
 *    wrapper existed rather than that the control was visible.
 *
 * 2. "The game needs to pause when it's brought up." M5.9 added `showEventLog`
 *    to `dialogOpen`, which turned out to feed only the portal prompt. The
 *    effect that actually stops the clock keeps its own list.
 *
 * 3. "The log needs to properly scale for a smaller screen."
 */

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function enterRun(page: import('@playwright/test').Page) {
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
}

test.describe('M5.10 — controls, pause and log scale', () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'phone-shaped viewports only');
  });

  test('the floating joystick is visible and usable in both orientations', async ({ page }) => {
    test.slow();
    await page.goto('/?perf=1');
    await enterRun(page);

    const joystick = page.getByTestId('mobile-floating-touch-control');

    await page.setViewportSize(PORTRAIT);
    await page.waitForTimeout(400);
    await expect(joystick, 'portrait').toBeVisible();

    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(400);
    // The regression. Before the fix this element existed but computed to
    // `display: none`, so `toBeVisible()` fails where a presence check passes.
    await expect(joystick, 'landscape').toBeVisible();

    const box = (await joystick.boundingBox())!;
    const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    console.log(`[m5.10] joystick landscape: ${JSON.stringify(box)} vp=${JSON.stringify(size)}`);
    // It is the whole-screen touch layer, so it must actually cover the screen.
    expect(Math.round(box.width)).toBe(size.w);
    expect(Math.round(box.height)).toBe(size.h);
  });

  test('opening the event log pauses the run, and closing it resumes', async ({ page }) => {
    test.slow();
    await page.goto('/?perf=1');
    await page.setViewportSize(PORTRAIT);
    await enterRun(page);
    await page.waitForTimeout(400);

    const paused = () => page.evaluate(() => window.__PIXLAB_CLOCK__?.isPaused() ?? null);

    expect(await paused(), 'not paused before opening').toBe(false);

    await page.getByTestId('game-menu-button').click();
    await page.getByTestId('menu-event-log').click();
    await expect(page.getByTestId('event-log-drawer')).toBeVisible();
    await page.waitForTimeout(300);

    // The clock, not just the countdown: mobs and cooldowns freeze with it.
    expect(await paused(), 'paused while the drawer is open').toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('event-log-drawer')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await paused(), 'resumed after closing').toBe(false);
  });

  test('the log fits the drawer: nothing overflows and the controls clear the entries', async ({ page }) => {
    test.slow();
    await page.goto('/?perf=1');
    await page.setViewportSize(PORTRAIT);
    await enterRun(page);

    await page.getByTestId('game-menu-button').click();
    await page.getByTestId('menu-event-log').click();
    const drawer = page.getByTestId('event-log-drawer');
    await expect(drawer).toBeVisible();
    await page.waitForTimeout(700);

    const m = await page.evaluate(() => {
      const drawerEl = document.querySelector('[data-testid="event-log-drawer"]') as HTMLElement;
      const console_ = drawerEl.querySelector('[data-testid="event-log-console"]') as HTMLElement;
      const clear = Array.from(drawerEl.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Clear',
      ) as HTMLElement | undefined;
      const rows = Array.from(console_.querySelectorAll('.font-pixel > div')) as HTMLElement[];
      const rect = (el: HTMLElement | undefined) =>
        el ? (({ x, y, width, height, bottom, right }) => ({
          x: Math.round(x), y: Math.round(y), width: Math.round(width),
          height: Math.round(height), bottom: Math.round(bottom), right: Math.round(right),
        }))(el.getBoundingClientRect()) : null;
      return {
        drawer: rect(drawerEl),
        clear: rect(clear),
        rows: rows.slice(0, 3).map(rect),
        // A row wider than its container is the "one word per line" symptom.
        consoleScrollWidth: console_.scrollWidth,
        consoleClientWidth: console_.clientWidth,
      };
    });
    console.log(`[m5.10] log: ${JSON.stringify(m, null, 1)}`);

    // No horizontal overflow inside the drawer.
    expect(m.consoleScrollWidth).toBeLessThanOrEqual(m.consoleClientWidth + 1);

    // Every entry stays inside the drawer's width...
    for (const row of m.rows) {
      expect(row!.right).toBeLessThanOrEqual(m.drawer!.right + 1);
      expect(row!.x).toBeGreaterThanOrEqual(m.drawer!.x - 1);
    }

    // ...and the Clear button sits above them rather than on top of them, which
    // is what `absolute top-2 right-2` did at this width.
    expect(m.clear).not.toBeNull();
    for (const row of m.rows) {
      expect(row!.y, 'entries must start below the controls').toBeGreaterThanOrEqual(
        m.clear!.bottom - 1,
      );
    }
  });
});
