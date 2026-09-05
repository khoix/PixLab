import { MOB_TYPE_BY_SUBTYPE } from './constants';
import {
  effectiveHitDamage,
  effectiveHp,
  getAvailableMobs,
  averageSpawnCount,
  scaledAttackCooldown,
  scalingAt,
} from './mobBalance';
import { computeIncomingDamage } from './combat/damageModel';
import { sustainedFractionPerSecond } from './combat/damageBudget';
import { calculateScaling, multipliersAtRatio } from './scaling';
import { PLAYER_ATTACKS_PER_SECOND } from './combat/playerAttack';

// Deterministic answers to "is this sector fair?", so the question stops being
// settled by memory of a playthrough.
//
// The audit that produced M6.4a lived in a throwaway script; every number in it
// had to be recomputed by hand to check anything. This is the same arithmetic,
// kept, so a regression in the difficulty curve is a failing assertion rather
// than something noticed three milestones later — which is exactly how the
// sector-11 clamp pin and the M6.1 cadence bug both survived as long as they
// did.

/**
 * Deterministic player builds, stated rather than sampled.
 *
 * These are seeds, not measurements: the point is that every tier is judged
 * against the same three players, so "harder at sector 24" means the same thing
 * each time it is asked.
 */
export interface PlayerProfile {
  name: 'behind' | 'expected' | 'ahead';
  damageAt: (level: number) => number;
  maxHpAt: (level: number) => number;
  defenseAt: (level: number) => number;
  /** Player power relative to the curve, for the adaptive scaling term. */
  powerRatio: number;
}

export const PLAYER_PROFILES: PlayerProfile[] = [
  {
    name: 'behind',
    damageAt: (l) => 10 + l * 1.0,
    maxHpAt: (l) => 100 + l * 2,
    defenseAt: (l) => l * 0.5,
    powerRatio: 0.8,
  },
  {
    name: 'expected',
    damageAt: (l) => 10 + l * 2.0,
    maxHpAt: (l) => 100 + l * 6,
    defenseAt: (l) => l * 1.5,
    powerRatio: 1.0,
  },
  {
    name: 'ahead',
    damageAt: (l) => 10 + l * 3.2,
    maxHpAt: (l) => 100 + l * 10,
    defenseAt: (l) => l * 3,
    powerRatio: 1.25,
  },
];

/**
 * Attackers assumed to be on the player at once.
 *
 * These are M6.4b's planned caps. M6.4b is not built, so nothing enforces them
 * at runtime yet — they are the assumption this report is computed under, not a
 * measurement of the game. When the scheduler lands, this should read its caps
 * instead and the two will agree or the difference will be visible here.
 */
export function assumedConcurrency(level: number): number {
  if (level <= 8) return 2;
  if (level <= 16) return 3;
  if (level <= 24) return 4;
  return 5;
}

/** The invariant: seconds of reaction a full-HP player gets under that pressure. */
export function survivalFloorSeconds(level: number): number {
  // 2.5 s early, easing to 1.8 s by the late game — crowded, but never a
  // situation where dying is faster than noticing.
  if (level <= 24) return 2.5;
  return 1.8;
}

export interface MobReport {
  subtype: string;
  hp: number;
  hitDamage: number;
  cadenceMs: number;
  /** Share of the player's bar this one mob removes per second of exposure. */
  sustainedBarFractionPerSec: number;
  /** Seconds for this profile's player to kill one. */
  playerTtkSeconds: number;
}

export interface SectorReport {
  sector: number;
  profile: PlayerProfile['name'];
  hpMultiplier: number;
  dmgMultiplier: number;
  roster: string[];
  /** Entities expected in the sector, counting swarm packs as their members. */
  population: number;
  mobs: MobReport[];
  /** Bar fraction per second with `assumedConcurrency` worst-case attackers. */
  incomingBarFractionPerSec: number;
  /** Seconds from full HP under that pressure. */
  timeToDeathSeconds: number;
  survivalFloorSeconds: number;
  meetsSurvivalFloor: boolean;
  boss: { hp: number; hitDamage: number; cadenceMs: number; playerTtkSeconds: number } | null;
}

function playerDps(profile: PlayerProfile, level: number): number {
  return profile.damageAt(level) * PLAYER_ATTACKS_PER_SECOND;
}

/** Damage one hit from this mob actually removes, defense and cap included. */
export function incomingHit(profile: PlayerProfile, subtype: string, level: number): number {
  const mob = MOB_TYPE_BY_SUBTYPE.get(subtype);
  if (!mob) return 0;
  const { dmgMultiplier } = calculateScaling({
    level,
    sectorType: 'normal',
    mobArchetype: subtype,
  });
  const raw = Math.floor((mob.baseDamage + level * mob.damagePerLevel) * dmgMultiplier);
  return computeIncomingDamage({
    baseDamage: raw,
    defense: Math.floor(profile.defenseAt(level)),
    hpRatio: 1,
    maxHp: profile.maxHpAt(level),
    cadenceMs: scaledAttackCooldown(mob, level),
  });
}

