/**
 * M8.6 — every shot in the game is built here.
 *
 * Four sites pushed the same twelve-field literal: the stationary turret, the
 * sniper, the moth's shadow pulse and Zeus. They differed in two fields and
 * agreed in ten, which is the ratio at which a copied literal stops being
 * convenient — the M6 cadence work had to find and change `cadenceMs` in all
 * four, and a fifth shooter would have been a fifth copy.
 *
 * `cadenceMs` in particular has to be stamped at fire time. The damage a shot
 * does is a share of the ceiling its shooter's cadence earns, and the shooter
 * may be dead by the time the shot lands, so the number travels with the shot
 * rather than being read back off the entity.
 */

import type { Entity, Level, Projectile } from '../types';

/** Added per sector to a shot's chance of passing through rock. */
export const WALL_PHASE_PER_LEVEL = 0.005;

/**
 * Base chance of phasing, per shooter.
 *
 * Zeus is the outlier at even odds, which is the point of the fight: cover is
 * unreliable against him, so the answer is movement rather than a corner. The
 * others are a reminder rather than a threat.
 */
export const WALL_PHASE_BASE = {
  turret: 0.25,
  sniper: 0.1,
  moth: 0.05,
  bossZeus: 0.5,
} as const;

/** A shot's chance of passing through rock, which grows with the sector. */
export function wallPhaseChance(baseChance: number, sector: number): number {
  return Math.min(1.0, baseChance + sector * WALL_PHASE_PER_LEVEL);
}

export interface ShotRequest {
  /** Caller owns the counter, so ids stay unique across every shooter. */
  id: string;
  shooter: Entity;
  /** Direction and speed per frame, already aimed. */
  velocity: { x: number; y: number };
  now: number;
  lifetimeMs: number;
  /** Omitted for a shot that cannot phase, not set to zero — see below. */
  wallPhaseChance?: number;
  /** The moth's pulse, which debuffs vision where it lands. */
  isShadowPulse?: boolean;
}

/**
 * Build a shot.
 *
 * `wallPhaseChance` is spread in rather than assigned, so a shot that cannot
 * phase has no such key at all. `stepProjectile` distinguishes absent from
 * zero, and a key carrying `undefined` also survives a round trip through
 * anything that serializes the level differently from one that is missing.
 */
export function makeProjectile(request: ShotRequest): Projectile {
  return {
    id: request.id,
    pos: { ...request.shooter.pos },
    velocity: request.velocity,
    damage: request.shooter.damage,
    ownerId: request.shooter.id,
    // The cadence this shot was fired at; the shooter may not outlive it.
    cadenceMs: request.shooter.attackCooldown ?? 1000,
    isBoss: request.shooter.isBoss === true,
    lifetime: request.lifetimeMs,
    createdAt: request.now,
    ...(request.wallPhaseChance !== undefined && { wallPhaseChance: request.wallPhaseChance }),
    ...(request.isShadowPulse === true && { isShadowPulse: true }),
  } as Projectile;
}

/** Build it and put it on the level, creating the array if this is the first. */
export function fireProjectile(level: Level, request: ShotRequest): Projectile {
  const projectile = makeProjectile(request);
  if (!level.projectiles) level.projectiles = [];
  level.projectiles.push(projectile);
  return projectile;
}
