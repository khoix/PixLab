import { test, expect } from '@playwright/test';
import { startSectorRun } from './helpers';

/**
 * M6.1 follow-up. Two correctness bugs, not tuning:
 *
 * 1. `attackCooldown` was cleared whenever a mob left melee contact, so it was
 *    a floor only while contact stayed continuous. Any oscillating mob reset
 *    its own cadence — and M6.1's line-of-sight gate routes a wall-dipping
 *    Phase into exactly that branch, so the fairness fix made it fire more.
 * 2. Phase pursuit advanced both axes in one move tick, covering √2 tiles for
 *    the price of one and closing at 4.53 tiles/s against the player's 4.0.
 */

test.describe('M6.1-FU — melee cadence survives disengagement', () => {
  test('breaking contact does not refund the remaining cooldown', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_MELEE_CADENCE__!;
      const gate = (now: number) =>
        api.canLandMeleeHit({ now, lastDamageTime: 1000, cooldownMs: 600, attackerInWall: false });
      return {
        immediately: gate(1000),
        midCooldown: gate(1300),
        justShort: gate(1599),
        exactly: gate(1600),
        wellAfter: gate(5000),
        remainingMid: api.remainingCooldownMs(1300, 1000, 600),
        remainingAfter: api.remainingCooldownMs(5000, 1000, 600),
      };
    });

    // The clock is the only thing that clears a cooldown. Stepping out of
    // contact and back in — which is what the old `delete` rewarded — lands
    // somewhere in the middle of this window and must still be blocked.
    expect(result.immediately).toBe(false);
    expect(result.midCooldown).toBe(false);
    expect(result.justShort).toBe(false);
    expect(result.exactly).toBe(true);
    expect(result.wellAfter).toBe(true);
    expect(result.remainingMid).toBe(300);
    expect(result.remainingAfter).toBe(0);
  });

  test('a mob that has never hit still connects on first contact', async ({ page }) => {
    await page.goto('/');
    const first = await page.evaluate(() =>
      window.__PIXLAB_MELEE_CADENCE__!.canLandMeleeHit({
        now: 1_700_000_000_000,
        lastDamageTime: 0,
        cooldownMs: 2000,
        attackerInWall: false,
      }),
    );

    // Keeping the cooldown across disengagement must not make a fresh mob, or
    // one returning after a long absence, hesitate.
    expect(first).toBe(true);
  });

  test('a mob inside a wall cannot attack however long it has waited', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_MELEE_CADENCE__!;
      const base = { now: 10_000, lastDamageTime: 0, cooldownMs: 600 };
      return {
        inWall: api.canLandMeleeHit({ ...base, attackerInWall: true }),
        onFloor: api.canLandMeleeHit({ ...base, attackerInWall: false }),
      };
    });

    // Symmetry with the player's own attack rule: a tile the player cannot
    // attack into is a tile the mob cannot attack out of.
    expect(result.inWall).toBe(false);
    expect(result.onFloor).toBe(true);
  });
});

test.describe('M6.1-FU — surfacing is a tell, not a hit', () => {
  test('a phasing mob cannot emerge and damage on the same tick', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const phase = window.__PIXLAB_PHASE__!;
      const cadence = window.__PIXLAB_MELEE_CADENCE__!;
      const emergedAt = 50_000;
      const at = (offset: number) =>
        cadence.canLandMeleeHit({
          now: emergedAt + offset,
          lastDamageTime: 0,
          cooldownMs: 600,
          attackerInWall: false,
          emergedAt,
        });
      return {
        window: phase.emergenceMs,
        sameTick: at(0),
        midWindow: at(150),
        justShort: at(299),
        afterWindow: at(300),
        // A mob that never phased carries no stamp and is never gated.
        neverPhased: cadence.canLandMeleeHit({
          now: emergedAt,
          lastDamageTime: 0,
          cooldownMs: 600,
          attackerInWall: false,
        }),
        emerging: phase.isEmergingStep(2, false),
        stillInside: phase.isEmergingStep(2, true),
        neverEntered: phase.isEmergingStep(0, false),
      };
    });

    expect(result.window).toBe(300);
    expect(result.sameTick).toBe(false);
    expect(result.midWindow).toBe(false);
    expect(result.justShort).toBe(false);
    expect(result.afterWindow).toBe(true);
    expect(result.neverPhased).toBe(true);
    // The stamp fires on wall → floor only.
    expect(result.emerging).toBe(true);
    expect(result.stillInside).toBe(false);
    expect(result.neverEntered).toBe(false);
  });
});

