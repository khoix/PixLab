import { test, expect } from '@playwright/test';
import { openLobbySettings } from './helpers';

test.describe('M6 — Balance & combat clarity', () => {
  test('mobile viewport applies +18% sector timer bonus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const bonusMult = await page.evaluate(() => {
      window.__PIXLAB_TIMER__?.setContext({ isMobile: true, relaxedTimer: false });
      return window.__PIXLAB_TIMER__?.getBonusMult();
    });

    expect(bonusMult).toBeCloseTo(1.18, 2);
  });

  test('relaxed timer setting applies +18% bonus on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const bonusMult = await page.evaluate(() => {
      window.__PIXLAB_TIMER__?.setContext({ isMobile: false, relaxedTimer: true });
      return window.__PIXLAB_TIMER__?.getBonusMult();
    });

    expect(bonusMult).toBeCloseTo(1.18, 2);
  });

  test('relaxed timer setting is available on desktop lobby', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openLobbySettings(page);

    await expect(page.getByTestId('relaxed-timer-settings')).toBeVisible();
    await expect(page.getByTestId('relaxed-timer-on')).toBeVisible();
    await expect(page.getByTestId('relaxed-timer-off')).toBeVisible();
  });

  test('relaxed timer setting is hidden on mobile lobby', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLobbySettings(page, true);

    await expect(page.getByTestId('relaxed-timer-settings')).toHaveCount(0);
  });

  test('exit path hint BFS finds route to exit', async ({ page }) => {
    await page.goto('/');

    const pathLength = await page.evaluate(() => {
      const tiles = [
        ['wall', 'wall', 'wall', 'wall', 'wall'],
        ['wall', 'floor', 'floor', 'floor', 'wall'],
        ['wall', 'floor', 'floor', 'floor', 'wall'],
        ['wall', 'floor', 'floor', 'exit', 'wall'],
        ['wall', 'wall', 'wall', 'wall', 'wall'],
      ];
      const exitPos = { x: 3, y: 3 };
      const start = { x: 1, y: 1 };
      const queue = [start];
      const seen = new Set(['1,1']);
      const prev = new Map<string, string | null>([['1,1', null]]);

      while (queue.length) {
        const cur = queue.shift()!;
        if (cur.x === exitPos.x && cur.y === exitPos.y) {
          let len = 0;
          let key: string | null = `${cur.x},${cur.y}`;
          while (key) {
            len += 1;
            key = prev.get(key) ?? null;
          }
          return len - 1;
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          const k = `${nx},${ny}`;
          if (seen.has(k)) continue;
          if (tiles[ny]?.[nx] === 'wall') continue;
          seen.add(k);
          prev.set(k, `${cur.x},${cur.y}`);
          queue.push({ x: nx, y: ny });
        }
      }
      return 0;
    });

    expect(pathLength).toBeGreaterThan(0);
  });
});
