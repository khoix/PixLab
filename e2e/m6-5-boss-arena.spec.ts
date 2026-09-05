import { test, expect } from '@playwright/test';
import { openLobby } from './helpers';

/**
 * M6.5. Boss sectors had no arena generation at all — `generateLevel` ran the
 * same recursive-backtracker maze for them and only skipped placing the exit.
 *
 * A maze is a one-way advantage for Hades, who phases through it while the
 * player obeys it, and it cancels Ares' charge, which is why the boss with the
 * highest raw numbers is the easiest fight in the game.
 *
 * The invariants below are what make an arena an arena: connected, no dead ends
 * to be cornered in, no gap narrower than two tiles, and every pillar walkable
 * all the way around — "at least two escape routes", stated structurally.
 */

const BOSSES = ['boss_zeus', 'boss_hades', 'boss_ares'] as const;
const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234, 20260905, 777777];

test.describe('M6.5 — boss arena in a live sector', () => {
  test('sector 8 loads as a playable arena with the boss reachable', async ({ page }) => {
    test.setTimeout(90_000);
    await openLobby(page);
    await page.evaluate(() => window.__PIXLAB_TEST__?.setCurrentLevel(8));
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(600);

    const state = await page.evaluate(() => {
      const level = window.__PIXLAB_LEVEL__!;
      const arena = window.__PIXLAB_ARENA__!;
      const entities = level.getEntities();
      const player = level.getPlayerPos();
      // Rebuild the tile grid from the debug hooks to flood-fill it.
      const tiles: string[][] = [];
      for (let y = 0; y < 31; y++) {
        const row: string[] = [];
        for (let x = 0; x < 31; x++) row.push(level.isWall(x, y) ? 'wall' : 'floor');
        tiles.push(row);
      }
      const reachable = arena.reachableFloor(tiles as never, {
        x: Math.round(player.x),
        y: Math.round(player.y),
      });
      const boss = entities.find((e) => e.type === 'boss_enemy');
      return {
        entityCount: entities.length,
        bossSubtype: boss?.mobSubtype ?? null,
        bossReachable: boss
          ? reachable.has(`${Math.round(boss.pos.x)},${Math.round(boss.pos.y)}`)
          : false,
        playerOnFloor: !level.isWall(Math.round(player.x), Math.round(player.y)),
        deadEnds: arena.findDeadEnds(tiles as never).length,
      };
    });

    expect(state.playerOnFloor).toBe(true);
    expect(state.bossSubtype).toBe('boss_zeus');
    // The player can actually walk to the fight.
    expect(state.bossReachable).toBe(true);
    // Zeus arrives alone on the first cycle.
    expect(state.entityCount).toBe(1);
    expect(state.deadEnds).toBe(0);
  });
});

