import { test, expect } from '@playwright/test';

/**
 * M6.6. The audit behind M6.4a lived in a throwaway script, so every number had
 * to be recomputed by hand to check anything. That is how the sector-11 clamp
 * pin and the M6.1 cadence bug both survived as long as they did.
 *
 * The same arithmetic is kept here, judged against three deterministic player
 * builds, so a regression in the difficulty curve is a failing assertion rather
 * than something noticed three milestones later.
 */

const SECTORS = [1, 5, 8, 12, 16, 20, 24, 28, 32, 40, 48];

async function report(page: import('@playwright/test').Page, profile: string, sectors = SECTORS) {
  return page.evaluate(
    ({ profile, sectors }) => {
      const h = window.__PIXLAB_HARNESS__!;
      const p = h.profileByName(profile);
      return sectors.map((l) => h.reportSector(l, p));
    },
    { profile, sectors },
  );
}

test.describe('M6.6 — the curve never pins again', () => {
  test('no multiplier sits at its ceiling across a full run', async ({ page }) => {
    await page.goto('/');
    const rows = await report(page, 'expected');

    for (let i = 1; i < rows.length; i++) {
      // Both multipliers still growing at every step. Before M6.4a they pinned
      // at 3.0 from sector 11 and were flat for the rest of the run.
      expect(rows[i].hpMultiplier, `hp at ${rows[i].sector}`).toBeGreaterThan(rows[i - 1].hpMultiplier);
      expect(rows[i].dmgMultiplier, `dmg at ${rows[i].sector}`).toBeGreaterThan(rows[i - 1].dmgMultiplier);
    }
    const last = rows[rows.length - 1];
    expect(last.hpMultiplier).toBeLessThan(14);
    expect(last.dmgMultiplier).toBeLessThan(4);
  });

  test('HP carries the late game, not per-hit damage', async ({ page }) => {
    await page.goto('/');
    const rows = await report(page, 'expected');
    const first = rows[0];
    const last = rows[rows.length - 1];

    // Endurance grows several times over across a run; per-hit multipliers
    // barely move, so growth in damage comes from each mob's damagePerLevel and
    // stays near the M6.4a per-hit cap rather than far above it.
    expect(last.hpMultiplier / first.hpMultiplier).toBeGreaterThan(6);
    expect(last.dmgMultiplier / first.dmgMultiplier).toBeLessThan(1.5);
  });

  test('the three builds face measurably different mobs, at every tier', async ({ page }) => {
    await page.goto('/');
    const spreads = await page.evaluate(() =>
      [8, 16, 24, 32, 48].map((l) => ({ l, ...window.__PIXLAB_HARNESS__!.profileSpread(l) })),
    );

    for (const s of spreads) {
      // The single assertion that would have caught the 3.0 pin: adaptive
      // scaling has to still be adapting this late in a run.
      expect(s.ahead.hp, `hp spread at ${s.l}`).toBeGreaterThan(s.behind.hp * 1.05);
      expect(s.ahead.dmg, `dmg spread at ${s.l}`).toBeGreaterThan(s.behind.dmg);
      // And bounded: a strong build must not be punished into the same fight as
      // a weak one, nor a weak one handed a trivial one.
      expect(s.ahead.hp / s.behind.hp).toBeLessThan(1.5);
    }
  });
});

test.describe('M6.6 — survival floor', () => {
  test('an expected and an ahead build always get time to react', async ({ page }) => {
    await page.goto('/');
    for (const profile of ['expected', 'ahead']) {
      const rows = await report(page, profile);
      for (const r of rows) {
        expect(
          r.timeToDeathSeconds,
          `${profile} sector ${r.sector}: ${r.timeToDeathSeconds.toFixed(1)}s under ${r.incomingBarFractionPerSec.toFixed(2)} bar/s`,
        ).toBeGreaterThanOrEqual(r.survivalFloorSeconds);
      }
    }
  });

  test('a behind-curve build falls through the floor from sector 16 — M6.4b is what closes it', async ({ page }) => {
    await page.goto('/');
    const rows = await report(page, 'behind');
    const failing = rows.filter((r) => !r.meetsSurvivalFloor).map((r) => r.sector);

    // This is a real, quantified gap, recorded rather than tuned away. Each
    // individual mob is inside its per-hit budget; it is the *concurrency*
    // assumption that breaks the floor — 4 attackers at ~15% of the bar per
    // second is 1.6 s from full HP. The per-hit cap alone cannot fix that,
    // which is precisely what M6.4b's attack-pressure scheduler is for.
    //
    // Pinned to where it starts today, so if a future change makes an
    // under-equipped run fail *earlier*, this fails with it.
    expect(failing[0]).toBe(16);

    // Every mob is individually within budget even where the total is not —
    // evidence that the fix belongs in concurrency, not in per-hit damage.
    for (const r of rows) {
      for (const m of r.mobs) {
        expect(
          m.sustainedBarFractionPerSec,
          `${m.subtype} at sector ${r.sector}`,
        ).toBeLessThanOrEqual(0.185);
      }
    }
  });
});

