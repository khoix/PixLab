/**
 * M8.5 — whether a mob lands a hit on the player this tick, as a decision.
 *
 * This is the least visible place in the game to change behaviour by accident,
 * which is why it comes out first. Everything here is a *gate*: geometry, then
 * cadence, then the sector's attack budget. Drop one and nothing looks broken —
 * mobs still chase, still animate, still hit — the damage taken per second just
 * quietly moves, and only a long run says so.
 *
 * The functions decide; the caller applies. Nothing here writes hp, plays a
 * sound, logs an event or ends a run, because that is what made this code hard
 * to read in `update()`: two nearly identical 60-line effect blocks, one per
 * branch, with the three lines that actually differ buried in the middle.
 *
 * ## Two orderings that have to be preserved exactly
 *
 * **The slot is claimed unconditionally.** `claimSlot` is called before the
 * cadence check and its result is only then `&&`-ed in, so a mob that reaches
 * the player takes a slot for its whole cadence whether or not it swings this
 * tick. That is deliberate — the slot covers telegraph, execution and recovery
 * alike — and moving the call inside the condition would let a mob on cooldown
 * skip the budget entirely, which is a balance change disguised as a cleanup.
 *
 * **Cerberus does not claim one at all.** Its tri-bite runs on its own combo
 * clock, and a per-bite slot claim would either starve the combo or triple its
 * cost. Its 100ms guard is not a cadence; the cadence is the combo.
 */

import type { Entity, Level, Position } from '../types';
import { checkCollision } from '../engine';
import { canMoveDiagonally, isInCardinalDirection } from '../ai/mobGeometry';
import { canMeleeReach } from './meleeLineOfSight';
import { canLandMeleeHit } from './meleeCadence';
import { computeIncomingDamage } from './damageModel';
import { shouldCerberusBiteDamage } from './cerberus';
import { canDealDamage as cycleCanDealDamage, readCycle } from '../ai/bossCycle';

/** How close a melee mob has to be. Matches the player's own melee reach. */
export const MOB_MELEE_RANGE_TILES = 1.5;

/** Fallback cadence for a mob whose subtype does not configure one. */
export const DEFAULT_MOB_CADENCE_MS = 500;

/**
 * Only to stop one bite of the tri-bite landing twice in consecutive frames.
 * The combo's own timing is `shouldCerberusBiteDamage`.
 */
export const CERBERUS_BITE_GUARD_MS = 100;

export interface MobReach {
  /** Euclidean distance in tiles, which the caller also uses for telemetry. */
  distance: number;
  /** True when every geometric gate passes and the mob may try to swing. */
  reaches: boolean;
  /**
   * A mob standing in solid rock. Not part of `reaches` — the cadence gate
   * consumes it — but computed here because it is the same question about the
   * same tile.
   */
  attackerInWall: boolean;
}

/**
 * The geometric half: is the player attackable from where this mob stands?
 *
 * Four rules, and the interesting ones are the last two:
 *
 * - A mob sharing the player's tile always reaches it.
 * - A melee mob reaches within 1.5 tiles. A ranged one reaches *only* on the
 *   shared tile, so a sniper backed into the player gets no free melee hit on
 *   top of its shots. `closeEnoughIfRanged` below reads like a second, looser
 *   rule at 1 tile; it cannot actually reject anything, because the only way a
 *   ranged mob passes `positioned` is at distance 0. It is kept as it was
 *   rather than deleted: this is an extraction, and a redundant clause is
 *   cheaper than a behaviour question in the same PR.
 * - Ground mobs must share a row or column. Flyers and phasers need not.
 * - **Line of sight is symmetric with the player's rule.** A phasing mob parked
 *   inside a wall is one the player cannot hit back, so it does not get to hit
 *   either. That symmetry is the whole point; without it the counterplay to a
 *   wall-dipping Phase is "stand somewhere else".
 */
export function mobReachesPlayer(attacker: Entity, playerPos: Position, level: Level | null): MobReach {
  const distance = Math.sqrt(
    Math.pow(attacker.pos.x - playerPos.x, 2) + Math.pow(attacker.pos.y - playerPos.y, 2),
  );
  const sharesTile = attacker.pos.x === playerPos.x && attacker.pos.y === playerPos.y;
  const inMeleeRange = distance <= MOB_MELEE_RANGE_TILES;
  const positioned = sharesTile || (!attacker.isRanged && inMeleeRange);
  const cardinalOk = canMoveDiagonally(attacker) || isInCardinalDirection(attacker.pos, playerPos);
  const lineOfSight = !level || canMeleeReach(playerPos, attacker.pos, level);
  const closeEnoughIfRanged = !attacker.isRanged || distance <= 1;

  return {
    distance,
    reaches: positioned && cardinalOk && lineOfSight && closeEnoughIfRanged,
    attackerInWall: !!level && checkCollision(attacker.pos, level),
  };
}

