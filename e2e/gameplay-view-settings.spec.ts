import { test, expect } from '@playwright/test';

test('gameplay view is selected in Settings and persists across reloads', async ({ page }, testInfo) => {
  await page.goto('/?perspective=1');
  await page.getByTestId('start-run-button').click();
  await page.getByTestId('lobby-settings-tab').click();
  await expect(page.getByTestId('gameplay-view-top-down')).toBeChecked();
  const appearance = await page.evaluate(() => {
    const style = (id: string) => {
      const s = getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!);
      return { minWidth: s.minWidth, color: s.color, borderRadius: s.borderRadius };
    };
    return { view: style('gameplay-view-perspective'), quality: style('render-quality-auto') };
  });
  expect(appearance.view).toEqual(appearance.quality);
  await page.getByTestId('gameplay-view-settings').screenshot({ path: testInfo.outputPath('view-settings.png') });
  await page.getByTestId('gameplay-view-perspective').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pixel_labyrinth_save')!).settings.gameplayView)).toBe('perspective');
  const roundTrip = await page.evaluate(async () => {
    const { encodeGameState, decodeGameState } = await import('/src/lib/game/codec.ts');
    const state = JSON.parse(localStorage.getItem('pixel_labyrinth_save')!);
    return decodeGameState(encodeGameState(state))?.settings?.gameplayView;
  });
  expect(roundTrip).toBe('perspective');
  await page.reload();
  await page.getByTestId('start-run-button').click();
  await page.getByTestId('lobby-settings-tab').click();
  await expect(page.getByTestId('gameplay-view-perspective')).toBeChecked();
  await page.getByTestId('gameplay-view-top-down').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pixel_labyrinth_save')!).settings.gameplayView)).toBe('top-down');
});
