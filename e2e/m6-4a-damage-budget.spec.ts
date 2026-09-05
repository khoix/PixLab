import { test, expect } from '@playwright/test';

/**
 * M6.4a. "Challenged but not overwhelmed" is a claim about rate, so the per-hit
 * cap is a rate converted per mob: one attacker may take `DPS_BUDGET` of the
 * bar per second of exposure, and a hit landing every `cadenceMs` gets that
 * share of it.
 *
 * Deriving lethality from cadence preserves archetype identity by construction
 * — the rarer a mob swings, the bigger its single hit is allowed to be — so no
 * later tuning pass can flatten the sniper into the swarm.
 */

const MOB_CADENCE: Record<string, number> = {
  swarm: 300,
  drone: 500,
  phase: 600,
  guardian: 800,
  charger: 900,
  moth: 1250,
  turret: 1500,
  tracker: 1600,
  sniper: 2000,
};

test.describe('M6.4a — per-hit cap', () => {
  test('lethality rises with cadence, and the sniper tops the field', async ({ page }) => {
    await page.goto('/');
    // At sector 1. M6.4b made the budget level-dependent — the ceiling divided
    // by the slot cap — so a cadence alone no longer names a fraction.
    const caps = await page.evaluate((cadences) => {
      const api = window.__PIXLAB_DAMAGE_BUDGET__!;
      const out: Record<string, number> = {};
      for (const [name, ms] of Object.entries(cadences)) {
        out[name] = api.perHitCapFraction(ms, false, 1);
      }
      return { out, constants: api.constants, budget: api.dpsBudgetForLevel(1) };
    }, MOB_CADENCE);

    // Strictly increasing in cadence, up to the ceiling.
    const order = ['swarm', 'drone', 'phase', 'guardian', 'charger', 'moth', 'turret'];
    for (let i = 1; i < order.length; i++) {
      expect(caps.out[order[i]]).toBeGreaterThan(caps.out[order[i - 1]]);
    }

    // The sniper is the most lethal single blow in the game, by a wide margin.
    const others = Object.entries(caps.out).filter(([n]) => n !== 'sniper').map(([, v]) => v);
    expect(caps.out.sniper).toBeGreaterThan(Math.max(...others));
    expect(caps.out.sniper).toBeCloseTo(0.35, 5); // at the ceiling
    // Derived, not hardcoded: budget × cadence.
    expect(caps.out.swarm).toBeCloseTo(caps.budget * 0.3, 5);
    // A sniper hit is worth more than five swarm hits.
    expect(caps.out.sniper / caps.out.swarm).toBeGreaterThan(5);
  });

  test('the floor and ceiling bound the fraction, and the boss share is flat', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_DAMAGE_BUDGET__!;
      return {
        constants: api.constants,
        instant: api.perHitCapFraction(0, false, 1),
        veryFast: api.perHitCapFraction(50, false, 1),
        verySlow: api.perHitCapFraction(60_000, false, 1),
        boss: api.perHitCapFraction(1000, true, 1),
        bossVerySlow: api.perHitCapFraction(60_000, true, 1),
        // In HP, against a starting 100 HP bar.
        sniperHp: api.perHitCap({ maxHp: 100, cadenceMs: 2000, level: 1 }),
        bossHp: api.perHitCap({ maxHp: 100, cadenceMs: 1000, isBoss: true, level: 1 }),
        tinyBar: api.perHitCap({ maxHp: 3, cadenceMs: 300, level: 1 }),
      };
    });

    expect(result.instant).toBe(result.constants.minHitFraction);
    expect(result.veryFast).toBe(result.constants.minHitFraction);
    expect(result.verySlow).toBe(result.constants.maxHitFraction);
    // A boss ignores cadence: the guarantee is three connects, not a rate.
    expect(result.boss).toBe(result.constants.bossHitFraction);
    expect(result.bossVerySlow).toBe(result.constants.bossHitFraction);

    expect(result.sniperHp).toBe(35);
    expect(result.bossHp).toBe(40);
    // Never rounds down to zero damage.
    expect(result.tinyBar).toBe(1);
  });

  test('no boss can kill a full-HP player in fewer than three hits', async ({ page }) => {
    await page.goto('/');
    const hits = await page.evaluate(() => {
      const damage = window.__PIXLAB_DAMAGE__!;
      // Boss damage at sectors 8 / 16 / 24 / 32 against a 100 HP bar and no
      // armour — the worst case the player can present.
      const survive = (bossDamage: number) => {
        let hp = 100;
        let n = 0;
        while (hp > 0 && n < 50) {
          hp -= damage.computeIncomingDamage({
            baseDamage: bossDamage,
            defense: 0,
            hpRatio: Math.max(0, hp) / 100,
            maxHp: 100,
            cadenceMs: 1000,
            isBoss: true,
            level: 8,
          });
          n++;
        }
        return n;
      };
      return { s8: survive(98), s16: survive(156), s24: survive(204), s32: survive(252) };
    });

    // Uncapped, sector 32's 252 was a one-shot on a fresh 100 HP bar.
    expect(hits.s8).toBeGreaterThanOrEqual(3);
    expect(hits.s16).toBeGreaterThanOrEqual(3);
    expect(hits.s24).toBeGreaterThanOrEqual(3);
    expect(hits.s32).toBeGreaterThanOrEqual(3);
  });

  test('the cap only ever reduces a hit, and low-sector mobs are untouched', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const damage = window.__PIXLAB_DAMAGE__!;
      const budget = window.__PIXLAB_DAMAGE_BUDGET__!;
      const at = (baseDamage: number, cadenceMs: number, level: number) =>
        damage.computeIncomingDamage({
          baseDamage,
          defense: 0,
          hpRatio: 1,
          maxHp: 100,
          cadenceMs,
          level,
        });
      return {
        // Sector 1 drone: 5 damage, well under its cap.
        earlyDrone: at(5, 500, 1),
        // Sector 20's budget is 12.5%/s, so a 500 ms drone caps at 6.25% of a
        // 100 HP bar. It hits for 57 raw.
        lateDrone: at(57, 500, 20),
        // The sniper at the same sector. Its 2 s cadence earns 25% of the bar
        // there; the 35% ceiling only binds in early sectors, where fewer
        // attackers are allowed at once and each one's budget is larger.
        lateSniper: at(156, 2000, 20),
        earlySniper: at(60, 2000, 1),
        lateSwarm: at(39, 300, 20),
        // The same drone earlier, where the per-mob budget is more generous.
        midDrone: at(30, 500, 8),
        // Cap ratios, which is where the archetype claim actually lives: the
        // damage figures above mix capped and uncapped hits, since a sector-1
        // drone's 5 damage is under its cap and untouched.
        capRatioEarly:
          budget.perHitCapFraction(2000, false, 1) / budget.perHitCapFraction(500, false, 1),
        capRatioLate:
          budget.perHitCapFraction(2000, false, 20) / budget.perHitCapFraction(500, false, 20),
      };
    });

    expect(result.earlyDrone).toBe(5); // untouched
    expect(result.lateDrone).toBe(6);
    expect(result.lateSniper).toBe(25);
    expect(result.lateSwarm).toBe(3);
    // The ceiling binds early, where each attacker's budget is largest.
    expect(result.earlySniper).toBe(35);
    // A later sector gives each attacker a smaller share, because more of them
    // are allowed to be swinging at once.
    expect(result.midDrone).toBeGreaterThan(result.lateDrone);
    expect(result.lateSniper).toBeGreaterThan(result.lateDrone);
    expect(result.lateDrone).toBeGreaterThan(result.lateSwarm);
    // The sniper's *relative* lethality does not slip as the budget shrinks —
    // 4x a drone's cap at sector 20 against 3.5x at sector 1. Making the budget
    // level-dependent must not quietly flatten the archetype the cadence-derived
    // cap exists to preserve.
    expect(result.capRatioEarly).toBeCloseTo(3.5, 5);
    expect(result.capRatioLate).toBeCloseTo(4, 5);
    expect(result.capRatioLate).toBeGreaterThanOrEqual(result.capRatioEarly);
  });

  test('sustained throughput is bounded and favours slow attackers', async ({ page }) => {
    await page.goto('/');
    const dps = await page.evaluate((cadences) => {
      const api = window.__PIXLAB_DAMAGE_BUDGET__!;
      const out: Record<string, number> = {};
      for (const [name, ms] of Object.entries(cadences)) {
        out[name] = api.sustainedFractionPerSecond(ms, false, 1);
      }
      // The real sector-1 budget, not the pre-M6.4b flat constant.
      return { out, budget: api.dpsBudgetForLevel(1) };
    }, MOB_CADENCE);

    // Inside the derived band every mob sustains exactly the budget — that is
    // the design: one attacker is one attacker's worth of pressure, whatever
    // its rhythm. What differs is how that pressure arrives, in few large hits
    // or many small ones. Several attackers at once is M6.4b's problem, not
    // this cap's.
    for (const name of ['swarm', 'drone', 'phase', 'guardian', 'charger', 'moth', 'turret']) {
      expect(dps.out[name]).toBeCloseTo(dps.budget, 6);
    }

    // Past the 35% ceiling, a slower cadence buys burst rather than throughput.
    expect(dps.out.sniper).toBeLessThan(dps.budget);

    // Nothing exceeds the budget, at any cadence.
    for (const v of Object.values(dps.out)) expect(v).toBeLessThanOrEqual(dps.budget + 1e-9);
  });
});

