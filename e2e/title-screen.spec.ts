import { test, expect, type Page } from '@playwright/test';
import {
  PRELOAD_STATUS_DEGRADED,
  PRELOAD_STATUS_LINES,
  pickPreloadStatusLine,
} from '../client/src/lib/preloadStatus';

// Match the media bytes only — in dev Vite also serves `X.webm?import` JS modules,
// and a long-running dev server appends `?t=<hmr timestamp>` to the media URL.
const AUDIO_ASSET = /\.(webm|m4a)(\?(?!import)[^?]*)?$/;

async function delayAudioAssets(page: Page, delayMs: number) {
  await page.route(AUDIO_ASSET, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

const preloadState = (page: Page) => page.evaluate(() => window.__PIXLAB_AUDIO__?.getPreloadState() ?? null);

test.describe('Title screen — music preload gate', () => {
  test('menu is hidden behind the progress bar until every track is cached', async ({ page }) => {
    await delayAudioAssets(page, 1500);
    await page.goto('/');

    const progress = page.getByTestId('music-preload-progress');
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute('role', 'progressbar');
    await expect(page.getByTestId('start-run-button')).toHaveCount(0);
    await expect(page.getByPlaceholder('ENTER CODE')).toHaveCount(0);
    await expect(page.getByTestId('music-preload')).toContainText('TUNING BROADCAST');

    // The log under the bar is fictional flavour, never a literal file/track count.
    const status = page.getByTestId('music-preload-status');
    await expect(status).toBeVisible();
    const statusText = (await status.innerText()).replace(/[>▌]/g, '').trim();
    expect(PRELOAD_STATUS_LINES as readonly string[]).toContain(statusText);
    expect(statusText).not.toMatch(/TRACK|FILE|CACHE|MB|BYTES/i);

    await expect(page.getByTestId('start-run-button')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder('ENTER CODE')).toBeVisible();
    await expect(page.getByTestId('music-preload')).toHaveCount(0);

    const state = await preloadState(page);
    expect(state?.status).toBe('done');
    expect(state?.progress).toBe(1);
    expect(state?.completedTracks).toBe(4);
    expect(state?.totalTracks).toBe(4);
    expect(state?.loadedBytes).toBeGreaterThan(1_000_000);
  });

  test('music plays from the preloaded blob, not the network', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();

    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_AUDIO__?.getCurrentTrack() ?? null))
      .toBe('theme');
    const themeSrc = await page.evaluate(() => window.__PIXLAB_AUDIO__?.getMusicSourceUrl());
    expect(themeSrc).toMatch(/^blob:/);

    await page.getByTestId('enter-sector-button').click();
    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_AUDIO__?.getCurrentTrack() ?? null))
      .toBe('maze');
    const mazeSrc = await page.evaluate(() => window.__PIXLAB_AUDIO__?.getMusicSourceUrl());
    expect(mazeSrc).toMatch(/^blob:/);
    expect(mazeSrc).not.toBe(themeSrc);
  });

  test('a failed download still hands the menu back', async ({ page }) => {
    await page.route(AUDIO_ASSET, (route) => route.abort('failed'));
    await page.goto('/');

    await expect(page.getByTestId('start-run-button')).toBeVisible({ timeout: 20_000 });
    const state = await preloadState(page);
    expect(state?.status).toBe('error');
  });

  test('boot log marches with progress and time but only reports lock-on when settled', () => {
    const last = PRELOAD_STATUS_LINES[PRELOAD_STATUS_LINES.length - 1];
    expect(pickPreloadStatusLine(0, 0, 'loading')).toBe(PRELOAD_STATUS_LINES[0]);
    expect(pickPreloadStatusLine(0.5, 0, 'loading')).toBe(PRELOAD_STATUS_LINES[4]);
    // A stalled download still advances the log over time…
    expect(pickPreloadStatusLine(0, 3, 'loading')).toBe(PRELOAD_STATUS_LINES[3]);
    // …but never past the final in-progress line, and never to the done line.
    expect(pickPreloadStatusLine(1, 999, 'loading')).toBe(last);
    expect(pickPreloadStatusLine(1, 0, 'done')).toBe('SIGNAL LOCKED');
    expect(pickPreloadStatusLine(0.2, 0, 'error')).toBe(PRELOAD_STATUS_DEGRADED);
    expect(pickPreloadStatusLine(Number.NaN, -5, 'loading')).toBe(PRELOAD_STATUS_LINES[0]);
  });

  test('returning to the title screen skips the progress bar', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    await page.goto('/');
    await expect(page.getByTestId('start-run-button')).toBeVisible();
    // Cache API served the second load, so the preloader reports done without re-downloading.
    expect((await preloadState(page))?.status).toBe('done');
  });

  test('audio graph is kicked awake when the theme starts (Safari silent-media workaround)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_AUDIO__?.getGraphKickCount() ?? 0))
      .toBeGreaterThanOrEqual(1);
  });
});

