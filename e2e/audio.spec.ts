import { test, expect } from '@playwright/test';
import { openLobby, openLobbySettings } from './helpers';

const readAudio = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const audio = window.__PIXLAB_AUDIO__;
    return {
      track: audio?.getCurrentTrack() ?? null,
      setting: audio?.getMusicVolume() ?? null,
      gain: audio?.getEffectiveMusicGain() ?? null,
      elementVolume: audio?.getMusicElementVolume() ?? null,
      routed: audio?.isMusicRoutedThroughGraph() ?? false,
      format: audio?.getMusicFormat() ?? null,
      sourceUrl: audio?.getMusicSourceUrl() ?? null,
    };
  });

test.describe('Background music', () => {
  test('plays theme on title screen and maze music after entering a sector', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('start-run-button').click();
    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_AUDIO__?.getCurrentTrack() ?? null))
      .toBe('theme');

    await page.getByTestId('enter-sector-button').click();
    await expect
      .poll(async () => page.evaluate(() => window.__PIXLAB_AUDIO__?.getCurrentTrack() ?? null))
      .toBe('maze');
  });
});

test.describe('Music volume setting', () => {
  test('music is routed through the gain node and the setting drives it', async ({ page }) => {
    await openLobby(page);
    await expect.poll(async () => (await readAudio(page)).track).toBe('theme');

    const initial = await readAudio(page);
    expect(initial.routed).toBe(true);
    expect(initial.elementVolume).toBe(1);
    expect(initial.gain).toBeCloseTo(initial.setting ?? -1, 5);

    await page.evaluate(() => window.__PIXLAB_TEST__?.updateSettings({ musicVolume: 0.2 }));
    await expect.poll(async () => (await readAudio(page)).gain).toBeCloseTo(0.2, 5);
    expect((await readAudio(page)).elementVolume).toBe(1);

    await page.evaluate(() => window.__PIXLAB_TEST__?.updateSettings({ musicVolume: 0 }));
    await expect.poll(async () => (await readAudio(page)).gain).toBe(0);

    await page.getByTestId('enter-sector-button').click();
    await expect.poll(async () => (await readAudio(page)).track).toBe('maze');
    expect((await readAudio(page)).gain).toBe(0);
  });

  test('lobby settings slider changes the live music gain', async ({ page }) => {
    await openLobbySettings(page);
    await expect.poll(async () => (await readAudio(page)).track).toBe('theme');

    const thumb = page.getByTestId('music-volume-slider').getByRole('slider');
    await thumb.focus();
    await page.keyboard.press('Home');

    await expect.poll(async () => (await readAudio(page)).gain).toBe(0);
    await expect(page.getByTestId('lobby-settings-panel')).toContainText('0%');

    await page.keyboard.press('End');
    await expect.poll(async () => (await readAudio(page)).gain).toBe(1);
    await expect(page.getByTestId('lobby-settings-panel')).toContainText('100%');
  });

  test('title theme honours the persisted music volume on a fresh load', async ({ page }) => {
    await openLobby(page);
    await page.evaluate(() => window.__PIXLAB_TEST__?.updateSettings({ musicVolume: 0.3 }));
    await expect.poll(async () => (await readAudio(page)).gain).toBeCloseTo(0.3, 5);
    // Settings persistence is debounced; give it time to flush.
    await page.waitForTimeout(1500);

    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await expect.poll(async () => (await readAudio(page)).track).toBe('theme');
    expect((await readAudio(page)).gain).toBeCloseTo(0.3, 5);
  });

  test('Chromium loads the WebM rendition', async ({ page }) => {
    await openLobby(page);
    await expect.poll(async () => (await readAudio(page)).track).toBe('theme');

    const audio = await readAudio(page);
    expect(audio.format).toBe('webm');
    // Playback comes from the preloaded blob; the blob was built from the WebM asset.
    expect(audio.sourceUrl).toMatch(/^blob:/);
    const sources = await page.evaluate(() => window.__PIXLAB_AUDIO__?.getTrackSources() ?? null);
    expect(Object.values(sources ?? {})).toHaveLength(4);
    for (const url of Object.values(sources ?? {})) {
      expect(url).toMatch(/\.webm(\?|$)/);
    }
  });

  test('WebKit browsers are steered to the AAC rendition (WebKit 276813)', async ({ page }) => {
    await page.goto('/');

    const iosSafari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    const iosChrome =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
    const macSafari =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    const desktopChrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    const desktopFirefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';

    const results = await page.evaluate(
      ({ agents }) => {
        const select = window.__PIXLAB_AUDIO__!.selectMusicFormat;
        const both = { canPlayAac: true, canPlayWebmOpus: true };
        return {
          iosSafari: select({ userAgent: agents.iosSafari, ...both }),
          iosChrome: select({ userAgent: agents.iosChrome, ...both }),
          macSafari: select({ userAgent: agents.macSafari, ...both }),
          desktopChrome: select({ userAgent: agents.desktopChrome, ...both }),
          desktopFirefox: select({ userAgent: agents.desktopFirefox, ...both }),
          safariWithoutAac: select({ userAgent: agents.macSafari, canPlayAac: false, canPlayWebmOpus: true }),
          chromeWithoutOpus: select({ userAgent: agents.desktopChrome, canPlayAac: true, canPlayWebmOpus: false }),
        };
      },
      { agents: { iosSafari, iosChrome, macSafari, desktopChrome, desktopFirefox } },
    );

    expect(results).toEqual({
      iosSafari: 'aac',
      iosChrome: 'aac',
      macSafari: 'aac',
      desktopChrome: 'webm',
      desktopFirefox: 'webm',
      safariWithoutAac: 'webm',
      chromeWithoutOpus: 'aac',
    });
  });
});
