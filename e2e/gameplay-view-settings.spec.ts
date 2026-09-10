import { test, expect } from '@playwright/test';

test('gameplay view is selected in Settings and persists across reloads', async ({ page }) => {
  await page.goto('/?perspective=1');
  await page.getByTestId('start-run-button').click();
  await page.getByTestId('lobby-settings-tab').click();
  await expect(page.getByTestId('gameplay-view-top-down')).toBeChecked();
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
