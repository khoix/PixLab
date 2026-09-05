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
    const caps = await page.evaluate((cadences) => {
      const api = window.__PIXLAB_DAMAGE_BUDGET__!;
      const out: Record<string, number> = {};
      for (const [name, ms] of Object.entries(cadences)) {
        out[name] = api.perHitCapFraction(ms, false);
      }
      return { out, constants: api.constants };
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
    expect(caps.out.swarm).toBeCloseTo(0.054, 5);
    // A sniper hit is worth more than six swarm hits.
    expect(caps.out.sniper / caps.out.swarm).toBeGreaterThan(6);
  });

  test('the floor and ceiling bound the fraction, and the boss share is flat', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_DAMAGE_BUDGET__!;
      return {
        constants: api.constants,
        instant: api.perHitCapFraction(0),
        veryFast: api.perHitCapFraction(50),
        verySlow: api.perHitCapFraction(60_000),
        boss: api.perHitCapFraction(1000, true),
        bossVerySlow: api.perHitCapFraction(60_000, true),
        // In HP, against a starting 100 HP bar.
        sniperHp: api.perHitCap({ maxHp: 100, cadenceMs: 2000 }),
        bossHp: api.perHitCap({ maxHp: 100, cadenceMs: 1000, isBoss: true }),
        tinyBar: api.perHitCap({ maxHp: 3, cadenceMs: 300 }),
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
      const at = (baseDamage: number, cadenceMs: number) =>
        damage.computeIncomingDamage({
          baseDamage,
          defense: 0,
          hpRatio: 1,
          maxHp: 100,
          cadenceMs,
        });
      return {
        // Sector 1 drone: 5 damage, well under its 9% cap.
        earlyDrone: at(5, 500),
        // Sector 20 drone: 57 raw, capped to 9 on a 100 HP bar.
        lateDrone: at(57, 500),
        // Sector 20 sniper: 156 raw, capped to 35.
        lateSniper: at(156, 2000),
        // Sector 20 swarm: 39 raw, capped to 5.
        lateSwarm: at(39, 300),
      };
    });

    expect(result.earlyDrone).toBe(5); // untouched
    expect(result.lateDrone).toBe(9);
    expect(result.lateSniper).toBe(35);
    expect(result.lateSwarm).toBe(5);
    // Ordering survives the cap: the sniper still hits hardest.
    expect(result.lateSniper).toBeGreaterThan(result.lateDrone);
    expect(result.lateDrone).toBeGreaterThan(result.lateSwarm);
  });

  test('sustained throughput is bounded and favours slow attackers', async ({ page }) => {
    await page.goto('/');
    const dps = await page.evaluate((cadences) => {
      const api = window.__PIXLAB_DAMAGE_BUDGET__!;
      const out: Record<string, number> = {};
      for (const [name, ms] of Object.entries(cadences)) {
        out[name] = api.sustainedFractionPerSecond(ms, false);
      }
      return { out, budget: api.constants.dpsBudget };
    }, MOB_CADENCE);

    // Inside the derived band every mob sustains exactly the budget — that is
    // the design: one attacker is one attacker's worth of pressure, whatever
    // its rhythm. What differs is how that pressure arrives, in few large hits
    // or many small ones. Several attackers at once is M6.4b's problem, not
    // this cap's.
    for (const name of ['swarm', 'drone', 'phase', 'guardian', 'charger', 'moth', 'turret']) {
      expect(dps.out[name]).toBeCloseTo(dps.budget, 6);
    }

    // The band runs from the floor to the ceiling: 278 ms to 1944 ms.
    expect(dps.out.tracker).toBeLessThan(dps.budget); // 1600 ms is inside...
    expect(dps.out.sniper).toBeLessThan(dps.budget); // ...2000 ms is past the ceiling

    // Nothing exceeds the budget, at any cadence.
    for (const v of Object.values(dps.out)) expect(v).toBeLessThanOrEqual(dps.budget + 1e-9);
  });
});
