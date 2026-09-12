/**
 * Scenarios: the fixed situations a characterization run replays.
 *
 * Each one pins the world before any frame is driven — player position, mob
 * roster, level — so the run depends on the seed and nothing else. Without
 * that, procedural generation decides the scenario and the baseline records a
 * maze rather than a behaviour.
 *
 * They are chosen to cover the four things M8.4-M8.6 extract, so a stage that
 * breaks one is caught by the scenario that exercises it:
 * Sector choice is load-bearing and not obvious: `engine.ts:19` makes every
 * 4th sector a shop and every 8th a boss, so entering 12 or 20 lands on the
 * vendor screen with no canvas at all. A first cut used 12 and 20 and the runs
 * simply never started; 8 was picked for "melee" and was quietly characterizing
 * a boss arena. Every scenario below except `boss` now uses a normal sector.
 *
 *   idle      — timers and lifetimes with no combat     (M8.6)
 *   pursuit   — movement and pathing under approach     (M8.4)
 *   melee     — attack cadence, damage, cooldowns       (M8.5)
 *   ranged    — projectile spawn, flight and expiry     (M8.4/M8.6)
 *   crowd     — the attack-pressure scheduler above cap (M8.5/M8.6)
 *   bossRanged — Zeus: ranged telegraph and projectile spawn  (M8.5/M8.6)
 *   bossPhased — Hades: the telegraph/execute/recover machine  (M8.6)
 *
 * Two boss scenarios, because the bosses do not share a mechanism. Only Hades
 * and Ares drive the `BOSS_CYCLES` phase machine; `boss_zeus`
 * (GameCanvas.tsx:2449) is a ranged attacker with its own telegraph and never
 * calls readCycle/writeCycle at all. A first cut used sector 8 and recorded
 * `bossPhase: null` for the whole run — correctly, as it turns out, because
 * Zeus has no phase. Sector choice decides which: `engine.ts:25` indexes
 * ['zeus','hades','ares'] by floor(level/8)-1, so 8 is Zeus, 16 is Hades.
 *
 * Subtypes are spread deliberately rather than all `drone`. Each behaviour is a
 * separate branch of `update()` — `charger` commits to a dash, `phase` walks
 * through rock on a budget, `turret` never moves and only fires, `moth` orbits
 * and debuffs vision. A baseline built from one subtype would leave the others
 * free to change silently, which is the failure this milestone exists to stop.
 */

import type { Page } from '@playwright/test';
import type { MobSubtype } from '../../client/src/lib/game/types';

export interface Scenario {
  name: string;
  seed: number;
  /** Sector to enter; higher sectors change roster and scaling. */
  sector: number;
  /** Frames to drive, and the virtual ms each frame advances. */
  frames: number;
  stepMs: number;
  /** Capture a snapshot every N frames. */
  sampleEvery: number;
  /** Leave the generated roster in place instead of clearing it. */
  keepGeneratedRoster?: boolean;
  /**
   * Move the player next to the largest generated entity before driving.
   *
   * Without this the boss scenario recorded `bossPhase: null` for its whole
   * run: a boss arena is large, the boss spawns across it, and the patrol never
   * closed the distance — so the telegraph/execute/recover cycle that is the
   * entire point of the scenario never fired once.
   */
  approachBoss?: boolean;
  /**
   * Scripted player input, cycled for the length of the run.
   *
   * The first recording left the player standing still, and the baselines were
   * nearly inert: mob hp never changed in any scenario, 11 of 12 mobs in
   * `crowd` never moved, and the boss never entered a single attack phase. A
   * characterization of a game where nothing happens cannot catch a refactor
   * that changes how things happen.
   *
   * Attacks are automatic — `GameCanvas.tsx:1258` fires whenever a mob is in
   * range and the cooldown has elapsed — so movement is the only input needed
   * to drive combat. Walking the player also pulls mobs into aggro and
   * exercises collision, which is M8.4's whole surface.
   */
  input?: Array<{ frames: number; dir: { x: number; y: number } }>;
  /**
   * Mobs to place, given as a desired ring distance from the player in tiles
   * rather than a fixed offset.
   *
   * The first cut used `dx`/`dy` offsets and placed zero mobs: the player
   * spawns at (1,1), so every negative offset landed out of bounds or in rock,
   * and the maze is procedurally generated so no fixed offset is safe. Ring
   * distance survives any layout — "two tiles away" always exists, "two tiles
   * left" does not.
   */
  mobs: Array<{ subtype: MobSubtype; ring: number }>;
}