test.describe('M6.1-FU — moveSpeed means what it says', () => {
  test('a diagonal step costs √2 delays, so closing speed matches the stat', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_MOVEMENT__!;
      const phaseSpeed = 0.8;
      return {
        cost: api.diagonalStepCost,
        cardinalCost: api.stepCost(1, 0),
        diagonalCost: api.stepCost(1, 1),
        // Cardinal steps must carry exactly 0, as before the change.
        cardinalCarry: api.nextMoveTimer(312.5, 0, -1),
        diagonalCarry: api.nextMoveTimer(312.5, -1, 1),
        cardinalSpeed: api.effectiveTilesPerSecond(phaseSpeed, 1, 0),
        diagonalSpeed: api.effectiveTilesPerSecond(phaseSpeed, 1, 1),
        // Not grid steps, so they keep the flat cost they always had: the
        // moth's continuous orbit and its room-crossing blink, and the
        // tracker's two-tile pounce and half-tile stalk.
        orbitCost: api.stepCost(-0.37, 0.92),
        blinkCost: api.stepCost(6, -4),
        pounceCost: api.stepCost(2, 0),
        stalkCost: api.stepCost(0.5, 0),
        unitDiagonal: api.isUnitGridStep(1, -1),
        notUnit: api.isUnitGridStep(1, 2),
      };
    });

    expect(result.cost).toBeCloseTo(Math.SQRT2, 10);
    expect(result.cardinalCost).toBe(1);
    expect(result.diagonalCost).toBeCloseTo(Math.SQRT2, 10);
    expect(result.cardinalCarry).toBe(0);
    expect(result.diagonalCarry).toBeCloseTo(312.5 * (1 - Math.SQRT2), 6);

    // The whole point: shape no longer changes how fast the mob closes.
    expect(result.diagonalSpeed).toBeCloseTo(result.cardinalSpeed, 10);
    expect(result.cardinalSpeed).toBeCloseTo(3.2, 10);

    // Charging √2 for a teleport would be arbitrary, and charging it for the
    // moth's orbit would have quietly slowed every moth by 41%.
    expect(result.orbitCost).toBe(1);
    expect(result.blinkCost).toBe(1);
    expect(result.pounceCost).toBe(1);
    expect(result.stalkCost).toBe(1);
    expect(result.unitDiagonal).toBe(true);
    expect(result.notUnit).toBe(false);
  });

  test('the Hades Phase can now be outrun', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const move = window.__PIXLAB_MOVEMENT__!;
      const balance = window.__PIXLAB_MOB_BALANCE__!;
      const phaseSpeed = balance.scaledMoveSpeed('phase', 20);
      // INITIAL_STATS.speed = 1, and getPlayerMoveDelayMs is 1000 / (speed * 4)
      // — one tile per 250 ms, so 4 tiles per second.
      const playerTilesPerSecond = 4;
      return {
        phaseSpeed,
        playerTilesPerSecond,
        diagonal: move.effectiveTilesPerSecond(phaseSpeed, 1, 1),
        uncostedDiagonal:
          (Math.SQRT2 / move.baseMoveDelayMs(phaseSpeed)) * 1000,
      };
    });

    expect(result.phaseSpeed).toBeCloseTo(0.8, 5);
    // Before the fix a diagonal step covered √2 tiles per cardinal delay.
    expect(result.uncostedDiagonal).toBeGreaterThan(result.playerTilesPerSecond);
    expect(result.uncostedDiagonal).toBeCloseTo(4.525, 2);
    // After it, the player is faster than the thing chasing them.
    expect(result.diagonal).toBeLessThan(result.playerTilesPerSecond);
  });
});

test.describe('M6.1-FU — cadence holds in a live sector', () => {
  test('toggling in and out of range cannot exceed the configured cadence', async ({ page }) => {
    // Boot plus a sector start is slow in CI; the in-page loop itself is ~1.5 s.
    test.setTimeout(90_000);
    await startSectorRun(page);
    await page.waitForTimeout(400);

    const result = await page.evaluate(async () => {
      const level = window.__PIXLAB_LEVEL__!;
      const testApi = window.__PIXLAB_TEST__!;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // Survive the whole window whatever lands.
      testApi.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
      level.clearMobs();
      await sleep(80);

      const home = level.getPlayerPos();
      const home2 = { x: Math.round(home.x), y: Math.round(home.y) };
      // A cardinal neighbour for the mob, and somewhere to step away to.
      const offsets = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      const seat = offsets.find((o) => level.isFloor(home2.x + o.x, home2.y + o.y));
      if (!seat) return { skipped: true as const };
      const away = offsets.find(
        (o) => (o.x !== seat.x || o.y !== seat.y) && level.isFloor(home2.x + o.x * 2, home2.y + o.y * 2),
      );
      if (!away) return { skipped: true as const };

      const awayPos = { x: home2.x + away.x * 2, y: home2.y + away.y * 2 };
      // Guardian: 800 ms cadence, 0.6 moveSpeed — slow enough that it stays put
      // while the player steps in and out.
      const id = level.spawnMob('guardian', { x: home2.x + seat.x, y: home2.y + seat.y });
      if (!id) return { skipped: true as const };

      const started = performance.now();
      let hp = level.getPlayerHp();
      let hits = 0;
      // 8 re-entries inside ~1.4 s. Before the fix each one refunded the
      // cooldown, so every entry could land a hit.
      for (let i = 0; i < 8; i++) {
        level.setPlayerPos(home2);
        await sleep(90);
        const mid = level.getPlayerHp();
        if (mid < hp) hits++;
        hp = mid;
        level.setPlayerPos(awayPos);
        await sleep(90);
        const out = level.getPlayerHp();
        if (out < hp) hits++;
        hp = out;
      }
      const elapsed = performance.now() - started;
      level.clearMobs();
      return { skipped: false as const, hits, elapsed, cadenceMs: 800 };
    });

    if (result.skipped) {
      test.skip(true, 'maze geometry offered no cardinal seat plus a step-away tile');
      return;
    }

    // Whatever the geometry did, the bound holds: a mob cannot hit more often
    // than its cadence allows over the window, plus one for the opening hit.
    const allowed = Math.ceil(result.elapsed / result.cadenceMs) + 1;
    expect(result.hits).toBeLessThanOrEqual(allowed);
  });
});