test.describe('Menu ambience — broadcast glitch and title glimmer', () => {
  async function openLobbyScreen(page: Page) {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    const lobby = page.getByTestId('lobby-screen');
    await expect(lobby).toHaveAttribute('data-glitching', 'false');
    return lobby;
  }

  test('title screen has no broadcast glitch — only the glimmer', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').waitFor();

    const screen = page.getByTestId('title-screen');
    await expect(page.getByTestId('broadcast-glitch')).toHaveCount(0);
    await expect(screen).not.toHaveAttribute('data-glitching', /.*/);

    // A glitch trigger must leave the title screen untouched.
    await page.evaluate(() => window.__PIXLAB_FX__?.trigger('glitch', 'tear'));
    await page.waitForTimeout(150);
    await expect(page.getByTestId('broadcast-glitch')).toHaveCount(0);
    await expect(screen).not.toHaveAttribute('data-glitching', /.*/);
    expect(await page.locator('[data-testid="title-screen"] .glitch-title').count()).toBe(0);
    expect(await page.locator('[data-testid="title-screen"] .glitch-jitter').count()).toBe(0);
    expect(await page.evaluate(() => window.__PIXLAB_FX__?.isActive('glitch'))).toBe(false);

    // Glimmer still works there.
    await page.evaluate(() => window.__PIXLAB_FX__?.trigger('glimmer'));
    await expect(screen).toHaveAttribute('data-glimmer', 'true');
  });

  test('glitch pulse flags the lobby and overlay, then clears', async ({ page }) => {
    const lobby = await openLobbyScreen(page);
    const overlay = lobby.getByTestId('broadcast-glitch');
    await expect(overlay).toHaveAttribute('data-active', 'false');

    await page.evaluate(() => window.__PIXLAB_FX__?.trigger('glitch', 'tear'));
    await expect(lobby).toHaveAttribute('data-glitching', 'true');
    await expect(lobby).toHaveAttribute('data-glitch-variant', 'tear');
    await expect(overlay).toHaveAttribute('data-active', 'true');
    await expect(overlay).toHaveAttribute('data-variant', 'tear');
    expect(
      await lobby.locator('.glitch-title').evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('broadcast-title-tear');

    await expect(lobby).toHaveAttribute('data-glitching', 'false', { timeout: 3000 });
    await expect(lobby).toHaveAttribute('data-glitch-variant', '');
    await expect(overlay).toHaveAttribute('data-active', 'false');
  });

  test('five distinct glitch variants each drive their own title and overlay animations', async ({ page }) => {
    const lobby = await openLobbyScreen(page);

    const expected: Record<string, { title: string; layer: string; layerAnimation: string }> = {
      tear: { title: 'broadcast-title-tear', layer: '.broadcast-glitch__band', layerAnimation: 'broadcast-band-sweep' },
      roll: { title: 'broadcast-roll-title', layer: '.broadcast-glitch__blanking', layerAnimation: 'broadcast-blanking-roll' },
      static: { title: 'broadcast-static-title', layer: '.broadcast-glitch__noise', layerAnimation: 'broadcast-noise-burst' },
      chroma: { title: 'broadcast-chroma-title', layer: '.broadcast-glitch__scanlines', layerAnimation: 'broadcast-scanline-breathe' },
      hsync: { title: 'broadcast-hsync-title', layer: '.broadcast-glitch__strip--2', layerAnimation: 'broadcast-strip-slip-right' },
    };

    const seenTitleAnimations = new Set<string>();
    for (const [variant, want] of Object.entries(expected)) {
      await page.evaluate((v) => window.__PIXLAB_FX__?.trigger('glitch', v), variant);
      await expect(lobby).toHaveAttribute('data-glitch-variant', variant);
      await expect(lobby.getByTestId('broadcast-glitch')).toHaveAttribute('data-variant', variant);

      const [titleAnimation, layerAnimation] = await page.evaluate((selector) => {
        const title = document.querySelector('[data-testid="lobby-screen"] .glitch-title') as HTMLElement;
        const layer = document.querySelector(`[data-testid="broadcast-glitch"] ${selector}`) as HTMLElement;
        return [getComputedStyle(title).animationName, getComputedStyle(layer).animationName];
      }, want.layer);
      expect(titleAnimation, `${variant} title`).toBe(want.title);
      expect(layerAnimation, `${variant} overlay layer`).toBe(want.layerAnimation);
      seenTitleAnimations.add(titleAnimation);

      await expect(lobby).toHaveAttribute('data-glitching', 'false', { timeout: 3000 });
    }
    expect(seenTitleAnimations.size).toBe(5);
  });

  test('automatic pulses rotate variants without immediate repeats and cover all five', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').waitFor();

    const result = await page.evaluate(() => {
      const pick = window.__PIXLAB_FX__!.pickGlitchVariant;
      const seen = new Set<string>();
      let previous: ReturnType<typeof pick> | null = null;
      let repeats = 0;
      for (let i = 0; i < 300; i++) {
        const next = pick(previous);
        if (next === previous) repeats++;
        seen.add(next);
        previous = next;
      }
      // Deterministic edge: random() returning ~1 must still yield a valid variant.
      const edge = pick('tear', () => 0.999999);
      return { repeats, variants: [...seen].sort(), edge };
    });

    expect(result.repeats).toBe(0);
    expect(result.variants).toEqual(['chroma', 'hsync', 'roll', 'static', 'tear']);
    expect(['chroma', 'hsync', 'roll', 'static']).toContain(result.edge);
  });

  test('sword and shield glint is masked to the artwork and animates on a glimmer pulse', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').waitFor();

    const glint = page.getByTestId('title-glint');
    const maskImage = await glint.evaluate(
      (el) => getComputedStyle(el).maskImage || (getComputedStyle(el) as any).webkitMaskImage,
    );
    expect(maskImage).toMatch(/url\(.*pixlab3\.PNG/i);

    await page.evaluate(() => window.__PIXLAB_FX__?.trigger('glimmer'));
    await expect(page.getByTestId('title-screen')).toHaveAttribute('data-glimmer', 'true');
    expect(await glint.evaluate((el) => getComputedStyle(el).animationName)).toBe('title-glint-sweep');
    await expect(page.getByTestId('title-screen')).toHaveAttribute('data-glimmer', 'false', { timeout: 4000 });
  });

  test('effects fire on their own schedule, but not under reduced motion', async ({ browser }) => {
    const auto = await browser.newContext();
    const autoPage = await auto.newPage();
    await autoPage.goto('/');
    await autoPage.getByTestId('start-run-button').waitFor();
    await expect
      .poll(
        async () =>
          autoPage.evaluate(
            () =>
              (window.__PIXLAB_FX__?.getFireCount('glitch') ?? 0) +
              (window.__PIXLAB_FX__?.getFireCount('glimmer') ?? 0),
          ),
        { timeout: 8000 },
      )
      .toBeGreaterThanOrEqual(1);
    await auto.close();

    const reduced = await browser.newContext({ reducedMotion: 'reduce' });
    const reducedPage = await reduced.newPage();
    await reducedPage.goto('/');
    await reducedPage.getByTestId('start-run-button').waitFor();
    await reducedPage.waitForTimeout(3500);
    const fired = await reducedPage.evaluate(
      () =>
        (window.__PIXLAB_FX__?.getFireCount('glitch') ?? 0) +
        (window.__PIXLAB_FX__?.getFireCount('glimmer') ?? 0),
    );
    expect(fired).toBe(0);
    await reduced.close();
  });
});
