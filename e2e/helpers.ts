import { Page, expect } from '@playwright/test';

export async function startSectorRun(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
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