export interface MobAttackInput {
  /** The entity *after* this tick's AI ran: its phase and combo are current. */
  attacker: Entity;
  now: number;
  /** When this mob last landed a hit. 0 for one that never has. */
  lastDamageTime: number;
  attackerInWall: boolean;
  /** Player's total flat defense from the loadout. */
  defense: number;
  hp: number;
  maxHp: number;
  /** Sector number, which sets the per-mob share of the incoming ceiling. */
  sector: number;
  /**
   * Claim one of the sector's attack slots for `cadenceMs`. Side-effecting, and
   * called at a fixed point — see the header.
   */
  claimSlot: (cadenceMs: number) => boolean;
}

export type MobAttackOutcome =
  | { kind: 'none' }
  | {
      kind: 'hit';
      damage: number;
      /** Player hp after the hit, floored at 0. */
      newHp: number;
      /**
       * Set for the tri-bite: the combo index that has now dealt damage, which
       * the caller stores so the same bite cannot land twice.
       */
      comboCount?: number;
      /** True when the hit should count against the boss cycle's one-hit rule. */
      countsAgainstCycle: boolean;
    };

/**
 * Resolve one tick of contact. Call only when `mobReachesPlayer` says so.
 */
export function resolveMobMeleeAttack(input: MobAttackInput): MobAttackOutcome {
  const { attacker, now } = input;

  if (attacker.mobSubtype === 'cerberus') {
    const biteComboCount = attacker.biteComboCount || 0;
    const shouldDamage = shouldCerberusBiteDamage(
      biteComboCount,
      now - (attacker.lastBiteTime || 0),
      attacker.lastDamageComboCount || 0,
    );
    if (!shouldDamage) return { kind: 'none' };
    if (
      !canLandMeleeHit({
        now,
        lastDamageTime: input.lastDamageTime,
        cooldownMs: CERBERUS_BITE_GUARD_MS,
        attackerInWall: input.attackerInWall,
        emergedAt: attacker.phaseEmergedAt,
      })
    ) {
      return { kind: 'none' };
    }
    const damage = computeIncomingDamage({
      baseDamage: attacker.damage,
      defense: input.defense,
      hpRatio: input.hp / input.maxHp,
      maxHp: input.maxHp,
      // The tri-bite's cadence is the whole combo, not the 100ms guard between
      // individual bites. `??` and not `||`, matching the original: a
      // configured cadence of 0 stays 0 here.
      cadenceMs: attacker.attackCooldown ?? DEFAULT_MOB_CADENCE_MS,
      isBoss: attacker.isBoss === true,
      level: input.sector,
    });
    return {
      kind: 'hit',
      damage,
      newHp: Math.max(0, input.hp - damage),
      comboCount: biteComboCount,
      countsAgainstCycle: false,
    };
  }

  // `||` here, `??` above. Both are the original behaviour and they differ for
  // a configured cadence of 0; kept apart rather than unified, because
  // unifying them is a balance change and belongs in a balance PR.
  const cadenceMs = attacker.attackCooldown || DEFAULT_MOB_CADENCE_MS;

  // A boss running the attack cycle can only hurt during an execution, and only
  // once per cycle: one charge is one hit, which is what makes baiting it a
  // decision rather than a gamble.
  const cycleAllows =
    attacker.bossPhase === undefined || cycleCanDealDamage(readCycle(attacker, now));

  // Claimed before the gate, on purpose. See the header.
  const hasSlot = input.claimSlot(cadenceMs);

  // Short-circuited in the original order. `canLandMeleeHit` is pure, so this
  // is only about not doing the work — but the order is the documentation:
  // cycle, then budget, then cadence.
  if (!cycleAllows || !hasSlot) return { kind: 'none' };
  if (
    !canLandMeleeHit({
      now,
      lastDamageTime: input.lastDamageTime,
      cooldownMs: cadenceMs,
      attackerInWall: input.attackerInWall,
      emergedAt: attacker.phaseEmergedAt,
    })
  ) {
    return { kind: 'none' };
  }

  const damage = computeIncomingDamage({
    baseDamage: attacker.damage,
    defense: input.defense,
    hpRatio: input.hp / input.maxHp,
    maxHp: input.maxHp,
    cadenceMs,
    isBoss: attacker.isBoss === true,
    level: input.sector,
  });
  return {
    kind: 'hit',
    damage,
    newHp: Math.max(0, input.hp - damage),
    countsAgainstCycle: true,
  };
}
