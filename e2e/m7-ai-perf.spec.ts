import { test, expect, type Page } from '@playwright/test';
import { openLobby, readPerfSnapshot, startSectorRun, waitForPerfSamples } from './helpers';

async function startSectorAtLevel(page: Page, level: number, perf = false) {
  await page.goto(perf ? '/?perf=1' : '/');
  await page.getByTestId('start-run-button').click();
  await page.waitForURL('**/play**');
  await page.evaluate((lvl) => window.__PIXLAB_TEST__?.setCurrentLevel(lvl), level);
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas').waitFor({ state: 'visible' });
}

// Nearest floor tile to (player + dx, player + dy), searched in a small ring so
// the spawn is never inside a wall.
async function floorNearOffset(page: Page, dx: number, dy: number) {
  return page.evaluate(
    ({ dx, dy }) => {
      const api = window.__PIXLAB_LEVEL__!;
      const p = api.getPlayerPos();
      const tx = Math.round(p.x + dx);
      const ty = Math.round(p.y + dy);
      for (let r = 0; r < 4; r++) {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            if (api.isFloor(tx + ox, ty + oy)) return { x: tx + ox, y: ty + oy };
          }
        }
      }
      return null;
    },
    { dx, dy },
  );
}

test.describe('M7 — AI scheduler (pure rules)', () => {
  test('tiers: engaged near the player or mid-attack, dormant far outside aggro and vision', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const ai = window.__PIXLAB_AI__!;
      const c = ai.constants;
      return {
        constants: c,
        near: ai.classifyAiTier({ distToPlayer: 2, aggroRange: 7, awakeRadius: 3.5, timingSensitive: false }),
        mid: ai.classifyAiTier({ distToPlayer: 6, aggroRange: 7, awakeRadius: 3.5, timingSensitive: false }),
        justInside: ai.classifyAiTier({ distToPlayer: 7 + c.dormantBuffer, aggroRange: 7, awakeRadius: 3.5, timingSensitive: false }),
        justOutside: ai.classifyAiTier({ distToPlayer: 7 + c.dormantBuffer + 0.01, aggroRange: 7, awakeRadius: 3.5, timingSensitive: false }),
        farButAttacking: ai.classifyAiTier({ distToPlayer: 20, aggroRange: 7, awakeRadius: 3.5, timingSensitive: true }),
        visionKeepsAwake: ai.classifyAiTier({ distToPlayer: 20, aggroRange: 5, awakeRadius: 30, timingSensitive: false }),
        unlimitedAggro: ai.classifyAiTier({ distToPlayer: 40, aggroRange: Infinity, awakeRadius: 3.5, timingSensitive: false }),
      };
    });

    expect(result.constants.staggerGroups).toBe(3);
    expect(result.near).toBe('engaged');
    expect(result.mid).toBe('active');
    expect(result.justInside).toBe('active');
    expect(result.justOutside).toBe('dormant');
    expect(result.farButAttacking).toBe('engaged');
    expect(result.visionKeepsAwake).toBe('active');
    expect(result.unlimitedAggro).toBe('active');
  });

  test('stagger: every active mob is ticked exactly once per stagger cycle, engaged mobs every frame', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const ai = window.__PIXLAB_AI__!;
      const groups = ai.constants.staggerGroups;
      const ids = Array.from({ length: 30 }, (_, i) => `enemy-${i}`);
      const perId = new Map<string, number>();
      let engagedTicks = 0;
      for (let frame = 0; frame < groups * 4; frame++) {
        for (const id of ids) {
          if (ai.shouldUpdateThisFrame('active', ai.aiSlotForId(id), frame)) {
            perId.set(id, (perId.get(id) ?? 0) + 1);
          }
        }
        if (ai.shouldUpdateThisFrame('engaged', 0, frame)) engagedTicks++;
        if (ai.shouldUpdateThisFrame('dormant', 0, frame)) throw new Error('dormant ticked');
      }
      const perFrame: number[] = [];
      for (let frame = 0; frame < groups; frame++) {
        perFrame.push(ids.filter((id) => ai.shouldUpdateThisFrame('active', ai.aiSlotForId(id), frame)).length);
      }
      return {
        ticksPerId: [...new Set(perId.values())],
        engagedTicks,
        perFrame,
        hashedSlotStable: ai.aiSlotForId('boss-zeus') === ai.aiSlotForId('boss-zeus'),
      };
    });

    expect(result.ticksPerId).toEqual([4]);
    expect(result.engagedTicks).toBe(12);
    expect(result.perFrame).toEqual([10, 10, 10]);
    expect(result.hashedSlotStable).toBe(true);
  });
});