/**
 * 16ms is the honest step: it is what a 60fps frame delivers and what the
 * cadence constants were tuned against. It also sits well under the loop's
 * 100ms clamp, so the clamp never engages and the harness measures the
 * ordinary path rather than the degraded one.
 */
const STEP_MS = 16;

export const SCENARIOS: Scenario[] = [
  {
    name: 'idle',
    seed: 0x5eed0001,
    sector: 1,
    frames: 300,
    stepMs: STEP_MS,
    sampleEvery: 60,
    mobs: [],
  },
  {
    name: 'pursuit',
    seed: 0x5eed0002,
    input: [
      { frames: 24, dir: { x: 1, y: 0 } },
      { frames: 24, dir: { x: 0, y: 1 } },
      { frames: 24, dir: { x: -1, y: 0 } },
      { frames: 24, dir: { x: 0, y: -1 } },
      { frames: 16, dir: { x: 1, y: 1 } },
      { frames: 16, dir: { x: 0, y: 0 } },
    ],
    sector: 5,
    frames: 420,
    stepMs: STEP_MS,
    sampleEvery: 60,
    mobs: [
      { subtype: 'drone', ring: 6 },
      { subtype: 'charger', ring: 6 },
      // Walks through rock on the M6.7 budget — the one mover whose pathing is
      // not constrained by walls, so it exercises a distinct commit gate.
      { subtype: 'phase', ring: 7 },
    ],
  },
  {
    name: 'melee',
    seed: 0x5eed0003,
    input: [
      { frames: 24, dir: { x: 1, y: 0 } },
      { frames: 24, dir: { x: 0, y: 1 } },
      { frames: 24, dir: { x: -1, y: 0 } },
      { frames: 24, dir: { x: 0, y: -1 } },
      { frames: 16, dir: { x: 1, y: 1 } },
      { frames: 16, dir: { x: 0, y: 0 } },
    ],
    sector: 7,
    frames: 480,
    stepMs: STEP_MS,
    sampleEvery: 60,
    mobs: [
      { subtype: 'drone', ring: 1 },
      { subtype: 'guardian', ring: 1 },
      { subtype: 'tracker', ring: 1 },
    ],
  },
  {
    name: 'ranged',
    seed: 0x5eed0005,
    input: [
      { frames: 24, dir: { x: 1, y: 0 } },
      { frames: 24, dir: { x: 0, y: 1 } },
      { frames: 24, dir: { x: -1, y: 0 } },
      { frames: 24, dir: { x: 0, y: -1 } },
      { frames: 16, dir: { x: 1, y: 1 } },
      { frames: 16, dir: { x: 0, y: 0 } },
    ],
    sector: 11,
    frames: 480,
    stepMs: STEP_MS,
    sampleEvery: 60,
    // Projectiles have their own id counter, lifetime and expiry path, none of
    // which any melee scenario touches.
    mobs: [
      { subtype: 'sniper', ring: 5 },
      { subtype: 'turret', ring: 5 },
      { subtype: 'moth', ring: 4 },
    ],
  },
  {
    name: 'crowd',
    seed: 0x5eed0004,
    input: [
      { frames: 24, dir: { x: 1, y: 0 } },
      { frames: 24, dir: { x: 0, y: 1 } },
      { frames: 24, dir: { x: -1, y: 0 } },
      { frames: 24, dir: { x: 0, y: -1 } },
      { frames: 16, dir: { x: 1, y: 1 } },
      { frames: 16, dir: { x: 0, y: 0 } },
    ],
    sector: 21,
    frames: 480,
    stepMs: STEP_MS,
    sampleEvery: 60,
    // Enough to exceed the M6.4b attack-slot cap, so the scheduler's queueing
    // is exercised rather than every mob simply attacking.
    mobs: Array.from({ length: 12 }, (_, i) => ({
      subtype: (['drone', 'charger', 'swarm', 'guardian'] as MobSubtype[])[i % 4],
      ring: 2 + (i % 3),
    })),
  },
  {
    name: 'bossRanged',
    seed: 0x5eed0006,
    input: [
      { frames: 10, dir: { x: 1, y: 0 } },
      { frames: 10, dir: { x: -1, y: 0 } },
      { frames: 10, dir: { x: 0, y: 1 } },
      { frames: 10, dir: { x: 0, y: -1 } },
    ],
    sector: 8,
    frames: 600,
    stepMs: STEP_MS,
    sampleEvery: 75,
    mobs: [],
    keepGeneratedRoster: true,
    approachBoss: true,
  },
  {
    name: 'bossPhased',
    seed: 0x5eed0007,
    input: [
      { frames: 10, dir: { x: 1, y: 0 } },
      { frames: 10, dir: { x: -1, y: 0 } },
      { frames: 10, dir: { x: 0, y: 1 } },
      { frames: 10, dir: { x: 0, y: -1 } },
    ],
    sector: 16,
    frames: 600,
    stepMs: STEP_MS,
    sampleEvery: 75,
    mobs: [],
    keepGeneratedRoster: true,
    approachBoss: true,
  },
];

