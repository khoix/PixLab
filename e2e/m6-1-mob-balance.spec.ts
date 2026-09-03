import { test, expect } from '@playwright/test';
import { openLobby, startSectorRun } from './helpers';

test.describe('M6.1 — incoming damage model', () => {
  test('mercy term softens hits at low HP instead of amplifying them', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_DAMAGE__!;
      const at = (hpRatio: number) => api.computeIncomingDamage({ baseDamage: 100, defense: 0, hpRatio });
      return {
        floor: api.mercyFloor,
        full: at(1),
        half: at(0.5),
        nearDeath: at(0.05),
        empty: at(0),
        withDefense: api.computeIncomingDamage({ baseDamage: 100, defense: 40, hpRatio: 1 }),
        overkillDefense: api.computeIncomingDamage({ baseDamage: 5, defense: 500, hpRatio: 1 }),
      };
    });

    // Full HP takes the whole hit; the closer to death, the softer it lands.
    expect(result.full).toBe(100);
    expect(result.half).toBeLessThan(result.full);
    expect(result.nearDeath).toBeLessThan(result.half);
    // The pre-M6.1 formula inverted this: nearDeath used to exceed full.
    expect(result.nearDeath).toBeLessThan(result.full);
    // Never softer than the floor, never below 1.
    expect(result.empty).toBe(Math.floor(100 * result.floor));
    expect(result.overkillDefense).toBe(1);
    // Defense still applies before the mercy term.
    expect(result.withDefense).toBe(60);
  });
});

test.describe('M6.1 — Nyx vision debuff is bounded', () => {
  test('stacks are capped, decay within a sector, and rate-limited per moth', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_VISION_DEBUFF__!;
      const c = api.constants;

      // One moth firing on cooldown cannot exceed the cap.
      const solo = api.create();
      let t = 0;
      for (let i = 0; i < 40; i++) {
        api.apply(solo, 'enemy-1', t);
        t += c.reapplyCooldownMs;
      }
      const soloPeak = solo.level;

      // The same moth landing repeat hits inside its cooldown adds one stack.
      const spam = api.create();
      const landed = [
        api.apply(spam, 'enemy-1', 0),
        api.apply(spam, 'enemy-1', 500),
        api.apply(spam, 'enemy-1', 1000),
      ];

      // Different moths each contribute, so a pack is still worse than one.
      const pack = api.create();
      api.apply(pack, 'enemy-1', 0);
      api.apply(pack, 'enemy-2', 0);
      api.apply(pack, 'enemy-3', 0);

      // Full stack clears well inside a 120s sector.
      const decaying = api.create();
      decaying.level = c.max;
      let secondsToClear = 0;
      while (decaying.level > 0 && secondsToClear < 600) {
        api.decay(decaying, 1000);
        secondsToClear++;
      }

      return {
        max: c.max,
        soloPeak,
        spamLanded: landed,
        spamLevel: spam.level,
        packLevel: pack.level,
        secondsToClear,
      };
    });

    // Never total blindness — the player always keeps some fog radius.
    expect(result.max).toBeLessThanOrEqual(0.6);
    expect(result.soloPeak).toBeCloseTo(result.max, 5);
    expect(result.spamLanded).toEqual([true, false, false]);
    expect(result.spamLevel).toBeCloseTo(0.15, 5);
    expect(result.packLevel).toBeGreaterThan(result.spamLevel);
    // Pre-M6.1 this was 50s from a cap of 1.0 at 2%/s decay, on a 120s timer.
    expect(result.secondsToClear).toBeLessThanOrEqual(10);
  });
});

