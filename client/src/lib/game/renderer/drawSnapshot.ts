import { getEffectiveStats } from '../stats';
import { buildModifiers, type ModifierSnapshot } from '../modifiers';
import {
  PLAYER_SCREEN_ANCHOR_X,
  PLAYER_SCREEN_ANCHOR_Y_DESKTOP,
  PLAYER_SCREEN_ANCHOR_Y_MOBILE,
} from '../constants';
import { resolveAnchorY } from './cameraAnchor';
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
  isMobileViewport: boolean;
  /** Screen-space position of the player's tile centre; the camera and fog are built around it. */
  playerScreenX: number;
  playerScreenY: number;
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
  isMobileViewport: boolean;
  /**
   * Tallest logical height seen at this viewport width. The anchor is measured
   * against it so browser chrome sliding in and out does not move the world.
   * Defaults to the live height, which is the old behaviour.
   */
  stableLogicalHeight?: number;
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
  const playerScreenX = input.logicalWidth * PLAYER_SCREEN_ANCHOR_X;
  const anchorY = input.isMobileViewport ? PLAYER_SCREEN_ANCHOR_Y_MOBILE : PLAYER_SCREEN_ANCHOR_Y_DESKTOP;
  const playerScreenY = resolveAnchorY(
    input.logicalHeight,
    input.stableLogicalHeight ?? input.logicalHeight,
    anchorY,
  );

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
    isMobileViewport: input.isMobileViewport,
    playerScreenX,
    playerScreenY,
    fogCenterX: playerScreenX,
    fogCenterY: playerScreenY,
  };
}
