import { Page, expect } from '@playwright/test';

export async function openLobby(page: Page, mobile = false): Promise<void> {
  if (mobile) {
    await page.setViewportSize({ width: 375, height: 667 });
  }
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
}

export async function clickLobbySettingsTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__PIXLAB_TEST__?.setLobbyTab('settings');
  });
}

export async function openLobbySettings(page: Page, mobile = false): Promise<void> {
  await openLobby(page, mobile);
  await clickLobbySettingsTab(page);
  await expect(page.getByTestId('lobby-settings-panel')).toBeVisible();
}

export async function startSectorRun(page: Page): Promise<void> {
  await openLobby(page);
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas').waitFor({ state: 'visible' });
}

export async function waitForPerfSamples(page: Page, minSamples = 30): Promise<void> {
  await expect
    .poll(
      async () => {
        return page.evaluate(() => window.__PIXLAB_PERF__?.getSnapshot().sampleCount ?? 0);
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(minSamples);
}

export interface PerfSnapshotResult {
  fps: number;
  avgFrameMs: number;
  avgDrawMs: number;
  avgUpdateMs: number;
  maxDrawMs: number;
  entityCount: number;
  loopRestarts: number;
  inputDirectionUpdates: number;
  sampleCount: number;
  sectorLevel: number;
}

export async function readPerfSnapshot(page: Page): Promise<PerfSnapshotResult> {
  return page.evaluate(() => {
    const snapshot = window.__PIXLAB_PERF__?.getSnapshot();
    if (!snapshot) {
      throw new Error('Perf snapshot unavailable');
    }
    return snapshot;
  });
}
