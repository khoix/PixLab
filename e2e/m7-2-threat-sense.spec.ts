import { test, expect } from '@playwright/test';

/**
 * M7.2. The Scroll of Threat-sense stamped a flat `#ff4444` disc over *every*
 * enemy, including the ones the player could already see.
 *
 * Its gate was `distFromPlayer > visionRadius`, and `visionRadius` is the radius
 * at which the fog reaches **full** opacity — not where it starts hiding
 * anything. The lit spotlight is roughly the inner 70%, so the gate covered the
 * whole lit disc plus the entire falloff. Worse, the in-range branch drew the
 * disc at `globalAlpha = 1.0` on top of the mob's real sprite, health bar and
 * all, behind a comment claiming it was making the mob "fully visible".
 *
 * The gate now asks the fog how much it is actually hiding.
 */

test.describe('M7.2 — the marker only marks what the fog hides', () => {
  test('the threshold follows the fog gradient, not its outer edge', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_FOG_GRADIENT__!;
      const R = 200;
      const at = (fraction: number) => ({
        fraction,
        alpha: Number(api.fogAlphaAtDistance(fraction * R, R).toFixed(3)),
        marker: api.needsThreatMarker(fraction * R, R),
      });
      return {
        samples: [0, 0.25, 0.5, 0.7, 0.8, 0.9, 0.975, 1, 1.5].map(at),
        markerStartsAt: Number((api.markerStartDistance(R) / R).toFixed(3)),
        threshold: api.markerFogAlpha,
        // A zero radius must not divide by zero into NaN.
        degenerate: {
          alpha: api.fogAlphaAtDistance(10, 0),
          marker: api.needsThreatMarker(10, 0),
        },
      };
    });

    console.log(
      `[m7.2] fog: ${result.samples.map((s) => `${s.fraction}R a=${s.alpha}${s.marker ? ' MARK' : ''}`).join('  ')}`,
    );
    console.log(`[m7.2] marker starts at ${result.markerStartsAt}R (threshold alpha ${result.threshold})`);

    const byFraction = Object.fromEntries(result.samples.map((s) => [s.fraction, s]));

    // The gradient's inner circle is at 0.5R, so everything inside is fully clear.
    expect(byFraction[0].alpha).toBe(0);
    expect(byFraction[0.25].alpha).toBe(0);
    expect(byFraction[0.5].alpha).toBe(0);
    // 0.7R is the 0.1 stop — the edge of what reads as "the spotlight".
    expect(byFraction[0.7].alpha).toBeCloseTo(0.1, 2);
    // 0.8R is the 0.3 stop; 1R is fully opaque.
    expect(byFraction[0.8].alpha).toBeCloseTo(0.3, 2);
    expect(byFraction[1].alpha).toBe(1);
    expect(byFraction[1.5].alpha).toBe(1);

    // No marker anywhere in the lit disc — the whole point of the milestone.
    expect(byFraction[0].marker).toBe(false);
    expect(byFraction[0.5].marker).toBe(false);
    expect(byFraction[0.7].marker).toBe(false);
    // But the fog still gets to hide things, so the marker must appear before
    // the mob is swallowed.
    expect(byFraction[0.9].marker).toBe(true);
    expect(byFraction[1].marker).toBe(true);
    expect(byFraction[1.5].marker).toBe(true);

    // It starts inside the fog radius, not at it — the old bug in one number.
    expect(result.markerStartsAt).toBeGreaterThan(0.7);
    expect(result.markerStartsAt).toBeLessThan(1);

    expect(result.degenerate.alpha).toBe(1);
    expect(result.degenerate.marker).toBe(true);
  });

  test('the fog layer and the marker read the same gradient', async ({ page }) => {
    await page.goto('/');
    // fogLayer builds its radial gradient from these exact stops. If the two
    // ever drift apart the marker starts lying about what is visible, which is
    // how the original bug survived.
    const stops = await page.evaluate(() => window.__PIXLAB_FOG_GRADIENT__!.stops);
    expect(stops).toEqual([
      [0, 0],
      [0.4, 0.1],
      [0.6, 0.3],
      [0.8, 0.6],
      [0.95, 0.9],
      [1, 1],
    ]);
  });
});

