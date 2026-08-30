import { MODS } from '../constants';
import { getEffectiveStats } from '../stats';
import type { GameState, PlayerStats } from '../types';

export interface ModifierSnapshot {
  enemyHp: number;
  coinMult: number;
  timerMult: number;
  visionMult: number;
  explosiveDeaths: boolean;
  autoReveal: boolean;
}

export interface DrawFrameSnapshot {
  modifiers: ModifierSnapshot;
  effectiveStats: ReturnType<typeof getEffectiveStats>;
  logicalWidth: number;
  logicalHeight: number;
  now: number;
  visionMultiplier: number;
  visionBoost: number;
  visionRadiusPx: number;
  fogRadius: number;
  fogCenterX: number;
  fogCenterY: number;
}

export function buildModifiers(activeModIds: string[]): ModifierSnapshot {
  const modifiers: ModifierSnapshot = {
    enemyHp: 1,
    coinMult: 1,
    timerMult: 1,
    visionMult: 1,
    explosiveDeaths: false,
    autoReveal: false,
  };

  activeModIds.forEach((modId) => {
    const mod = MODS.find((entry) => entry.id === modId);
    if (mod?.modifiers) {
      Object.assign(modifiers, mod.modifiers);
    }
  });

  return modifiers;
}

interface BuildDrawFrameSnapshotInput {
  stats: PlayerStats;
  loadout: GameState['loadout'];
  activeMods: string[];
  temporaryVisionBoost: GameState['temporaryVisionBoost'];
  lightswitchRevealEndTime: number | null;
  visionDebuffLevel: number;
  logicalWidth: number;
  logicalHeight: number;
  tileSize: number;
  now?: number;
}

export function buildDrawFrameSnapshot(input: BuildDrawFrameSnapshotInput): DrawFrameSnapshot {
  const now = input.now ?? Date.now();
  const modifiers = buildModifiers(input.activeMods);
  const effectiveStats = getEffectiveStats(input.stats, input.loadout);

  let visionMultiplier = modifiers.visionMult;
  if (input.visionDebuffLevel > 0) {
    visionMultiplier *= 1 - input.visionDebuffLevel;
  }

  let visionBoost = 0;
  if (input.temporaryVisionBoost && now < input.temporaryVisionBoost.endTime) {
    visionBoost = input.temporaryVisionBoost.amount;
    if (visionBoost >= 9999) {
      visionBoost = Math.max(input.logicalWidth, input.logicalHeight) * 2;
    }
  }

  if (input.lightswitchRevealEndTime && now < input.lightswitchRevealEndTime) {
    visionBoost = Math.max(input.logicalWidth, input.logicalHeight) * 2;
  }

  const fogRadius = (effectiveStats.visionRadius + visionBoost) * visionMultiplier * input.tileSize;
  const visionRadiusPx = fogRadius;

  return {
    modifiers,
    effectiveStats,
    logicalWidth: input.logicalWidth,
    logicalHeight: input.logicalHeight,
    now,
    visionMultiplier,
    visionBoost,
    visionRadiusPx,
    fogRadius,
    fogCenterX: input.logicalWidth / 2,
    fogCenterY: input.logicalHeight / 2,
  };
}
