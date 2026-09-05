import { test, expect } from '@playwright/test';
import { openLobby } from './helpers';

/**
 * M6.4b. M6.4a capped what a single hit can take; the M6.6 harness then
 * measured what that leaves open — every mob individually inside its budget,
 * and a behind-curve player still dead in 1.6 s at sector 20, because four of
 * them were on the bar at once. Per-hit fairness does not compose.
 *
 * Two budgets close it. An encounter budget prices what a sector may field, so
 * an elite costs what it is worth instead of being added on top of the previous
 * population. An attack-slot budget bounds how many of them may be swinging,
 * and the per-mob damage budget is derived from that cap — so adding a slot
 * lowers what each attacker may do rather than stacking damage on one bar.
 */

test.describe('M6.4b — one budget, not two', () => {
  test('the per-mob budget is the ceiling divided by the slots', async ({ page }) => {
    await page.goto('/');
    const rows = await page.evaluate(() =>
      [1, 8, 9, 16, 17, 24, 25, 48].map((l) => {
        const p = window.__PIXLAB_PRESSURE__!;
        return {
          level: l,
          cap: p.slotCapForLevel(l),
          ceiling: p.incomingCeilingForLevel(l),
          perMob: p.perMobDpsBudget(l),
          ttd: p.timeToDeathAtCeiling(l),
        };
      }),
    );

    for (const r of rows) {
      // The invariant: a full house is exactly the ceiling, never more.
      expect(r.cap * r.perMob, `sector ${r.level}`).toBeCloseTo(r.ceiling, 10);
      // And a full house still leaves time to react.
      expect(r.ttd, `sector ${r.level} ttd`).toBeGreaterThanOrEqual(1.8);
    }

    // Slots rise across the run and the per-mob budget falls to pay for them —
    // the late game is crowded without being deadlier per attacker.
    expect(rows[0].cap).toBe(2);
    expect(rows[rows.length - 1].cap).toBe(5);
    expect(rows[rows.length - 1].perMob).toBeLessThan(rows[0].perMob);
  });

  test('a slot is held for a whole cycle, and a sniper costs two', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(() => {
      const p = window.__PIXLAB_PRESSURE__!;
      const s = p.createPressureState();
      const cap = 3;
      return {
        droneCost: p.slotCostFor('drone'),
        sniperCost: p.slotCostFor('sniper'),
        bossCost: p.slotCostFor('drone', true),
        // Two drones and a sniper do not fit in three slots.
        first: p.tryClaimSlot(s, 'a', 1, cap, 0, 500),
        second: p.tryClaimSlot(s, 'b', 1, cap, 0, 500),
        sniper: p.tryClaimSlot(s, 'sniper', 2, cap, 0, 2000),
        used: p.usedSlots(s),
        // A mob already holding one renews rather than queuing again — losing
        // its turn mid-cycle would mean nothing ever finishes an attack.
        renew: p.tryClaimSlot(s, 'a', 1, cap, 100, 500),
        usedAfterRenew: p.usedSlots(s),
        // The hold lapses on its own, so a mob that died or fled frees it.
        heldAt400: (p.expireHolds(s, 400), p.usedSlots(s)),
        heldAt700: (p.expireHolds(s, 700), p.usedSlots(s)),
      };
    });

    expect(r.droneCost).toBe(1);
    expect(r.sniperCost).toBe(2);
    expect(r.bossCost).toBe(2);
    expect(r.first).toBe(true);
    expect(r.second).toBe(true);
    // Two slots used, sniper needs two, cap is three — refused.
    expect(r.sniper).toBe(false);
    expect(r.used).toBe(2);
    expect(r.renew).toBe(true);
    expect(r.usedAfterRenew).toBe(2);
    expect(r.heldAt400).toBe(2);
    // 'b' lapsed at 500, 'a' was renewed to 600 — both gone by 700.
    expect(r.heldAt700).toBe(0);
  });
});