test.describe('M6.1 — phasing mobs have a wall budget', () => {
  test('a phasing mob must surface after a few wall tiles', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_PHASE__!;
      const max = api.maxWallTiles;

      // Walk into rock tile by tile until the budget stops it.
      let traversed = 0;
      let steps = 0;
      while (api.canEnterTile({ wallTilesTraversed: traversed, targetIsWall: true }) && steps < 50) {
        traversed = api.nextWallTilesTraversed(traversed, true);
        steps++;
      }

      return {
        max,
        steps,
        blockedAt: traversed,
        floorAlwaysAllowed: api.canEnterTile({ wallTilesTraversed: 99, targetIsWall: false }),
        resetsOnSurfacing: api.nextWallTilesTraversed(3, false),
      };
    });

    expect(result.steps).toBe(result.max);
    expect(result.blockedAt).toBe(result.max);
    expect(result.floorAlwaysAllowed).toBe(true);
    expect(result.resetsOnSurfacing).toBe(0);
  });

  test('melee reach is denied into a tile the player cannot see', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_MELEE_LOS__!;
      // 5x5 room split by a wall column at x=2.
      const tiles = [
        ['wall', 'wall', 'wall', 'wall', 'wall'],
        ['wall', 'floor', 'wall', 'floor', 'wall'],
        ['wall', 'floor', 'wall', 'floor', 'wall'],
        ['wall', 'floor', 'wall', 'floor', 'wall'],
        ['wall', 'wall', 'wall', 'wall', 'wall'],
      ];
      const level = { width: 5, height: 5, tiles } as never;
      const player = { x: 1, y: 2 };
      return {
        // A phasing mob embedded in the dividing wall, one tile away.
        insideWall: api.canMeleeReach(player, { x: 2, y: 2 }, level),
        // Same tile as the player — always reachable.
        samePos: api.canMeleeReach(player, { x: 1, y: 2 }, level),
        // Ordinary adjacent floor neighbour.
        adjacentFloor: api.canMeleeReach(player, { x: 1, y: 1 }, level),
        // Across the divider, on floor but with rock in between.
        throughWall: api.canMeleeReach(player, { x: 3, y: 2 }, level),
      };
    });

    // The whole point: a mob inside rock cannot hit a player who cannot hit it.
    expect(result.insideWall).toBe(false);
    expect(result.throughWall).toBe(false);
    // No regression for ordinary melee mobs, which are always on adjacent floor.
    expect(result.adjacentFloor).toBe(true);
    expect(result.samePos).toBe(true);
  });

  test('a phasing mob does not stay embedded in rock', async ({ page }) => {
    await startSectorRun(page);
    await page.waitForTimeout(200);

    const spawned = await page.evaluate(() => {
      const api = window.__PIXLAB_LEVEL__!;
      api.clearMobs();
      const p = api.getPlayerPos();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = Math.round(p.x) + dx;
        const y = Math.round(p.y) + dy;
        if (api.isWall(x, y)) return api.spawnMob('phase', { x, y });
      }
      return null;
    });
    test.skip(spawned === null, 'no wall tile adjacent to the player spawn in this maze');

    // Sample its tile for a few seconds; the budget must force it to surface.
    const samples: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      samples.push(
        await page.evaluate((id) => {
          const api = window.__PIXLAB_LEVEL__!;
          const mob = api.getEntities().find((e) => e.id === id);
          if (!mob) return false;
          return api.isWall(Math.floor(mob.pos.x), Math.floor(mob.pos.y));
        }, spawned),
      );
      await page.waitForTimeout(100);
    }

    const maxWallTiles = await page.evaluate(() => window.__PIXLAB_PHASE__!.maxWallTiles);
    // Longest unbroken run of samples with the mob inside rock. Each move tick
    // is ~312ms and we sample at 100ms, so the budget bounds the run length.
    let longestRun = 0;
    let run = 0;
    for (const inWall of samples) {
      run = inWall ? run + 1 : 0;
      longestRun = Math.max(longestRun, run);
    }
    expect(samples.some((inWall) => !inWall)).toBe(true);
    expect(longestRun).toBeLessThan(samples.length);
    expect(maxWallTiles).toBeGreaterThan(0);
  });
});

