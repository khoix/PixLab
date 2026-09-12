/**
 * What a characterization run records, and what it deliberately ignores.
 *
 * The hard part of M8.0 is not driving frames — it is choosing the digest.
 * Capture too little and a refactor slips a changed AI cadence past the gate;
 * capture too much and the baseline fails on a repaint and gets deleted by the
 * third person who hits it. Both failures end with the harness switched off.
 *
 * The rule applied here: record what a *simulation* regression would move, and
 * nothing a *rendering* change can touch. M8.3 moves every draw call in the
 * game; if that stage can turn this red, the digest is wrong.
 *
 * Recorded:
 *   - player position and hp
 *   - every entity's id, subtype, position, hp and boss phase
 *   - attack-pressure occupancy (the M6.4b scheduler's observable state)
 *   - generated item drops (position and name)
 *   - a hash of the maze itself, and its floor count
 *   - portal positions
 *   - sector timer advance
 *
 * Not recorded: frame timings, draw counts, canvas pixels, fog state, camera —
 * all legitimately different after M8.3 while the simulation is untouched.
 *
 * Generated items *are* recorded, after a detour worth writing down. The
 * baselines reproduced locally but `idle` failed on CI with the whole diff
 * being one item: "Thruster of Agility" at (9,7) against "Armor of Resilience"
 * at (15,3), player, entities and timer all matching. The first response was to
 * drop items from the digest, on the theory that generation simply could not be
 * seeded across machines. That was wrong, and the next CI run said so — the
 * pathing scenarios failed too, because the *maze* differed as well.
 *
 * The real cause is a single line of production code: `Game.tsx:708` calls
 * `generateLevel(...)` in its render body, so every render of the page carves a
 * whole 30x30 maze and rolls a roster and items — ~18,500 `Math.random()` draws
 * — and throws the result away. The stream position when the canvas generates
 * the level the player actually plays therefore depends on how many times React
 * happened to render first, which is wall-clock dependent. `beginWorldSetup` in
 * `determinism.ts` fixes it at the source by restarting the stream at the first
 * draw of every `generateLevel` call, so each one returns the identical level
 * and it stops mattering how many ran or which the canvas kept.
 *
 * With that fixed the items are stable and worth keeping: item generation is
 * M8.6's scope, and a digest that quietly omitted it would let that stage
 * change the drop table with nothing to notice.
 *
 * The maze is hashed into the digest for the same reason, and because of how
 * long it took to see the problem above. `idle` places no mobs, pins the
 * player, clears portals and takes no damage — so the *only* field in its
 * digest that could ever reveal a different world was the item, and when that
 * was removed the scenario would have gone green on any maze at all. Recording
 * the grid means a world divergence is legible everywhere instead of showing up
 * as one unexplained item, and maze generation is M8.6's scope besides.
 *
 * Damage is captured as *hp over time* rather than an event stream. There is no
 * damage-event hook on `window` today, and adding one would make this harness a
 * production change — which defeats its purpose. Sampling hp on every captured
 * frame carries the same information for a cadence regression: if a mob starts
 * hitting a frame earlier or a tick harder, the hp series diverges.
 */

export interface EntityDigest {
  id: string;
  subtype: string | null;
  type: string;
  x: number;
  y: number;
  hp: number;
  bossPhase: string | null;
}

export interface WorldDigest {
  /** FNV-1a over the wall/floor grid — a whole maze in one comparable token. */
  mazeHash: string;
  floorCount: number;
  /** The exit tile, which is excluded from item placement and so steers it. */
  exit: string;
  /**
   * The roster `generateLevel` produced, hashed before the scenario clears it.
   *
   * Without this the entity list in a snapshot says nothing about generation:
   * every scenario but the two boss ones replaces the roster with its own
   * mobs, so a run could generate a completely different population and the
   * digest would not move. That is not hypothetical — it hid a cross-machine
   * divergence for a round, where the maze matched, the scenario's own mobs
   * matched, and only the items gave it away.
   */
  rosterHash: string;
  /**
   * `Math.random` draws consumed by the generation call that produced this
   * level.
   *
   * Diagnostic, and the fastest way to read a divergence: an equal count with
   * a different world means the same path through `generateLevel` taking a
   * different value somewhere, a different count means a different branch.
   */
  generationDraws: number;
}

