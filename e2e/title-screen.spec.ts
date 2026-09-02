import { test, expect, type Page } from '@playwright/test';

// Match the media bytes only — in dev Vite also serves `X.webm?import` JS modules.
const AUDIO_ASSET = /\.(webm|m4a)$/;

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
  test('glitch pulse flags the title screen and overlay, then clears', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').waitFor();

    const screen = page.getByTestId('title-screen');
    const overlay = page.getByTestId('broadcast-glitch');
    await expect(overlay).toHaveAttribute('data-active', 'false');

    await page.evaluate(() => window.__PIXLAB_FX__?.trigger('glitch', 'tear'));
    await expect(screen).toHaveAttribute('data-glitching', 'true');
    await expect(screen).toHaveAttribute('data-glitch-variant', 'tear');
    await expect(overlay).toHaveAttribute('data-active', 'true');
    await expect(overlay).toHaveAttribute('data-variant', 'tear');
    const titleAnimation = await page
      .locator('[data-testid="title-screen"] .glitch-title')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(titleAnimation).toBe('broadcast-title-tear');

    await expect(screen).toHaveAttribute('data-glitching', 'false', { timeout: 3000 });
    await expect(screen).toHaveAttribute('data-glitch-variant', '');
    await expect(overlay).toHaveAttribute('data-active', 'false');
  });

  test('five distinct glitch variants each drive their own title and overlay animations', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').waitFor();

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
      await expect(page.getByTestId('title-screen')).toHaveAttribute('data-glitch-variant', variant);
      await expect(page.getByTestId('broadcast-glitch')).toHaveAttribute('data-variant', variant);

      const [titleAnimation, layerAnimation] = await page.evaluate((selector) => {
        const title = document.querySelector('[data-testid="title-screen"] .glitch-title') as HTMLElement;
        const layer = document.querySelector(`[data-testid="broadcast-glitch"] ${selector}`) as HTMLElement;
        return [getComputedStyle(title).animationName, getComputedStyle(layer).animationName];
      }, want.layer);
      expect(titleAnimation, `${variant} title`).toBe(want.title);
      expect(layerAnimation, `${variant} overlay layer`).toBe(want.layerAnimation);
      seenTitleAnimations.add(titleAnimation);

      await expect(page.getByTestId('title-screen')).toHaveAttribute('data-glitching', 'false', { timeout: 3000 });
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

  test('glitch pulse also runs on the lobby (main menu)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    const lobby = page.getByTestId('lobby-screen');
    await expect(lobby).toHaveAttribute('data-glitching', 'false');
    await page.evaluate(() => window.__PIXLAB_FX__?.trigger('glitch', 'roll'));
    await expect(lobby).toHaveAttribute('data-glitching', 'true');
    await expect(lobby).toHaveAttribute('data-glitch-variant', 'roll');
    await expect(lobby.getByTestId('broadcast-glitch')).toHaveAttribute('data-active', 'true');
    expect(
      await lobby.locator('.glitch-title').evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('broadcast-roll-title');
    await expect(lobby).toHaveAttribute('data-glitching', 'false', { timeout: 3000 });
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