export function reportSector(level: number, profile: PlayerProfile): SectorReport {
  const roster = getAvailableMobs(level).map((m) => m.subtype);
  const maxHp = profile.maxHpAt(level);
  const dps = playerDps(profile, level);

  const mobs: MobReport[] = roster.map((subtype) => {
    const mob = MOB_TYPE_BY_SUBTYPE.get(subtype)!;
    const cadenceMs = scaledAttackCooldown(mob, level);
    const hit = incomingHit(profile, subtype, level);
    return {
      subtype,
      hp: effectiveHp(subtype, level),
      hitDamage: hit,
      cadenceMs,
      sustainedBarFractionPerSec: (hit / maxHp) * (1000 / cadenceMs),
      playerTtkSeconds: effectiveHp(subtype, level) / dps,
    };
  });

  // Worst case is the most dangerous attackers the roster offers, as many of
  // them at once as the concurrency assumption allows.
  const worst = [...mobs].sort((a, b) => b.sustainedBarFractionPerSec - a.sustainedBarFractionPerSec);
  const concurrency = assumedConcurrency(level);
  const incoming = worst
    .slice(0, concurrency)
    .reduce((n, m) => n + m.sustainedBarFractionPerSec, 0);

  const scaling = scalingAt(level);
  const floor = survivalFloorSeconds(level);
  const ttd = incoming > 0 ? 1 / incoming : Infinity;

  const isBoss = level % 8 === 0 && level > 0;
  let boss: SectorReport['boss'] = null;
  if (isBoss) {
    const bossScaling = calculateScaling({ level, sectorType: 'boss', mobArchetype: 'boss' });
    const hp = Math.floor((150 + level * 15) * bossScaling.hpMultiplier);
    const rawDamage = Math.floor((20 + level * 2) * bossScaling.dmgMultiplier);
    boss = {
      hp,
      hitDamage: computeIncomingDamage({
        baseDamage: rawDamage,
        defense: Math.floor(profile.defenseAt(level)),
        hpRatio: 1,
        maxHp,
        cadenceMs: 1000,
        isBoss: true,
      }),
      cadenceMs: 1000,
      playerTtkSeconds: hp / dps,
    };
  }

  return {
    sector: level,
    profile: profile.name,
    hpMultiplier: scaling.hpMultiplier,
    dmgMultiplier: scaling.dmgMultiplier,
    roster,
    population: expectedPopulation(level),
    mobs,
    incomingBarFractionPerSec: incoming,
    timeToDeathSeconds: ttd,
    survivalFloorSeconds: floor,
    meetsSurvivalFloor: ttd >= floor,
    boss,
  };
}

/** Entities a normal sector spawns, counting a swarm selection as its pack. */
export function expectedPopulation(level: number): number {
  return Math.min(Math.floor(level * 1.5) + 3, 50);
}

export interface BoundaryReport {
  from: number;
  to: number;
  /** Ratio of the later sector's incoming pressure to the earlier one's. */
  pressureRatio: number;
  /** Ratio of mob HP, taken on the drone so the comparison is like-for-like. */
  hpRatio: number;
  newMobs: string[];
  populationJump: number;
}

/**
 * The boundaries where a roster or tier change lands, which is where an
 * unintended spike would hide. A newly unlocked mechanic is part of that tier's
 * difficulty budget, so a boundary that both introduces a mob and jumps
 * pressure is worth seeing.
 */
export const TIER_BOUNDARIES: Array<[number, number]> = [
  [4, 5], [8, 9], [12, 13], [16, 17], [20, 21], [24, 25], [28, 29],
];

export function reportBoundary(from: number, to: number, profile: PlayerProfile): BoundaryReport {
  const a = reportSector(from, profile);
  const b = reportSector(to, profile);
  return {
    from,
    to,
    pressureRatio: b.incomingBarFractionPerSec / (a.incomingBarFractionPerSec || 1),
    hpRatio: effectiveHp('drone', to) / effectiveHp('drone', from),
    newMobs: b.roster.filter((s) => !a.roster.includes(s)),
    populationJump: b.population - a.population,
  };
}

/** Multipliers for the three profiles side by side, for spread assertions. */
export function profileSpread(level: number): Record<string, { hp: number; dmg: number }> {
  const out: Record<string, { hp: number; dmg: number }> = {};
  for (const p of PLAYER_PROFILES) {
    const m = multipliersAtRatio(level, p.powerRatio);
    out[p.name] = { hp: m.hpMultiplier, dmg: m.dmgMultiplier };
  }
  return out;
}

export function initBalanceHarnessApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_HARNESS__ = {
    reportSector,
    reportBoundary,
    profileSpread,
    incomingHit,
    assumedConcurrency,
    survivalFloorSeconds,
    expectedPopulation,
    sustainedFractionPerSecond,
    profiles: PLAYER_PROFILES.map((p) => p.name),
    boundaries: TIER_BOUNDARIES,
    profileByName: (name: string) => PLAYER_PROFILES.find((p) => p.name === name)!,
  };
}

declare global {
  interface Window {
    __PIXLAB_HARNESS__?: {
      reportSector: (level: number, profile: PlayerProfile) => SectorReport;
      reportBoundary: (from: number, to: number, profile: PlayerProfile) => BoundaryReport;
      profileSpread: typeof profileSpread;
      incomingHit: typeof incomingHit;
      assumedConcurrency: typeof assumedConcurrency;
      survivalFloorSeconds: typeof survivalFloorSeconds;
      expectedPopulation: typeof expectedPopulation;
      sustainedFractionPerSecond: typeof sustainedFractionPerSecond;
      profiles: string[];
      boundaries: Array<[number, number]>;
      profileByName: (name: string) => PlayerProfile;
    };
  }
}