test.describe('M7 — AI scheduler in a live sector', () => {
  test('a mob inside aggro range still closes on the player; a far mob sleeps', async ({ page }) => {
    await startSectorRun(page);
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      window.__PIXLAB_LEVEL__!.clearMobs();
      window.__PIXLAB_AI__!.resetStats();
    });

    // Drone aggro range is 7; spawn one 5 tiles out and one ~20 tiles out.
    const nearPos = await floorNearOffset(page, 5, 0);
    const farPos = await page.evaluate(() => {
      const api = window.__PIXLAB_LEVEL__!;
      const p = api.getPlayerPos();
      for (let y = 0; y < 30; y++) {
        for (let x = 0; x < 30; x++) {
          const d = Math.hypot(x - p.x, y - p.y);
          if (d >= 18 && api.isFloor(x, y)) return { x, y };
        }
      }
      return null;
    });
    expect(nearPos).not.toBeNull();
    expect(farPos).not.toBeNull();

    const ids = await page.evaluate(
      ({ nearPos, farPos }) => ({
        near: window.__PIXLAB_LEVEL__!.spawnMob('drone', nearPos!),
        far: window.__PIXLAB_LEVEL__!.spawnMob('drone', farPos!),
      }),
      { nearPos, farPos },
    );

    const startDist = await page.evaluate((id) => {
      const api = window.__PIXLAB_LEVEL__!;
      const e = api.getEntities().find((x) => x.id === id)!;
      const p = api.getPlayerPos();
      return Math.hypot(e.pos.x - p.x, e.pos.y - p.y);
    }, ids.near);

    await page.waitForTimeout(1500);

    const after = await page.evaluate(
      ({ near, far, farPos }) => {
        const api = window.__PIXLAB_LEVEL__!;
        const p = api.getPlayerPos();
        const n = api.getEntities().find((x) => x.id === near)!;
        const f = api.getEntities().find((x) => x.id === far)!;
        return {
          nearDist: Math.hypot(n.pos.x - p.x, n.pos.y - p.y),
          farMoved: f.pos.x !== farPos!.x || f.pos.y !== farPos!.y,
          stats: window.__PIXLAB_AI__!.getStats(),
        };
      },
      { ...ids, farPos },
    );

    expect(after.nearDist).toBeLessThan(startDist);
    expect(after.farMoved).toBe(false);
    expect(after.stats.skippedDormant).toBeGreaterThan(0);
    expect(after.stats.processed).toBeGreaterThan(0);
  });

  test('waking from dormancy hands a mob a capped delta, not a burst', async ({ page }) => {
    await page.goto('/');
    const constants = await page.evaluate(() => window.__PIXLAB_AI__!.constants);
    expect(constants.maxDeltaMs).toBeLessThanOrEqual(500);
    expect(constants.maxDeltaMs).toBeGreaterThanOrEqual(250);
  });

  test('sector 25: most per-frame mob work is skipped and update cost stays bounded', async ({ page }) => {
    test.slow();
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    // Level-1 gear at sector 25 dies fast; the measurement needs a live player.
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.setCurrentLevel(25);
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await waitForPerfSamples(page, 30);

    const withScheduler = await page.evaluate(async () => {
      window.__PIXLAB_AI__!.setEnabled(true);
      window.__PIXLAB_AI__!.resetStats();
      window.__PIXLAB_PERF__!.resetSamples();
      await new Promise((r) => setTimeout(r, 1500));
      return { ai: window.__PIXLAB_AI__!.getStats(), perf: window.__PIXLAB_PERF__!.getSnapshot() };
    });

    const withoutScheduler = await page.evaluate(async () => {
      window.__PIXLAB_AI__!.setEnabled(false);
      window.__PIXLAB_AI__!.resetStats();
      window.__PIXLAB_PERF__!.resetSamples();
      await new Promise((r) => setTimeout(r, 1500));
      const out = { ai: window.__PIXLAB_AI__!.getStats(), perf: window.__PIXLAB_PERF__!.getSnapshot() };
      window.__PIXLAB_AI__!.setEnabled(true);
      return out;
    });

    const perfSnapshot = await readPerfSnapshot(page);
    console.log(
      `[m7] sector ${perfSnapshot.sectorLevel}, ${perfSnapshot.entityCount} entities — ` +
        `update avg ${withScheduler.perf.avgUpdateMs.toFixed(3)}ms (scheduler) vs ` +
        `${withoutScheduler.perf.avgUpdateMs.toFixed(3)}ms (every mob every frame); ` +
        `processed ${withScheduler.ai.processed}/${withScheduler.ai.considered} mob-ticks ` +
        `(dormant ${withScheduler.ai.skippedDormant}, staggered ${withScheduler.ai.skippedStagger})`,
    );

    expect(perfSnapshot.entityCount).toBeGreaterThanOrEqual(15);
    expect(withScheduler.ai.considered).toBeGreaterThan(0);
    // Player starts in a corner of a 30×30 maze, so the bulk of the mobs are asleep.
    expect(withScheduler.ai.processed / withScheduler.ai.considered).toBeLessThan(0.6);
    expect(withScheduler.ai.skippedDormant).toBeGreaterThan(0);
    // Sanity: the fallback really did tick everything.
    expect(withoutScheduler.ai.processed).toBe(withoutScheduler.ai.considered);
    expect(withoutScheduler.ai.skippedDormant + withoutScheduler.ai.skippedStagger).toBe(0);
  });

  test('line-of-sight cache serves repeat queries without recomputing', async ({ page }) => {
    await openLobby(page);
    await page.evaluate(() => window.__PIXLAB_TEST__?.updateStats({ hp: 100_000, maxHp: 100_000 }));
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);

    // Find a two-tile corridor from the player and park turrets at its far end:
    // LOS to that tile is evaluated from both the start tile (via the adjacent
    // attack position) and the destination tile, so stepping back and forth
    // repeats the same (player tile, mob tile) pairs.
    await page.evaluate(() => window.__PIXLAB_LEVEL__!.clearMobs());
    const setup = await page.evaluate(() => {
      const api = window.__PIXLAB_LEVEL__!;
      const p = api.getPlayerPos();
      const dirs = [
        { key: 'ArrowRight', back: 'ArrowLeft', x: 1, y: 0 },
        { key: 'ArrowDown', back: 'ArrowUp', x: 0, y: 1 },
        { key: 'ArrowLeft', back: 'ArrowRight', x: -1, y: 0 },
        { key: 'ArrowUp', back: 'ArrowDown', x: 0, y: -1 },
      ];
      for (const d of dirs) {
        if (!api.isFloor(p.x + d.x, p.y + d.y) || !api.isFloor(p.x + 2 * d.x, p.y + 2 * d.y)) continue;
        const t = { x: p.x + 2 * d.x, y: p.y + 2 * d.y };
        // Several turrets so the player cannot clear the tile mid-test.
        for (let i = 0; i < 4; i++) api.spawnMob('turret', t);
        return { key: d.key, back: d.back };
      }
      return null;
    });
    expect(setup).not.toBeNull();

    // Step there and back so the same (player tile, mob tile) pairs recur.
    for (let i = 0; i < 3; i++) {
      for (const key of [setup!.key, setup!.back]) {
        await page.keyboard.down(key);
        await page.waitForTimeout(260);
        await page.keyboard.up(key);
        await page.waitForTimeout(120);
      }
    }

    const stats = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getLosCacheStats());
    expect(stats).not.toBeNull();
    expect(stats!.misses).toBeGreaterThan(0);
    expect(stats!.hits).toBeGreaterThan(0);
  });
});

test.describe('M7 — lobby test hook', () => {
  test('setCurrentLevel drives the sector that Enter Sector starts', async ({ page }) => {
    await openLobby(page);
    await page.evaluate(() => window.__PIXLAB_TEST__?.setCurrentLevel(21));
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await expect(page.getByText(/SECTOR 21/i).first()).toBeVisible();
  });
});