test.describe('M6.6 — tier boundaries', () => {
  test('no boundary hides an unexplained spike', async ({ page }) => {
    await page.goto('/');
    const boundaries = await page.evaluate(() => {
      const h = window.__PIXLAB_HARNESS__!;
      const p = h.profileByName('expected');
      return h.boundaries.map(([a, b]) => h.reportBoundary(a, b, p));
    });

    // 4→5, 8→9, 12→13, 16→17, 20→21, 24→25, 28→29 — where roster and tier
    // changes land, and so where a spike would hide.
    expect(boundaries.length).toBe(7);
    for (const b of boundaries) {
      const where = `${b.from}→${b.to}`;
      // HP climbs steadily rather than stepping. Early boundaries look larger
      // as ratios only because the absolute numbers are small: 4→5 is a drone
      // going from 46 HP to 60.
      expect(b.hpRatio, `${where} hp ×${b.hpRatio.toFixed(2)}`).toBeLessThanOrEqual(1.35);
      // Exactly one new mob per boundary, and population steps by one entity —
      // a boundary that both introduced a mechanic and jumped the population
      // would be doing two things at once, which is what makes a spike hard to
      // attribute to either.
      expect(b.newMobs.length, `${where} new mobs`).toBeLessThanOrEqual(1);
      expect(b.populationJump, `${where} population`).toBeLessThanOrEqual(2);
    }

    // One boundary is a genuine spike and is recorded rather than tuned away:
    // 12→13 unlocks the Apollo Sniper, whose 2 s cadence earns it the 35%
    // per-hit ceiling, so it immediately becomes one of the worst-case
    // concurrent attackers and the sector's peak pressure jumps ~2.4×.
    //
    // That is by design at the per-hit level — the sniper is meant to be the
    // most lethal single blow in the game — and it is M6.4b's threat-cost table
    // that should stop it also being cheap to field alongside three others.
    // Pinned here so the spike cannot silently grow, and so no *other*
    // boundary can quietly become worse than it.
    const worst = boundaries.reduce((a, b) => (a.pressureRatio > b.pressureRatio ? a : b));
    expect(`${worst.from}→${worst.to}`).toBe('12→13');
    expect(worst.newMobs).toEqual(['sniper']);
    expect(worst.pressureRatio).toBeLessThan(2.6);
    for (const b of boundaries.filter((x) => x.from !== 12)) {
      expect(b.pressureRatio, `${b.from}→${b.to} pressure`).toBeLessThan(2.0);
    }
  });
});

test.describe('M6.6 — bosses scale in controlled increments', () => {
  test('first-cycle bosses at 8 / 16 / 24 stay in a sane time-to-kill band', async ({ page }) => {
    await page.goto('/');
    const rows = await report(page, 'expected', [8, 16, 24]);

    for (const r of rows) {
      expect(r.boss, `sector ${r.sector} has a boss`).not.toBeNull();
      const ttk = r.boss!.playerTtkSeconds;
      // Long enough to be a fight, short enough not to be a slog.
      expect(ttk, `sector ${r.sector} boss TTK ${ttk.toFixed(0)}s`).toBeGreaterThan(5);
      expect(ttk, `sector ${r.sector} boss TTK ${ttk.toFixed(0)}s`).toBeLessThan(40);
    }
  });

  test('repeat bosses at 32 / 40 / 48 are not pure stat inflation', async ({ page }) => {
    await page.goto('/');
    const rows = await report(page, 'expected', [24, 32, 40, 48]);
    const ttks = rows.map((r) => r.boss!.playerTtkSeconds);

    // Boss HP is deliberately held near today's values by maxBossHpScaling
    // until their encounters are proven, so repeats should not balloon: the
    // extra difficulty comes from the threshold-driven adds and the attack
    // cycle, not from a bigger health bar.
    for (let i = 1; i < ttks.length; i++) {
      expect(ttks[i] / ttks[0], `repeat boss TTK drift at ${rows[i].sector}`).toBeLessThan(1.6);
    }
  });

  test('no boss can kill a full-HP player in fewer than three hits, at any sector', async ({ page }) => {
    await page.goto('/');
    const survived = await page.evaluate(() => {
      const h = window.__PIXLAB_HARNESS__!;
      const damage = window.__PIXLAB_DAMAGE__!;
      const out: Array<{ profile: string; sector: number; hits: number }> = [];
      for (const name of h.profiles) {
        const p = h.profileByName(name);
        for (const sector of [8, 16, 24, 32, 40, 48]) {
          const r = h.reportSector(sector, p);
          if (!r.boss) continue;
          // Simulate rather than multiply: the cap is 40% of the bar, so three
          // *flat* hits would exceed it — the guarantee comes from the mercy
          // term softening each hit as HP falls. Multiplying by three asserts
          // something stricter than the design promises.
          const maxHp = p.maxHpAt(sector);
          let hp = maxHp;
          let hits = 0;
          while (hp > 0 && hits < 50) {
            hp -= damage.computeIncomingDamage({
              baseDamage: Number.MAX_SAFE_INTEGER, // the cap is the binding term
              defense: 0,
              hpRatio: Math.max(0, hp) / maxHp,
              maxHp,
              cadenceMs: 1000,
              isBoss: true,
            });
            hits++;
          }
          out.push({ profile: name, sector, hits });
        }
      }
      return out;
    });

    expect(survived.length).toBe(18);
    for (const s of survived) {
      // The M6.4a guarantee, holding for every build at every boss sector even
      // against an arbitrarily hard-hitting boss: the cap is what binds.
      expect(s.hits, `${s.profile} sector ${s.sector} died in ${s.hits} hits`).toBeGreaterThanOrEqual(3);
    }
  });
});
