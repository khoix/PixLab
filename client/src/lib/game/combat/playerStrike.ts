/**
 * M8.5 — the player's auto-attack: who it can reach, and what each swing does.
 *
 * The player does not choose to attack. Walking into range does it, once per
 * `PLAYER_ATTACK_COOLDOWN_MS`, against everything in reach at once — so the
 * weapon is not a button, it is a shape (which tiles it covers) plus a rule
 * (what happens on contact). This module is those two things.
 *
 * ## Why the randomness is injected rather than called
 *
 * Two weapons roll: a spear pierces a wall one time in ten, and a dagger crits.
 * Both draws come off the same global stream the whole simulation shares, and
 * M8.0's `roam` scenario exists precisely to fail when that stream shifts. So
 * `rng` is a parameter defaulting to `Math.random`, and the functions draw at
 * exactly the points the inline code drew: never for a weapon that does not
 * roll, once per enemy for one that does.
 *
 * ## The pierce is not a normal hit, deliberately
 *
 * A spear that goes through rock deals half damage and then **stops** — no
 * knockback, and the caller does not run its death handling on that tick. A mob
 * killed through a wall is swept up by the cleanup pass instead, so it does not
 * drop its coins into a frame where the player never saw it die. That is
 * existing behaviour and the `pierced` outcome is what carries it.
 */

import type { Entity, Level, Position } from '../types';
import { getAttackablePositions } from '../engine';
import { hasLineOfSightCached } from '../ai/losCache';

/** Default reach, matching the mob melee range so trades are symmetric. */
export const PLAYER_MELEE_RANGE_TILES = 1.5;
/** A spear covers two tiles in each direction, and reaches accordingly. */
export const SPEAR_RANGE_TILES = 2.0;
export const SPEAR_PIERCE_CHANCE = 0.1;
export const SPEAR_PIERCE_DAMAGE_SCALE = 0.5;
export const DAGGER_BASE_CRIT_CHANCE = 0.1;
export const DAGGER_CRIT_CHANCE_PER_LEVEL = 0.02;
export const CRIT_DAMAGE_MULTIPLIER = 3;

/** Case-insensitive, because weapon names are display strings. */
function isWeapon(weaponBaseName: string | null, name: string): boolean {
  return weaponBaseName?.toLowerCase() === name;
}

/**
 * How far this weapon reaches from each tile it covers.
 *
 * Note this is a radius *around every attackable position*, not from the
 * player: `getAttackablePositions` already spreads a spear down a line, so the
 * two compose into its real footprint.
 */
export function weaponReachTiles(weaponBaseName: string | null): number {
  return isWeapon(weaponBaseName, 'spear') ? SPEAR_RANGE_TILES : PLAYER_MELEE_RANGE_TILES;
}

/**
 * The level written on a weapon, or the sector as a fallback.
 *
 * Only boss drops carry `Lv{n}` (`items.ts:594`); everything else is named
 * without one and scales by the sector it was generated in. Falling back to the
 * current sector rather than to 1 is what keeps an ordinary dagger's crit
 * chance growing with the run.
 */
export function weaponLevelFrom(weaponName: string | null | undefined, fallback: number): number {
  if (!weaponName) return fallback;
  const match = weaponName.match(/Lv(\d+)/i);
  return match ? parseInt(match[1], 10) : fallback;
}

export interface TargetSelection {
  /** Where the player is swinging from — the tile just entered. */
  from: Position;
  weaponBaseName: string | null;
  entities: Entity[];
  level: Level;
}

/**
 * Everything the swing lands on this tick.
 *
 * Line of sight is required for every weapon but the spear, which is allowed
 * through so `resolveStrike` can roll for it. Letting the spear past the filter
 * is what makes "one in ten through a wall" possible at all — the filter runs
 * first, and a rejection here is final.
 */
export function selectAttackableEnemies(input: TargetSelection): Entity[] {
  const positions = getAttackablePositions(input.from, input.weaponBaseName, input.level);
  const reach = weaponReachTiles(input.weaponBaseName);
  const spear = isWeapon(input.weaponBaseName, 'spear');

  return input.entities.filter((enemy) => {
    if (enemy.type !== 'enemy' && enemy.type !== 'boss_enemy') return false;

    const inRange = positions.some((pos) => {
      const dx = enemy.pos.x - pos.x;
      const dy = enemy.pos.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) <= reach;
    });
    if (!inRange) return false;

    if (!spear && !hasLineOfSightCached(input.from, enemy.pos, input.level)) return false;
    return true;
  });
}

export type StrikeOutcome =
  /** A spear's pierce roll failed: nothing happens to this enemy at all. */
  | { kind: 'missed' }
  /** Through rock at half damage, and nothing else — see the header. */
  | { kind: 'pierced'; damage: number }
  | { kind: 'hit'; damage: number; isCrit: boolean };

export interface StrikeInput {
  weaponBaseName: string | null;
  /** From the weapon's name, or the sector. Drives the dagger's crit chance. */
  weaponLevel: number;
  baseDamage: number;
  /**
   * True only when the weapon is a spear *and* rock stands between the player
   * and this enemy. Computed by the caller so the line-of-sight cache is not
   * consulted for weapons that could never use the answer.
   */
  wallBetween: boolean;
  rng?: () => number;
}

/** What one swing does to one enemy. */
export function resolveStrike(input: StrikeInput): StrikeOutcome {
  const rng = input.rng ?? Math.random;

  if (isWeapon(input.weaponBaseName, 'spear') && input.wallBetween) {
    if (rng() >= SPEAR_PIERCE_CHANCE) return { kind: 'missed' };
    return { kind: 'pierced', damage: input.baseDamage * SPEAR_PIERCE_DAMAGE_SCALE };
  }

  if (isWeapon(input.weaponBaseName, 'dagger')) {
    const critChance =
      DAGGER_BASE_CRIT_CHANCE + (input.weaponLevel - 1) * DAGGER_CRIT_CHANCE_PER_LEVEL;
    if (rng() < critChance) {
      return { kind: 'hit', damage: input.baseDamage * CRIT_DAMAGE_MULTIPLIER, isCrit: true };
    }
  }

  return { kind: 'hit', damage: input.baseDamage, isCrit: false };
}