test.describe('M6.4a — scaling curve', () => {
  test('no multiplier pins at its ceiling across a full run', async ({ page }) => {
    await page.goto('/');
    const run = await page.evaluate(() => {
      const api = window.__PIXLAB_MOB_BALANCE__!;
      const sectors = [1, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48];
      return {
        normal: sectors.map((l) => ({ l, ...api.scalingAt(l, 'normal', 'drone') })),
        boss: sectors.map((l) => ({ l, ...api.scalingAt(l, 'boss', 'boss') })),
      };
    });

    // Both multipliers grow at every step. Before M6.4a they pinned at 3.0 from
    // sector 11 and were flat for the rest of the run.
    for (let i = 1; i < run.normal.length; i++) {
      expect(run.normal[i].hpMultiplier).toBeGreaterThan(run.normal[i - 1].hpMultiplier);
      expect(run.normal[i].dmgMultiplier).toBeGreaterThan(run.normal[i - 1].dmgMultiplier);
    }
    // And nothing is sitting on a ceiling at the end of a run.
    const last = run.normal[run.normal.length - 1];
    expect(last.hpMultiplier).toBeLessThan(14);
    expect(last.dmgMultiplier).toBeLessThan(4);

    // Bosses are the deliberate exception: they keep a tight HP ceiling of 3.5
    // until M6.5 reworks their encounters, so they stay near where they are
    // today rather than doubling before their mechanics are readable. Their
    // damage pins too, which the flat 40%-of-bar per-hit cap makes moot.
    const boss24 = run.boss.find((r) => r.l === 24)!;
    const boss48 = run.boss.find((r) => r.l === 48)!;
    expect(boss24.hpMultiplier).toBeCloseTo(3.5, 5);
    expect(boss48.hpMultiplier).toBeCloseTo(3.5, 5);
    // Still rising where players actually meet the first cycle of bosses.
    const boss8 = run.boss.find((r) => r.l === 8)!;
    const boss16 = run.boss.find((r) => r.l === 16)!;
    expect(boss16.hpMultiplier).toBeGreaterThan(boss8.hpMultiplier);
  });

  test('sector 20 lands where it does today, and keeps growing after', async ({ page }) => {
    await page.goto('/');
    const hp = await page.evaluate(() => {
      const api = window.__PIXLAB_MOB_BALANCE__!;
      return {
        drone20: api.effectiveHp('drone', 20),
        drone32: api.effectiveHp('drone', 32),
        drone48: api.effectiveHp('drone', 48),
        mult20: api.scalingAt(20).hpMultiplier,
      };
    });

    // Today's pinned 3.0 put a sector-20 drone at 360 HP. Hold that.
    expect(hp.drone20).toBeGreaterThan(300);
    expect(hp.drone20).toBeLessThan(420);
    expect(hp.mult20).toBeGreaterThan(2.6);
    expect(hp.mult20).toBeLessThan(3.4);
    // Growth continues instead of flatlining.
    expect(hp.drone32).toBeGreaterThan(hp.drone20 * 1.5);
    expect(hp.drone48).toBeGreaterThan(hp.drone32 * 1.5);
  });

  test('archetypes stay separated late, and the sniper still hits hardest', async ({ page }) => {
    await page.goto('/');
    const dmg = await page.evaluate(() => {
      const api = window.__PIXLAB_MOB_BALANCE__!;
      // A bar that has grown with the run, so the cap is not flattening things.
      const at = (l: number, maxHp: number) =>
        Object.fromEntries(
          ['swarm', 'drone', 'phase', 'guardian', 'charger', 'moth', 'turret', 'tracker', 'sniper']
            .filter((s) => api.getAvailableSubtypes(l).includes(s))
            .map((s) => [s, api.effectiveHitDamage(s, l, maxHp)]),
        );
      return { s20: at(20, 300), s32: at(32, 460), s48: at(48, 640) };
    });

    for (const [sector, row] of Object.entries(dmg)) {
      const values = Object.values(row) as number[];
      // The archetype constants used to stop separating anything past sector 12,
      // because they were applied before a clamp everything hit. A flat field
      // would mean that regression is back.
      expect(new Set(values).size, `${sector} should not be flat`).toBeGreaterThan(4);
      expect((row as Record<string, number>).sniper).toBe(Math.max(...values));
    }
  });

  test('a stronger build and a weaker one face different mobs late', async ({ page }) => {
    await page.goto('/');
    const spread = await page.evaluate(() => {
      const s = window.__PIXLAB_SCALING__!;
      const at = (level: number, ratio: number) => s.multipliersAtRatio(level, ratio);
      return {
        s20: { weak: at(20, 0.8), strong: at(20, 1.25) },
        s32: { weak: at(32, 0.8), strong: at(32, 1.25) },
      };
    });

    // Adaptive scaling was inert past sector 11: both builds got identical mobs.
    for (const [sector, pair] of Object.entries(spread)) {
      expect(pair.strong.hpMultiplier, `${sector} hp should differ`).toBeGreaterThan(
        pair.weak.hpMultiplier * 1.05,
      );
      expect(pair.strong.dmgMultiplier, `${sector} dmg should differ`).toBeGreaterThan(
        pair.weak.dmgMultiplier,
      );
    }
  });
});