/**
 * Place the scenario's world. Runs after the sector is live and before the
 * harness takes the frame queue.
 *
 * `clearMobs` first: the generated roster is seed-dependent in ways the
 * scenario does not control, and leaving it in place would mix an uncontrolled
 * population into a controlled one.
 */
export async function applyScenario(page: Page, scenario: Scenario): Promise<number> {
  return page.evaluate((s) => {
    const level = window.__PIXLAB_LEVEL__;
    if (!level) throw new Error('__PIXLAB_LEVEL__ missing');
    if (!s.keepGeneratedRoster) level.clearMobs();
    level.clearPortals();

    const origin = level.getPlayerPos();
    const ox = Math.round(origin.x);
    const oy = Math.round(origin.y);
    const taken = new Set<string>([`${ox},${oy}`]);

    /**
     * First free floor tile at Chebyshev distance `ring`, expanding outward if
     * that ring is walled off. The scan order is fixed (ring, then dy, then dx)
     * so the same maze always yields the same placement — the seed decides
     * behaviour, never which tile a mob started on.
     */
    const findTile = (ring: number): { x: number; y: number } | null => {
      for (let r = ring; r <= ring + 6; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = ox + dx;
            const y = oy + dy;
            const key = `${x},${y}`;
            if (taken.has(key)) continue;
            if (!level.isFloor(x, y)) continue;
            taken.add(key);
            return { x, y };
          }
        }
      }
      return null;
    };

    let placed = 0;
    for (const m of s.mobs) {
      const pos = findTile(m.ring);
      if (!pos) continue;
      if (level.spawnMob(m.subtype, pos)) placed++;
    }

    if (s.approachBoss) {
      // Highest hp is the boss: arenas also spawn adds, and picking by hp
      // avoids depending on the subtype naming holding still.
      const entities = level.getEntities();
      const boss = entities.reduce<(typeof entities)[number] | null>(
        (best, e) => (best === null || e.hp > best.hp ? e : best),
        null,
      );
      if (boss) {
        // Two tiles off, not adjacent: the player should walk the last step
        // under its own input so the approach is part of what is recorded.
        const bx = Math.round(boss.pos.x);
        const by = Math.round(boss.pos.y);
        const spot = [
          { x: bx + 2, y: by }, { x: bx - 2, y: by },
          { x: bx, y: by + 2 }, { x: bx, y: by - 2 },
          { x: bx + 1, y: by + 1 }, { x: bx - 1, y: by - 1 },
        ].find((c) => level.isFloor(c.x, c.y));
        if (spot) level.setPlayerPos(spot);
      }
    }

    return placed;
  }, scenario as unknown as Scenario);
}
