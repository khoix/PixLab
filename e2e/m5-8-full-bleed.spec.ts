import { test, expect } from '@playwright/test';

/**
 * M5.8 — the run is full-bleed.
 *
 * Reported after M5.7 landed: "Bars are still there, but the canvas does not
 * move when I hit the hamburger menu now." The creep was fixed; the bars were
 * a separate thing, and they are `body`'s safe-area padding. On a 390×844
 * phone with a 47px top inset and a 34px home indicator the run screen was
 * 763px in an 844px viewport — the canvas gave up 81px, ~10% of the screen,
 * to strips it did not need.
 *
 * It did not need them because every HUD element inside the run screen already
 * carries its own `env()` offset (`.safe-area-top` on the stats row,
 * `--mobile-quick-actions-bottom`, the sector timer). With body padding *and*
 * those offsets both applying, each element was inset twice.
 *
 * So body drops its vertical padding for the duration of a run, the run screen
 * becomes the whole viewport, and those per-element offsets are the single
 * source of the inset.
 *
 * `env()` cannot be emulated, which is why the insets are read through
 * `--safe-*` throughout — an assertion on raw `env()` offsets can only ever
 * read 0 and would prove nothing.
 */

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

const injectInsets = `:root {
  --safe-top: ${SAFE_TOP}px !important;
  --safe-bottom: ${SAFE_BOTTOM}px !important;
}`;

test.describe('M5.8 — full-bleed run screen', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) >= 768,
      'the safe-area block is scoped to max-width: 767px (mobile.css)',
    );
  });

  test('the canvas fills the whole viewport, and the HUD keeps itself clear', async ({ page }) => {
    test.slow();
    await page.goto('/?perf=1');
    await page.addStyleTag({ content: injectInsets });
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
      };
      const cs = getComputedStyle(document.body);
      return {
        viewport: window.innerHeight,
        bodyPadTop: cs.paddingTop,
        bodyPadBottom: cs.paddingBottom,
        runScreen: box('.run-screen'),
        canvas: box('canvas.game-canvas'),
        menuButton: box('[data-testid="game-menu-button"]'),
        statsRow: box('.mobile-hud-stats'),
        sectorBadge: box('.mobile-hud-sector-badge'),
        quickActions: box('.mobile-quick-actions'),
        // The stats row is a full-width box pinned at the top; what has to
        // clear the notch is its *content*, held down by .safe-area-top.
        statsPadTop: getComputedStyle(document.querySelector('.mobile-hud-stats')!).paddingTop,
      };
    });
    console.log(`[m5.8] ${JSON.stringify(m, null, 1)}`);

    // The milestone in two assertions: the run screen is the viewport.
    expect(m.bodyPadTop).toBe('0px');
    expect(m.bodyPadBottom).toBe('0px');
    expect(m.runScreen!.top).toBe(0);
    expect(m.runScreen!.height).toBe(m.viewport);
    expect(m.canvas!.top).toBe(0);
    expect(m.canvas!.height).toBe(m.viewport);

    // ...and nothing in the HUD is left sitting in an unsafe strip. These are
    // what replaced body's padding, so if any of them regressed the content
    // would be under the notch or the home indicator with nothing to catch it.
    expect(m.menuButton!.top).toBeGreaterThanOrEqual(SAFE_TOP);
    expect(parseInt(m.statsPadTop, 10)).toBeGreaterThanOrEqual(SAFE_TOP);
    expect(m.viewport - m.sectorBadge!.bottom).toBeGreaterThanOrEqual(SAFE_BOTTOM);
    expect(m.viewport - m.quickActions!.bottom).toBeGreaterThanOrEqual(SAFE_BOTTOM);
  });

  test('the lobby keeps its safe-area padding — this is run-scoped', async ({ page }) => {
    // Only `.run-screen` is full-bleed. The lobby is an ordinary page whose
    // content must stay out of the notch, so body's padding has to come back
    // the moment the run ends, and `html.run-active` is what scopes it.
    await page.goto('/?perf=1');
    await page.addStyleTag({ content: injectInsets });
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    const lobby = await page.evaluate(() => ({
      padTop: getComputedStyle(document.body).paddingTop,
      padBottom: getComputedStyle(document.body).paddingBottom,
      runActive: document.documentElement.classList.contains('run-active'),
    }));
    console.log(`[m5.8] lobby: ${JSON.stringify(lobby)}`);
    expect(lobby.runActive).toBe(false);
    expect(lobby.padTop).toBe(`${SAFE_TOP}px`);
    expect(lobby.padBottom).toBe(`${SAFE_BOTTOM}px`);

    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    const run = await page.evaluate(() => ({
      padTop: getComputedStyle(document.body).paddingTop,
      runActive: document.documentElement.classList.contains('run-active'),
    }));
    expect(run.runActive).toBe(true);
    expect(run.padTop).toBe('0px');
  });
});
