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
 *   - item and portal positions
 *   - sector timer elapsed and remaining
 *
 * Not recorded: frame timings, draw counts, canvas pixels, fog state, camera —
 * all legitimately different after M8.3 while the simulation is untouched.
 *
 * Damage is captured as *hp over time* rather than an event stream. There is no
 * damage-event hook on `window` today, and adding one would make this harness a
 * production change — which defeats its purpose. Sampling hp on every captured
 * frame carries the same information for a cadence regression: if a mob starts
 * hitting a frame earlier or a tick harder, the hp series diverges.
 */

import type { Page } from '@playwright/test';

export interface EntityDigest {
  id: string;
  subtype: string | null;
  type: string;
  x: number;
  y: number;
  hp: number;
  bossPhase: string | null;
}

export interface RunSnapshot {
  frame: number;
  virtualMs: number;
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
   */
  timer: { advancedMs: number; leftSec: number; paused: boolean };
}

/**
 * Positions are floats mid-step (movement interpolates between tiles), so they
 * are quantized. 1e-3 of a tile is far finer than any real regression and
 * coarse enough to absorb the last-bit float drift that differs between a
 * value computed inline and the same value computed one call deeper — which is
 * exactly what extraction does to arithmetic.
 */
export function q(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Read the live game. Entities are sorted by id because iteration order of the
 * entity array is not part of the contract — a refactor is free to change it,
 * and a digest that failed on reordering would be testing the wrong thing.
 */
export async function captureSnapshot(
  page: Page,
  frame: number,
  previous?: RunSnapshot,
  previousRawElapsed?: number,
): Promise<{ snapshot: RunSnapshot; rawElapsed: number }> {
  const raw = await page.evaluate(() => {
    const level = window.__PIXLAB_LEVEL__;
    const harness = window.__PIXLAB_REPLAY__;
    if (!level || !harness) throw new Error('harness or level hooks missing');
    return {
      virtualMs: harness.now(),
      player: { ...level.getPlayerPos(), hp: level.getPlayerHp() },
      entities: level.getEntities().map((e) => ({
        id: e.id,
        subtype: e.mobSubtype,
        type: e.type,
        x: e.pos.x,
        y: e.pos.y,
        hp: e.hp,
        bossPhase: e.bossPhase,
      })),
      pressure: level.getPressureStats(),
      items: level.getItems().map((i) => ({ x: i.pos.x, y: i.pos.y, name: i.item.name })),
      portals: level.getPortals().map((p) => ({ x: p.pos.x, y: p.pos.y })),
      timer: {
        elapsedMs: window.__PIXLAB_TIMER__?.getElapsedMs() ?? -1,
        leftSec: window.__PIXLAB_TIMER__?.getTimeLeftSec([]) ?? -1,
        paused: window.__PIXLAB_TIMER__?.isPaused() ?? false,
      },
    };
  });

  const snapshot: RunSnapshot = {
    frame,
    virtualMs: raw.virtualMs,
    player: { x: q(raw.player.x), y: q(raw.player.y), hp: raw.player.hp },
    entities: raw.entities
      .map((e) => ({ ...e, x: q(e.x), y: q(e.y) }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    pressure: raw.pressure,
    items: raw.items.map((i) => ({ ...i, x: q(i.x), y: q(i.y) }))
      .sort((a, b) => a.x - b.x || a.y - b.y || (a.name < b.name ? -1 : 1)),
    portals: raw.portals.map((p) => ({ x: q(p.x), y: q(p.y) })).sort((a, b) => a.x - b.x || a.y - b.y),
    timer: {
      // Filled in by the caller, which knows the previous sample.
      advancedMs: raw.timer.elapsedMs,
      leftSec: Math.round(raw.timer.leftSec),
      paused: raw.timer.paused,
    },
  };
  // Quantized to 10ms: the delta is a virtual-clock difference and a
  // sub-frame sampling offset is not a regression.
  const advanced =
    previousRawElapsed === undefined ? 0 : raw.timer.elapsedMs - previousRawElapsed;
  snapshot.timer.advancedMs = Math.round(advanced / 10) * 10;
  void previous;
  return { snapshot, rawElapsed: raw.timer.elapsedMs };
}

/** Stable one-line digest, for a cheap equality check before diffing detail. */
export function digest(snapshots: RunSnapshot[]): string {
  return JSON.stringify(snapshots);
}