test.describe('M6.5 — boss arena generation', () => {
  test('every arena is connected, with no dead ends and no narrow gaps', async ({ page }) => {
    await page.goto('/');
    const results = await page.evaluate(
      ({ bosses, seeds }) => {
        const api = window.__PIXLAB_ARENA__!;
        const out: Array<Record<string, unknown>> = [];
        for (const boss of bosses) {
          for (const seed of seeds) {
            const arena = api.generateBossArena(31, 31, boss as never, api.mulberry32(seed));
            const floorCount = api.countFloor(arena.tiles);
            const reachable = api.reachableFloor(arena.tiles, arena.startPos);
            const gaps = arena.pillars.every((a, i) =>
              arena.pillars.every((b, j) => i === j || api.isWellSeparated(a, b)),
            );
            out.push({
              boss,
              seed,
              floorRatio: arena.floorRatio,
              connected: reachable.size === floorCount,
              bossReachable: reachable.has(`${arena.bossPos.x},${arena.bossPos.y}`),
              deadEnds: api.findDeadEnds(arena.tiles).length,
              pillars: arena.pillars.length,
              allSeparated: gaps,
              allCircumnavigable: arena.pillars.every((p) => api.isCircumnavigable(arena.tiles, p)),
            });
          }
        }
        return out;
      },
      { bosses: BOSSES, seeds: SEEDS },
    );

    expect(results.length).toBe(BOSSES.length * SEEDS.length);
    for (const r of results) {
      const where = `${r.boss} seed ${r.seed}`;
      // Every floor tile reachable from the player's entry, boss included.
      expect(r.connected, `${where} connected`).toBe(true);
      expect(r.bossReachable, `${where} boss reachable`).toBe(true);
      // Nowhere to be cornered.
      expect(r.deadEnds, `${where} dead ends`).toBe(0);
      // No one-tile chokes: pillars are two tiles clear of each other.
      expect(r.allSeparated, `${where} separation`).toBe(true);
      // At least two ways around everything.
      expect(r.allCircumnavigable, `${where} circumnavigable`).toBe(true);
      // It is an arena, not a room: there is real cover in it.
      expect(r.pillars as number, `${where} has cover`).toBeGreaterThan(2);
    }
  });

  test('floor share lands in the open band the plan calls for', async ({ page }) => {
    await page.goto('/');
    const ratios = await page.evaluate(
      ({ bosses, seeds }) => {
        const api = window.__PIXLAB_ARENA__!;
        const out: Record<string, number[]> = {};
        for (const boss of bosses) {
          out[boss] = seeds.map(
            (s) => api.generateBossArena(31, 31, boss as never, api.mulberry32(s)).floorRatio,
          );
        }
        return out;
      },
      { bosses: BOSSES, seeds: SEEDS },
    );

    for (const [boss, values] of Object.entries(ratios)) {
      for (const v of values) {
        // "Roughly 70–80% traversable floor" — open enough to move, closed
        // enough to break a line of sight.
        expect(v, `${boss} floor ratio ${v}`).toBeGreaterThanOrEqual(0.68);
        expect(v, `${boss} floor ratio ${v}`).toBeLessThanOrEqual(0.86);
      }
    }
  });

  test('each boss gets the cover its mechanic needs', async ({ page }) => {
    await page.goto('/');
    const shapes = await page.evaluate(() => {
      const api = window.__PIXLAB_ARENA__!;
      const avg = (boss: string) => {
        const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
        const arenas = seeds.map((s) =>
          api.generateBossArena(31, 31, boss as never, api.mulberry32(s)),
        );
        const pillars = arenas.flatMap((a) => a.pillars);
        return {
          count: pillars.length / arenas.length,
          area: pillars.reduce((n, p) => n + p.w * p.h, 0) / pillars.length,
        };
      };
      return { hades: avg('boss_hades'), ares: avg('boss_ares'), zeus: avg('boss_zeus'), shapes: api.shapes };
    });

    // Hades: many small islands to break line of sight behind, nothing long
    // enough to run as a corridor.
    // Ares: fewer, larger blocks with lanes between them, so a charge has room
    // to resolve and something to be baited into.
    expect(shapes.ares.area).toBeGreaterThan(shapes.hades.area);
    expect(shapes.hades.count).toBeGreaterThan(shapes.ares.count);
    // And Ares' arena is the most open of the three, because his fight is
    // about lanes.
    expect(shapes.shapes.boss_ares.targetFloorRatio).toBeGreaterThan(
      shapes.shapes.boss_zeus.targetFloorRatio,
    );
  });

  test('a boss sector is generated as an arena, not a maze', async ({ page }) => {
    await page.goto('/');
    const level = await page.evaluate(() => {
      const engine = window.__PIXLAB_ENGINE__!;
      const boss = engine.generateLevel(8, 31, 31);
      const arena = window.__PIXLAB_ARENA__!;
      const floor = arena.countFloor(boss.tiles);
      const reachable = arena.reachableFloor(boss.tiles, boss.startPos);
      const normal = engine.generateLevel(7, 31, 31);
      return {
        isBoss: boss.isBoss,
        bossFloorRatio: floor / (31 * 31),
        bossConnected: reachable.size === floor,
        bossDeadEnds: arena.findDeadEnds(boss.tiles).length,
        bossEntities: boss.entities.length,
        bossSubtype: boss.entities[0]?.mobSubtype ?? null,
        items: boss.items.length,
        repeatCycleEntities: engine.generateLevel(32, 31, 31).entities.length,
        normalFloorRatio: arena.countFloor(normal.tiles) / (31 * 31),
        normalDeadEnds: arena.findDeadEnds(normal.tiles).length,
      };
    });

    expect(level.isBoss).toBe(true);
    // Sector 8 is the first boss: Zeus, and he arrives alone. Every boss used
    // to come with a random 2–4 Cerberus, which made a first encounter's
    // difficulty an RNG roll and buried the boss's own mechanic.
    expect(level.bossSubtype).toBe('boss_zeus');
    expect(level.bossEntities).toBe(1);
    // No boss brings adds at generation time any more, repeat cycles included:
    // they are summoned from the boss's own HP thresholds at runtime, so a
    // fight's difficulty is an escalation the player causes rather than a hand
    // they were dealt. The schedule itself is covered in m6-5-boss-cycle.
    expect(level.repeatCycleEntities).toBe(1);
    expect(level.items).toBe(0);
    expect(level.bossConnected).toBe(true);
    expect(level.bossDeadEnds).toBe(0);
    // The contrast with an ordinary sector is the whole point.
    expect(level.bossFloorRatio).toBeGreaterThan(level.normalFloorRatio * 1.3);
    expect(level.normalDeadEnds).toBeGreaterThan(0);
  });

  test('the boss cycle still runs Zeus, Hades, Ares', async ({ page }) => {
    await page.goto('/');
    const cycle = await page.evaluate(() => {
      const engine = window.__PIXLAB_ENGINE__!;
      return [8, 16, 24, 32, 40, 48].map(
        (l) => engine.generateLevel(l, 31, 31).entities[0]?.mobSubtype ?? null,
      );
    });

    expect(cycle).toEqual([
      'boss_zeus', 'boss_hades', 'boss_ares',
      'boss_zeus', 'boss_hades', 'boss_ares',
    ]);
  });
});
