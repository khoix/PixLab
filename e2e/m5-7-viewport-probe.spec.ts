import { test, expect } from '@playwright/test';

/**
 * M5.7 step 1 — measurement, not a fix.
 *
 * The report: during a long run the playfield creeps upward, leaving a growing
 * black band at the bottom; returning to the main menu clears it.
 *
 * What the screenshots establish on their own: the HP row at the top stays
 * pinned, and the mobile SECTOR badge — a DOM element at `absolute
 * bottom-[100px]` — rises with the band. Across three captures on one
 * 1170×2532 device the bottom of all content moved 2324 → 2081 → 1940 px.
 *
 * A canvas transform cannot move a DOM badge, and a page scroll would carry the
 * top row away too, so the `.run-screen` box is getting shorter. That is as far
 * as static reading goes: nothing in JS writes that height, it comes from a CSS
 * `calc()`. This probe records the numbers so the mechanism can be identified
 * from a device rather than guessed at.
 */

test.describe('M5.7 — viewport probe', () => {
  test('records the run-screen box and the values that decide it', async ({ page }) => {
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    const sample = await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.sample());
    expect(sample).not.toBeNull();
    console.log(`[m5.7] sample: ${JSON.stringify(sample)}`);

    // The box the whole run is positioned against must be found and measured —
    // if this ever reads -1 the probe is looking for the wrong element and every
    // later reading is meaningless.
    expect(sample!.runScreenHeight).toBeGreaterThan(0);
    expect(sample!.canvasHeight).toBeGreaterThan(0);
    expect(sample!.innerHeight).toBeGreaterThan(0);
    expect(sample!.clientHeight).toBeGreaterThan(0);

    // visualViewport is the one thing nothing else in the app reads, and the
    // prime suspect on iOS. It has to come through as a real number.
    expect(sample!.vvHeight).toBeGreaterThan(0);
    expect(sample!.vvScale).toBeGreaterThan(0);
  });

  test('the probe is inert until started, and accumulates once it is', async ({ page }) => {
    // No ?perf=1: the probe must not be running.
    await page.goto('/');
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.isActive())).toBe(false);
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSamples().length)).toBe(0);
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSummary())).toBeNull();

    await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.start(200));
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.isActive())).toBe(true);
    await page.waitForTimeout(900);

    const count = await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSamples().length);
    expect(count).toBeGreaterThan(2);

    await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.stop());
    const afterStop = await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSamples().length);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSamples().length)).toBe(afterStop);
  });

  test('?perf=1 starts it automatically and the drift reads zero on a still viewport', async ({ page }) => {
    await page.goto('/?perf=1');
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.isActive())).toBe(true);

    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });

    await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.reset());
    await page.waitForTimeout(3200);

    const summary = await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSummary());
    expect(summary).not.toBeNull();
    console.log(`[m5.7] summary: ${JSON.stringify(summary)}`);

    expect(summary!.samples).toBeGreaterThan(1);
    // A desktop browser that is not being touched must not drift at all. This is
    // the control: if this ever reports movement, the creep is reproducible here
    // and no device trace is needed.
    expect(Math.abs(summary!.driftPx)).toBeLessThanOrEqual(1);
    expect(summary!.maxRunScreenHeight - summary!.minRunScreenHeight).toBeLessThanOrEqual(1);
  });

  test('a resize is captured, so a real change is never missed between ticks', async ({ page }) => {
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    // `reset()` empties the buffer and the interval is 1 s, so take one
    // explicitly rather than racing the next tick for a baseline.
    await page.evaluate(() => {
      window.__PIXLAB_VIEWPORT__!.reset();
      window.__PIXLAB_VIEWPORT__!.sample();
    });

    const before = await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSummary());
    expect(before).not.toBeNull();
    await page.setViewportSize({ width: 500, height: 500 });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSummary());
    const reasons = await page.evaluate(() =>
      window.__PIXLAB_VIEWPORT__!.getSamples().map((s) => s.reason),
    );

    console.log(`[m5.7] resize: ${before!.lastRunScreenHeight}px -> ${after!.lastRunScreenHeight}px`);
    expect(reasons).toContain('resize');
    expect(after!.lastRunScreenHeight).toBeLessThan(before!.lastRunScreenHeight);
    // Shrinking the window is a real drift, and the probe must report it as one
    // — that is the signal we are asking a device to reproduce.
    expect(after!.driftPx).toBeLessThan(0);
  });

  test('the overlay can be switched on from settings, with no URL parameter', async ({ page }) => {
    // Two full app boots and a reload, so the default 30 s is not enough.
    test.slow();
    // A home-screen web app always launches at the URL that was saved to the
    // home screen, so `?perf=1` can never reach it. Without an in-app switch
    // there is no way to capture a trace on the one device where this happens.
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.evaluate(() => window.__PIXLAB_TEST__?.setLobbyTab('settings'));
    await expect(page.getByTestId('lobby-settings-panel')).toBeVisible();

    const block = page.getByTestId('diagnostics-settings');
    await block.scrollIntoViewIfNeeded();
    await expect(block).toBeVisible();

    expect(await page.evaluate(() => window.__PIXLAB_PERF__!.isActive())).toBe(false);
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.isActive())).toBe(false);

    await page.getByTestId('diagnostics-on').click();
    expect(await page.evaluate(() => window.__PIXLAB_PERF__!.isActive())).toBe(true);
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.isActive())).toBe(true);

    // It has to survive a reload, since that is what a relaunch of the web app
    // looks like. This is the whole point: the flag is persisted, so the
    // overlay is still on next time the app is opened from the home screen.
    await page.reload();
    expect(await page.evaluate(() => window.__PIXLAB_PERF__!.isActive())).toBe(true);

    // And it has to be switchable back off from inside the app. The reload
    // above already put us back on the home screen: `Game.tsx`'s refresh
    // handler resets the run and navigates to `/` whenever `/play` is loaded
    // without the `navigated_to_play` flag. Waiting for that redirect is far
    // cheaper than a second full navigation, which is what pushed this test
    // past the default budget.
    await expect(page.getByTestId('start-run-button')).toBeVisible();
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.evaluate(() => window.__PIXLAB_TEST__?.setLobbyTab('settings'));
    await expect(page.getByTestId('lobby-settings-panel')).toBeVisible();
    await page.getByTestId('diagnostics-off').scrollIntoViewIfNeeded();
    await page.getByTestId('diagnostics-off').click();
    expect(await page.evaluate(() => window.__PIXLAB_PERF__!.isActive())).toBe(false);
    expect(await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.isActive())).toBe(false);
  });

  test('opening the in-run menu must not move the run screen', async ({ page }) => {
    // The first device trace: run-screen height sat at 763px with drift 0
    // across a menu open, while every element inside it moved up together by
    // ~47px — exactly that phone's top inset. So the box was translated, not
    // resized, and a size-only check reads straight through it.
    //
    // The iOS focus-scroll behind that does not reproduce in Chromium, so this
    // is a guard rather than the repro: if a CSS change ever lets the document
    // scroll or the run screen leave the top of the viewport during a run,
    // this fails here instead of on a phone.
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      window.__PIXLAB_VIEWPORT__!.reset();
      window.__PIXLAB_VIEWPORT__!.sample();
    });

    await page.getByTestId('game-menu-button').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.sample());

    const summary = await page.evaluate(() => window.__PIXLAB_VIEWPORT__!.getSummary());
    console.log(`[m5.7] menu open: ${JSON.stringify(summary)}`);

    expect(summary!.topShiftPx).toBe(0);
    expect(summary!.driftPx).toBe(0);
    // `html.run-active` locks document scrolling for exactly this reason.
    expect(summary!.maxScrollY).toBe(0);
    expect(summary!.lastVvOffsetTop).toBe(0);
  });

  test('a dialog must not strip the safe-area padding off body', async ({ page }) => {
    // The device trace, in two numbers: `Top: 47px (shift 0)` before opening
    // the in-run menu, `Top: 0px (shift -47)` after — with `Scroll: 0` and
    // `VV: 0/0` throughout, and the height never moving off 763px. Not a
    // scroll, not an iOS viewport offset: body's `padding-top` was zeroed.
    //
    // `react-remove-scroll-bar`, which Radix Dialog pulls in, injects
    // `body[data-scroll-locked] { padding-top: <body's margin-top>px }` when a
    // dialog opens. Tailwind's preflight zeroes body's margin, so it writes
    // 0px over the safe-area inset — and at (0,1,1) it outspecifies the
    // `body { padding-top: var(--safe-top) }` rule at (0,0,1).
    //
    // Mobile-only by construction: body's safe-area padding, and the
    // `--safe-*` variables themselves, are declared inside
    // `@media (max-width: 767px)`. Above that there is no padding to strip, so
    // there is nothing here to regress.
    test.skip(
      (page.viewportSize()?.width ?? 0) >= 768,
      'body only carries safe-area padding below 768px (mobile.css media query)',
    );

    // `env()` cannot be emulated, so drive the variables the same way
    // mobile.css consumes them.
    await page.goto('/?perf=1');
    await page.addStyleTag({
      content: ':root { --safe-top: 47px !important; --safe-bottom: 34px !important; }',
    });
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });

    const readTop = () =>
      page.evaluate(() => ({
        runTop: Math.round(document.querySelector('.run-screen')!.getBoundingClientRect().top),
        bodyPadTop: getComputedStyle(document.body).paddingTop,
        bodyPadBottom: getComputedStyle(document.body).paddingBottom,
        locked: document.body.getAttribute('data-scroll-locked'),
      }));

    const before = await readTop();
    console.log(`[m5.7] before menu: ${JSON.stringify(before)}`);
    expect(before.runTop).toBe(47);

    await page.getByTestId('game-menu-button').click();
    await page.waitForTimeout(500);
    const during = await readTop();
    console.log(`[m5.7] menu open:   ${JSON.stringify(during)}`);

    // The whole bug in one assertion: the run screen must not slide up when a
    // dialog takes the scroll lock.
    expect(during.bodyPadTop).toBe('47px');
    expect(during.bodyPadBottom).toBe('34px');
    expect(during.runTop).toBe(47);
  });

  test('the overlay shows the drift on screen, since the device is a phone', async ({ page }) => {
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(1500);

    const overlay = page.getByTestId('perf-overlay');
    await expect(overlay).toBeVisible();
    const block = page.getByTestId('perf-overlay-viewport');
    await expect(block).toBeVisible();
    await expect(page.getByTestId('perf-overlay-drift')).toContainText('Drift:');
    // There is no console on a phone; the numbers have to be readable on screen.
    await expect(block).toContainText('Run screen:');
    // Height alone missed the whole of the first device trace — the position
    // and the two things that can change it without resizing the box have to
    // be on screen as well.
    await expect(page.getByTestId('perf-overlay-shift')).toContainText('Top:');
    await expect(page.getByTestId('perf-overlay-scroll')).toContainText('Scroll:');
    await expect(page.getByTestId('perf-overlay-scroll')).toContainText('VV:');
  });
});