export interface RunSnapshot {
  frame: number;
  virtualMs: number;
  world: WorldDigest;
  player: { x: number; y: number; hp: number };
  entities: EntityDigest[];
  pressure: { used: number; cap: number; holders: number; peakUsed: number };
  items: Array<{ x: number; y: number; name: string }>;
  portals: Array<{ x: number; y: number }>;
  /**
   * Timer advance since the previous sample, not the absolute elapsed.
   *
   * Absolute elapsed is stamped from the real clock at sector entry and
   * therefore carries however many milliseconds of setup happened before the
   * harness installed — it differed by 10ms between two runs of the same
   * scenario. The delta is what a timer regression would actually move: a
   * clock running at the wrong rate, or one that stops advancing.
   *
   * `leftSec` was recorded alongside it and removed for the same reason, one
   * fix later than it should have been: remaining-seconds is the absolute
   * elapsed rounded to a second, so it sits on a boundary and flipped 115/114
   * between two runs of `bossRanged`. It also added no coverage the delta does
   * not already give.
   */
  timer: { advancedMs: number; paused: boolean };
}

/** Exactly what the in-page driver returns per sample, before normalizing. */
export interface RawSnapshot {
  frame: number;
  virtualMs: number;
  world: WorldDigest;
  player: { x: number; y: number; hp: number };
  entities: EntityDigest[];
  pressure: { used: number; cap: number; holders: number; peakUsed: number };
  items: Array<{ x: number; y: number; name: string }>;
  portals: Array<{ x: number; y: number }>;
  timerElapsedMs: number;
  timerPaused: boolean;
}

/**
 * Positions are floats mid-step (movement interpolates between tiles), so they
 * are quantized. 1e-3 of a tile is far finer than any real regression and
 * coarse enough to absorb the last-bit float drift that differs between a value
 * computed inline and the same value computed one call deeper — which is
 * exactly what extraction does to arithmetic.
 */
export function q(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Normalize one raw sample. Runs in Node, not the page.
 *
 * Entities are sorted by id because the iteration order of the entity array is
 * not part of the contract — a refactor is free to change it, and a digest that
 * failed on reordering would be testing the wrong thing.
 */
export function normalizeSnapshot(raw: RawSnapshot, previousElapsedMs?: number): RunSnapshot {
  const advanced = previousElapsedMs === undefined ? 0 : raw.timerElapsedMs - previousElapsedMs;
  return {
    frame: raw.frame,
    virtualMs: raw.virtualMs,
    // Per sample rather than once per run: the level never regenerates
    // mid-sector, so a hash that changed between samples would itself be the
    // finding.
    world: raw.world,
    player: { x: q(raw.player.x), y: q(raw.player.y), hp: raw.player.hp },
    entities: raw.entities
      .map((e) => ({ ...e, x: q(e.x), y: q(e.y) }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    pressure: raw.pressure,
    items: raw.items
      .map((i) => ({ x: q(i.x), y: q(i.y), name: i.name }))
      .sort((a, b) => a.x - b.x || a.y - b.y || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    portals: raw.portals.map((p) => ({ x: q(p.x), y: q(p.y) })).sort((a, b) => a.x - b.x || a.y - b.y),
    timer: {
      // Quantized to 10ms: a sub-frame sampling offset is not a regression.
      advancedMs: Math.round(advanced / 10) * 10,
      paused: raw.timerPaused,
    },
  };
}

/** Stable one-line digest, for a cheap equality check before diffing detail. */
export function digest(snapshots: RunSnapshot[]): string {
  return JSON.stringify(snapshots);
}
