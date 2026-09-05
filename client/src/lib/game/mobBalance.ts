// Shared mob tuning maths, used by level generation and by the balance tests.
//
// Keeping these here means a spawn-share or DPS regression is catchable without
// generating a sector and counting entities, and that engine.ts and the tests
// agree by construction rather than by copied arithmetic.

import { MOB_TYPES, MOB_TYPE_BY_SUBTYPE, SWARM_SPAWN_COUNT, type MobTypeDef } from './constants';
import { calculateScaling, getArchetypeConstants } from './scaling';
import { perHitCap } from './combat/damageBudget';

/** Mobs eligible to spawn in a normal sector at this level. */
export function getAvailableMobs(levelNum: number): MobTypeDef[] {
  return MOB_TYPES.filter((mob) => mob.subtype !== 'cerberus' && levelNum >= mob.minLevel);
}

/** Entities produced by one selection of this mob type, on average. */
export function averageSpawnCount(subtype: string): number {
  if (subtype !== 'swarm') return 1;
  const [min, max] = SWARM_SPAWN_COUNT;
  return (min + max) / 2;
}

export function scaledMoveSpeed(mob: MobTypeDef, levelNum: number): number {
  return mob.moveSpeed + levelNum * (mob.speedPerLevel ?? 0);
}

export function scaledAttackCooldown(mob: MobTypeDef, levelNum: number): number {
  if (mob.cooldownPerLevel === undefined) return mob.attackCooldown;
  return Math.max(mob.minCooldown ?? 0, mob.attackCooldown - levelNum * mob.cooldownPerLevel);
}

/**
 * Share of the *entity* population each subtype takes at a level.
 *
 * Spawn weights are rolled per selection, but a swarm selection spawns a pack,
 * so a subtype's real share is its weight times its average pack size,
 * renormalised. Reading weights alone understates swarm badly.
 */
export function expectedPopulationShare(levelNum: number): Record<string, number> {
  const available = getAvailableMobs(levelNum);
  const totalWeight = available.reduce((sum, mob) => sum + mob.spawnWeight, 0);
  if (totalWeight === 0) return {};

  const entitiesPerSelection = available.map(
    (mob) => (mob.spawnWeight / totalWeight) * averageSpawnCount(mob.subtype),
  );
  const totalEntities = entitiesPerSelection.reduce((sum, n) => sum + n, 0);

  const shares: Record<string, number> = {};
  available.forEach((mob, i) => {
    shares[mob.subtype] = entitiesPerSelection[i] / totalEntities;
  });
  return shares;
}

/**
 * Damage-per-second a single mob applies while it can reach the player, with
 * the level's shared scaling multiplier factored out (it is common to every
 * mob, so it cancels when comparing them). Archetype damage constants and the
 * per-level cooldown ramp are included.
 */
export function relativeDps(subtype: string, levelNum: number): number {
  const mob = MOB_TYPE_BY_SUBTYPE.get(subtype);
  if (!mob) return 0;
  const perHit = (mob.baseDamage + levelNum * mob.damagePerLevel) * getArchetypeConstants(subtype).dmg;
  return perHit * (1000 / scaledAttackCooldown(mob, levelNum));
}

/**
 * What the *engine* actually produces, rather than the shape of the tuning
 * table: the archetype term, the scaling clamp, and the M6.4a per-hit cap all
 * applied. `relativeDps` above deliberately keeps modelling the table alone, so
 * a divergence between the two is visible instead of silent — that divergence
 * is exactly what hid the sector-11 clamp pin and the cadence bug.
 */
export function effectiveHitDamage(subtype: string, levelNum: number, playerMaxHp: number): number {
  const mob = MOB_TYPE_BY_SUBTYPE.get(subtype);
  if (!mob) return 0;
  const { dmgMultiplier } = calculateScaling({
    level: levelNum,
    sectorType: 'normal',
    mobArchetype: subtype,
  });
  const raw = Math.floor((mob.baseDamage + levelNum * mob.damagePerLevel) * dmgMultiplier);
  const cap = perHitCap({ maxHp: playerMaxHp, cadenceMs: scaledAttackCooldown(mob, levelNum) });
  return Math.max(1, Math.min(raw, cap));
}

/** Mob HP as generated, so a tankiness regression is catchable arithmetically. */
export function effectiveHp(subtype: string, levelNum: number): number {
  const mob = MOB_TYPE_BY_SUBTYPE.get(subtype);
  if (!mob) return 0;
  const { hpMultiplier } = calculateScaling({
    level: levelNum,
    sectorType: 'normal',
    mobArchetype: subtype,
  });
  return Math.floor((mob.baseHp + levelNum * mob.hpPerLevel) * hpMultiplier);
}

/** The scaling multipliers themselves, for pin and spread assertions. */
export function scalingAt(
  levelNum: number,
  sectorType: 'normal' | 'boss' | 'shop' = 'normal',
  subtype = 'drone',
): { hpMultiplier: number; dmgMultiplier: number } {
  return calculateScaling({ level: levelNum, sectorType, mobArchetype: subtype });
}

/** Relative DPS of one *selection* — a swarm selection brings a whole pack. */
export function relativePackDps(subtype: string, levelNum: number): number {
  return relativeDps(subtype, levelNum) * averageSpawnCount(subtype);
}

export function initMobBalanceApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_MOB_BALANCE__ = {
    getAvailableSubtypes: (levelNum: number) => getAvailableMobs(levelNum).map((m) => m.subtype),
    expectedPopulationShare,
    relativeDps,
    relativePackDps,
    effectiveHitDamage,
    effectiveHp,
    scalingAt,
    scaledMoveSpeed: (subtype: string, levelNum: number) => {
      const mob = MOB_TYPE_BY_SUBTYPE.get(subtype);
      return mob ? scaledMoveSpeed(mob, levelNum) : 0;
    },
    scaledAttackCooldown: (subtype: string, levelNum: number) => {
      const mob = MOB_TYPE_BY_SUBTYPE.get(subtype);
      return mob ? scaledAttackCooldown(mob, levelNum) : 0;
    },
  };
}

declare global {
  interface Window {
    __PIXLAB_MOB_BALANCE__?: {
      getAvailableSubtypes: (levelNum: number) => string[];
      expectedPopulationShare: typeof expectedPopulationShare;
      relativeDps: typeof relativeDps;
      relativePackDps: typeof relativePackDps;
      effectiveHitDamage: typeof effectiveHitDamage;
      effectiveHp: typeof effectiveHp;
      scalingAt: typeof scalingAt;
      scaledMoveSpeed: (subtype: string, levelNum: number) => number;
      scaledAttackCooldown: (subtype: string, levelNum: number) => number;
    };
  }
}