test.describe('M6.1 — spawn shares and mob roster', () => {
  test('swarm no longer dominates the entity population', async ({ page }) => {
    await page.goto('/');
    const shares = await page.evaluate(() => ({
      early: window.__PIXLAB_MOB_BALANCE__!.expectedPopulationShare(1),
      mid: window.__PIXLAB_MOB_BALANCE__!.expectedPopulationShare(9),
      late: window.__PIXLAB_MOB_BALANCE__!.expectedPopulationShare(30),
    }));

    // Weights are rolled per selection but a swarm selection spawns a pack, so
    // the pre-M6.1 weight of 25 made swarm 67% of level-1 mobs.
    expect(shares.early.swarm).toBeLessThan(0.5);
    expect(shares.late.swarm).toBeLessThan(0.3);
    // Shares are a distribution.
    for (const band of [shares.early, shares.mid, shares.late]) {
      const total = Object.values(band).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  test('progressive mob introduction is unchanged after moving the gate to minLevel', async ({ page }) => {
    await page.goto('/');
    const roster = await page.evaluate(() => {
      const api = window.__PIXLAB_MOB_BALANCE__!;
      const at: Record<number, string[]> = {};
      for (const lvl of [1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29]) {
        at[lvl] = api.getAvailableSubtypes(lvl).sort();
      }
      return at;
    });

    expect(roster[1]).toEqual(['drone', 'swarm']);
    expect(roster[4]).toEqual(['drone', 'swarm']);
    expect(roster[5]).toEqual(['drone', 'phase', 'swarm']);
    expect(roster[9]).toEqual(['drone', 'moth', 'phase', 'swarm']);
    expect(roster[13]).toEqual(['drone', 'moth', 'phase', 'sniper', 'swarm']);
    expect(roster[17]).toEqual(['charger', 'drone', 'moth', 'phase', 'sniper', 'swarm']);
    expect(roster[21]).toContain('tracker');
    expect(roster[20]).not.toContain('tracker');
    expect(roster[25]).toContain('turret');
    expect(roster[24]).not.toContain('turret');
    expect(roster[29]).toContain('guardian');
    expect(roster[28]).not.toContain('guardian');
    // Cerberus is boss-sector only and never enters the normal roster.
    for (const subtypes of Object.values(roster)) {
      expect(subtypes).not.toContain('cerberus');
    }
  });

  test('the entity cap counts entities, not selections', async ({ page }) => {
    await openLobby(page);
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.setCurrentLevel(30);
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(400);

    const count = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getEntities().length);
    // Pre-M6.1 the cap counted selections, so swarm packs pushed this to ~62.
    expect(count).toBeLessThanOrEqual(50);
    expect(count).toBeGreaterThan(10);
  });
});

test.describe('M6.1 — archetype ordering', () => {
  test('the starter drone no longer out-damages the elites it precedes', async ({ page }) => {
    await page.goto('/');
    const dps = await page.evaluate(() => {
      const api = window.__PIXLAB_MOB_BALANCE__!;
      const at = (lvl: number) =>
        Object.fromEntries(
          ['drone', 'swarm', 'phase', 'moth', 'sniper', 'charger', 'tracker', 'turret', 'guardian'].map(
            (s) => [s, api.relativeDps(s, lvl)],
          ),
        );
      return { l20: at(20), l30: at(30) };
    });

    // Guardian and turret unlock at 29/25; the level-1 drone used to beat both.
    expect(dps.l30.drone).toBeLessThan(dps.l30.guardian);
    expect(dps.l30.drone).toBeLessThan(dps.l30.turret);
    // Charger is meant to be the melee threat, not 40% clear of the field.
    const others = Object.entries(dps.l20)
      .filter(([s]) => s !== 'charger' && s !== 'swarm')
      .map(([, v]) => v);
    expect(dps.l20.charger).toBeLessThan(Math.max(...others) * 1.5);
  });

  test('per-level ramps match the tuning recorded in docs/BALANCE_ANALYSIS.md', async ({ page }) => {
    await page.goto('/');
    const ramps = await page.evaluate(() => {
      const api = window.__PIXLAB_MOB_BALANCE__!;
      return {
        mothSpeed20: api.scaledMoveSpeed('moth', 20),
        mothCooldownFloor: api.scaledAttackCooldown('moth', 100),
        trackerSpeed20: api.scaledMoveSpeed('tracker', 20),
        trackerCooldownFloor: api.scaledAttackCooldown('tracker', 100),
        cerberusCooldownFloor: api.scaledAttackCooldown('cerberus', 100),
        // Mobs without a declared ramp stay flat.
        droneSpeed30: api.scaledMoveSpeed('drone', 30),
        droneCooldown30: api.scaledAttackCooldown('drone', 30),
      };
    });

    expect(ramps.mothSpeed20).toBeCloseTo(1.65, 5);
    expect(ramps.mothCooldownFloor).toBe(950);
    expect(ramps.trackerSpeed20).toBeCloseTo(1.95, 5);
    expect(ramps.trackerCooldownFloor).toBe(1100);
    expect(ramps.cerberusCooldownFloor).toBe(1500);
    expect(ramps.droneSpeed30).toBe(1.0);
    expect(ramps.droneCooldown30).toBe(500);
  });
});