test.describe('M6.4b — the encounter budget prices elites', () => {
  test('an elite costs more than a drone, and a swarm pack is priced as a pack', async ({ page }) => {
    await page.goto('/');
    const c = await page.evaluate(() => {
      const e = window.__PIXLAB_ENCOUNTER__!;
      return {
        swarmEntity: e.threatCost('swarm'),
        swarmSelection: e.selectionCost('swarm'),
        drone: e.selectionCost('drone'),
        sniper: e.selectionCost('sniper'),
        guardian: e.selectionCost('guardian'),
        budgets: [1, 8, 20, 48].map((l) => e.threatBudget(l)),
        cap: e.entityCap,
      };
    });

    // One swarm member is cheap; a whole pack is not.
    expect(c.swarmEntity).toBeLessThan(c.drone);
    expect(c.swarmSelection).toBeGreaterThan(c.drone);
    // Elites cost what they are worth, which is what stops them being added on
    // top of the previous population at the same price.
    expect(c.sniper).toBeGreaterThan(c.drone);
    expect(c.guardian).toBeGreaterThan(c.sniper);
    // The budget grows steadily rather than in steps.
    for (let i = 1; i < c.budgets.length; i++) {
      expect(c.budgets[i]).toBeGreaterThan(c.budgets[i - 1]);
    }
    expect(c.cap).toBe(50);
  });

  test('rosters fill the budget without overrunning it', async ({ page }) => {
    await page.goto('/');
    const plans = await page.evaluate(() => {
      const e = window.__PIXLAB_ENCOUNTER__!;
      const mobs = [
        { subtype: 'drone', spawnWeight: 30 },
        { subtype: 'swarm', spawnWeight: 10 },
        { subtype: 'sniper', spawnWeight: 15 },
        { subtype: 'guardian', spawnWeight: 5 },
      ];
      let seed = 1;
      const rng = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      return [1, 10, 25, 48].map((l) => e.planRoster(l, mobs, rng));
    });

    for (const p of plans) {
      // Never over budget — an expensive mob must not appear at a discount.
      expect(p.totalCost).toBeLessThanOrEqual(p.budget);
      // And the entity cap is a hard performance limit regardless.
      expect(p.totalEntities).toBeLessThanOrEqual(50);
      expect(p.selections.length).toBeGreaterThan(0);
    }
    // More budget later means a fuller sector.
    expect(plans[plans.length - 1].totalEntities).toBeGreaterThan(plans[0].totalEntities);
  });
});

test.describe('M6.4b — the M6.6 findings are closed', () => {
  test('every build now clears the survival floor at every sector', async ({ page }) => {
    await page.goto('/');
    const failures = await page.evaluate(() => {
      const h = window.__PIXLAB_HARNESS__!;
      const out: string[] = [];
      for (const name of h.profiles) {
        const p = h.profileByName(name);
        for (const l of [1, 5, 8, 12, 13, 16, 20, 24, 28, 32, 40, 48]) {
          const r = h.reportSector(l, p);
          if (!r.meetsSurvivalFloor) {
            out.push(`${name} @${l}: ${r.timeToDeathSeconds.toFixed(1)}s < ${r.survivalFloorSeconds.toFixed(1)}s`);
          }
        }
      }
      return out;
    });

    // A behind-curve build used to fail from sector 16 — 2.4 s at 16, 1.6 s at
    // 20, 1.1 s from 28. Every individual mob was inside its per-hit budget;
    // the concurrency was what broke it.
    expect(failures).toEqual([]);
  });

  test('the sniper boundary no longer spikes hardest by as much', async ({ page }) => {
    await page.goto('/');
    const b = await page.evaluate(() => {
      const h = window.__PIXLAB_HARNESS__!;
      const p = h.profileByName('expected');
      return h.boundaries.map(([a, c]) => ({
        where: `${a}→${c}`,
        pressure: h.reportBoundary(a, c, p).pressureRatio,
      }));
    });

    const worst = b.reduce((x, y) => (x.pressure > y.pressure ? x : y));
    // Still the worst boundary — the sniper is meant to be the biggest single
    // blow in the game, so its arrival is meant to be felt. But costing two
    // slots means it displaces another attacker rather than arriving on top of
    // one, and the jump came down from 2.41× to about 2.07×.
    expect(worst.where).toBe('12→13');
    expect(worst.pressure).toBeLessThan(2.2);
    for (const x of b) {
      expect(x.pressure, `${x.where}`).toBeLessThan(2.2);
    }
  });
});

test.describe('M6.4b — enforced in a live sector', () => {
  test('occupied slots never exceed the sector cap', async ({ page }) => {
    test.setTimeout(120_000);
    await openLobby(page);
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.setCurrentLevel(22);
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(600);

    const observed = await page.evaluate(async () => {
      const level = window.__PIXLAB_LEVEL__!;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let worstUsed = 0;
      let cap = 0;
      let entities = 0;
      for (let i = 0; i < 100; i++) {
        const s = level.getPressureStats();
        worstUsed = Math.max(worstUsed, s.used, s.peakUsed);
        cap = s.cap;
        entities = Math.max(entities, level.getEntities().length);
        await sleep(50);
      }
      return { worstUsed, cap, entities };
    });

    // Sector 22 allows four simultaneous attackers. (20 is a shop sector.)
    expect(observed.cap).toBe(4);
    // However many mobs are in the sector, only that many may be swinging —
    // the late game may look crowded without every visible enemy attacking.
    expect(observed.worstUsed).toBeLessThanOrEqual(observed.cap);
    expect(observed.entities).toBeGreaterThan(observed.cap);
  });
});