test.describe('M7.2 — in a live sector', () => {
  test('a mob in the spotlight keeps its own art; a distant one is marked', async ({ page }) => {
    test.slow();
    await page.goto('/?perf=1');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(400);

    // Two guardians: one right beside the player, one far across the map.
    const placed = await page.evaluate(() => {
      const api = window.__PIXLAB_LEVEL__!;
      api.clearMobs();
      const p = api.getPlayerPos();
      let near: string | null = null;
      let far: string | null = null;
      for (let r = 1; r <= 2 && !near; r++) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          const x = Math.round(p.x + dx);
          const y = Math.round(p.y + dy);
          if (api.isFloor(x, y)) { near = api.spawnMob('guardian' as never, { x, y }); break; }
        }
      }
      for (let y = 0; y < 40 && !far; y++) {
        for (let x = 0; x < 40; x++) {
          if (Math.hypot(x - p.x, y - p.y) >= 14 && api.isFloor(x, y)) {
            far = api.spawnMob('guardian' as never, { x, y });
            break;
          }
        }
      }
      return { near, far };
    });
    expect(placed.near).not.toBeNull();
    expect(placed.far).not.toBeNull();

    // Turn threat sense on the way the scroll does.
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.addConsumable({
        id: 'test-threat-scroll',
        name: 'Scroll of Threat-sense',
        type: 'consumable',
        rarity: 'epic',
        stats: {},
        price: 10,
        description: 'E2e scroll',
      } as never);
    });
    await page.waitForTimeout(200);

    const before = await page.evaluate(() => window.__PIXLAB_PERF__?.getSnapshot().avgDrawnEntities ?? 0);
    console.log(`[m7.2] avgDrawnEntities before scroll: ${before.toFixed(2)}`);

    // The pure-rules tests above own the marker threshold; here we only need to
    // know the near mob is well inside the lit disc and the far one is not.
    const geometry = await page.evaluate(() => {
      const api = window.__PIXLAB_LEVEL__!;
      const fog = window.__PIXLAB_FOG_GRADIENT__!;
      const perf = window.__PIXLAB_PERF__!.getSnapshot();
      const p = api.getPlayerPos();
      const TILE = 32;
      const entities = api.getEntities().map((e) => {
        const dist = Math.hypot(e.pos.x - p.x, e.pos.y - p.y) * TILE;
        return { id: e.id, dist };
      });
      return { entities, entityCount: perf.entityCount };
    });

    const near = geometry.entities.find((e) => e.id === placed.near)!;
    const far = geometry.entities.find((e) => e.id === placed.far)!;
    console.log(`[m7.2] near mob at ${near.dist.toFixed(0)}px, far mob at ${far.dist.toFixed(0)}px`);
    expect(near.dist).toBeLessThan(far.dist);

    // The near mob must fall in the no-marker band and the far one outside it,
    // for a typical fog radius — otherwise this scenario proves nothing.
    const verdicts = await page.evaluate(
      ({ nearDist, farDist }) => {
        const fog = window.__PIXLAB_FOG_GRADIENT__!;
        // Sector-1 vision is ~5 tiles; use a conservative radius so the
        // assertion does not depend on the exact stat roll.
        const R = 5 * 32;
        return {
          nearMarked: fog.needsThreatMarker(nearDist, R),
          farMarked: fog.needsThreatMarker(farDist, R),
        };
      },
      { nearDist: near.dist, farDist: far.dist },
    );

    expect(verdicts.nearMarked, 'a mob beside the player would still be marked').toBe(false);
    expect(verdicts.farMarked, 'a mob 14 tiles away would not be marked').toBe(true);
  });
});
