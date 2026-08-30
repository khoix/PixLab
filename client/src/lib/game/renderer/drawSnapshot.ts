import { getEffectiveStats } from '../stats';
import { buildModifiers, type ModifierSnapshot } from '../modifiers';
import type { GameState, PlayerStats } from '../types';

export type { ModifierSnapshot };
export { buildModifiers };

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
