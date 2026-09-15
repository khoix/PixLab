/**
 * M8.6 — one frame of one projectile, as a decision.
 *
 * A shot has five possible ends and they are checked in a fixed order: it can
 * age out, hit the player, hit somebody else's mob, stop at rock, or keep
 * going. The order is the design — a projectile that reaches the player on the
 * same frame it would have clipped a mob hits the player — and it is the part
 * an extraction is most likely to reshuffle without noticing, because every
 * order produces a game that looks like it works.
 *
 * The effects stay with the caller: damage, deaths, the exit a dead boss leaves
 * behind, sounds. What comes back is which of the five happened and where the
 * shot was when it did.
 *
 * ## The one draw
 *
 * A Zeus bolt is allowed through rock on a roll. That draw comes off the
 * simulation's shared stream, so it is taken at exactly the point the inline
 * code took it — after the player and friendly-fire checks, only when the shot
 * would otherwise stop, and only when the projectile carries a chance at all.
 * `rng` is injected for the tests and defaults to `Math.random`.
 */

import type { Entity, Level, Position, Projectile } from '../types';
import { checkCollision } from '../engine';
import { hasExpired } from '../world/lifetimes';

/** Tiles per frame. Not per second: the loop has always advanced it per frame. */
export const PROJECTILE_SPEED = 0.15;

/** How close counts as a hit, for the player and for mobs alike. */
export const PROJECTILE_HIT_RADIUS_TILES = 0.5;

export type ProjectileStep =
  /** Older than its lifetime. It never moved this frame. */
  | { kind: 'expired' }
  | { kind: 'hitPlayer'; pos: Position }
  /**
   * Friendly fire. The index is where the target sat in the array that was
   * passed in, which the caller needs to write hp back without a second scan.
   */
  | { kind: 'hitEnemy'; pos: Position; target: Entity; targetIndex: number }
  /** Stopped by rock, having failed its phase roll or never had one. */
  | { kind: 'blocked'; pos: Position }
  | { kind: 'moved'; pos: Position };

export interface ProjectileStepInput {
  projectile: Projectile;
  now: number;
  playerPos: Position;
  /** Live entity array. Only enemies that are not the owner can be hit. */
  entities: Entity[];
  level: Level | null;
  /** Lifetime cap, since it is configured on the caller rather than the shot. */
  lifetimeMs: number;
  rng?: () => number;
}

export function stepProjectile(input: ProjectileStepInput): ProjectileStep {
  const { projectile, now } = input;

  if (hasExpired({ createdAt: projectile.createdAt, lifetime: input.lifetimeMs }, now)) {
    return { kind: 'expired' };
  }

  const pos = {
    x: projectile.pos.x + projectile.velocity.x * PROJECTILE_SPEED,
    y: projectile.pos.y + projectile.velocity.y * PROJECTILE_SPEED,
  };

  if (within(pos, input.playerPos)) return { kind: 'hitPlayer', pos };

  for (let i = 0; i < input.entities.length; i++) {
    const entity = input.entities[i];
    if (entity.id === projectile.ownerId) continue;
    if (entity.type !== 'enemy' && entity.type !== 'boss_enemy') continue;
    // First match wins: a shot can only hit one mob.
    if (within(pos, entity.pos)) return { kind: 'hitEnemy', pos, target: entity, targetIndex: i };
  }

  if (input.level && checkCollision(pos, input.level)) {
    const chance = projectile.wallPhaseChance;
    if (chance === undefined || chance <= 0) return { kind: 'blocked', pos };
    const rng = input.rng ?? Math.random;
    if (rng() >= chance) return { kind: 'blocked', pos };
    // Phased through; it keeps going from inside the wall.
  }

  return { kind: 'moved', pos };
}

function within(a: Position, b: Position): boolean {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)) < PROJECTILE_HIT_RADIUS_TILES;
}
