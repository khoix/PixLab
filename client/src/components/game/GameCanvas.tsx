import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../../lib/store';
import { generateLevel, checkCollision } from '../../lib/game/engine';
import { shuffleInPlace } from '../../lib/game/shuffle';
import {
  clearEffectsNear,
  clearLegacyEffects,
  createLegacyEffectField,
  effectsWithPrefix,
  spawnLegacyEffect,
  stepLegacyEffects,
} from '../../lib/game/renderer/legacyEffects';
import {
  legacyScreenToTile,
  portalAt,
  portalDestinationCandidates,
  tapHitsPortal,
} from '../../lib/game/input/portalTap';
import {
  TILE_SIZE,
  COLORS,
  MODS,
  RARITY_COLORS,
  MOB_TYPE_BY_SUBTYPE,
  MAX_MOB_RANGE_TILES,
  MOTH_ORBIT_RAD_PER_TICK,
  MOTH_BLINK_RADIUS,
  rollMothBlinkDelay,
  SHOP_INTERVAL,
  BOSS_INTERVAL,
  LOW_TIME_ASSIST_SEC,
} from '../../lib/game/constants';
import { aiScheduler, isTimingSensitive } from '../../lib/game/ai/aiScheduler';
import {
  canEnterTile as phaseCanEnterTile,
  isEmergingStep,
  nextWallTilesTraversed,
  PHASE_MAX_WALL_TILES,
} from '../../lib/game/ai/phaseBudget';
import { nextMoveTimer } from '../../lib/game/ai/movementBudget';
import {
  BOSS_CYCLES,
  advanceTimedPhase,
  canBeginCycle,
  enterPhase,
  isRooted,
  phaseExpired,
  readCycle,
  writeCycle,
} from '../../lib/game/ai/bossCycle';
import {
  canMoveDiagonally,
  isInCardinalDirection,
  restrictToCardinal,
} from '../../lib/game/ai/mobGeometry';
import {
  decideMobMove,
  type MobBrainContext,
} from '../../lib/game/ai/mobBehaviour';
import { buildMobOccupancy, occupancyKey } from '../../lib/game/ai/mobOccupancy';
import { addsDueAt } from '../../lib/game/ai/bossAdds';
import {
  createPressureState,
  expireHolds,
  releaseSlot,
  slotCapForLevel,
  slotCostFor,
  tryClaimSlot,
  usedSlots,
} from '../../lib/game/ai/attackPressure';
import { rollPortalDestination } from '../../lib/game/engine';
import { computeIncomingDamage } from '../../lib/game/combat/damageModel';
import { getGameNow, isGamePaused, pauseGameClock, resetGameClock, resumeGameClock } from '../../lib/game/gameClock';
import { mobReachesPlayer, resolveMobMeleeAttack } from '../../lib/game/combat/mobContact';
import { stepProjectile } from '../../lib/game/combat/projectileStep';
import {
  WALL_PHASE_BASE,
  fireProjectile,
  wallPhaseChance,
} from '../../lib/game/combat/projectileSpawn';
import { dropExpired, hasExpired } from '../../lib/game/world/lifetimes';
import {
  resolveStrike,
  selectAttackableEnemies,
  weaponLevelFrom,
} from '../../lib/game/combat/playerStrike';
import {
  applyVisionDebuffStack,
  createVisionDebuffState,
  decayVisionDebuff,
  resetVisionDebuff,
} from '../../lib/game/combat/visionDebuff';
import { getLosCacheStats, hasLineOfSightCached, invalidateLosCache } from '../../lib/game/ai/losCache';
import { spawnMobEntity, spawnPortalAtPosition } from '../../lib/game/demoSpawn';
import { getThemeForLevel } from '../../lib/game/colorThemes';
import { drawMobArt } from '../../lib/game/renderer/mobArt';
import { drawPerspectiveSenses } from '../../lib/game/renderer/perspectiveSenses';
import { PerspectiveFog } from '../../lib/game/renderer/perspectiveFog';
import { PerspectiveEffects } from '../../lib/game/renderer/perspectiveEffects';
import { PerspectiveLandmarks } from '../../lib/game/renderer/perspectiveLandmarks';
import { PerspectiveItems } from '../../lib/game/renderer/perspectiveItems';
import { PerspectiveProjectiles } from '../../lib/game/renderer/perspectiveProjectiles';
import { PerspectiveEntities } from '../../lib/game/renderer/perspectiveEntities';
import { mobSpriteCache } from '../../lib/game/renderer/mobSpriteCache';
import { needsThreatMarker, markerStartDistance } from '../../lib/game/renderer/fogGradient';
import {
  knockbackDestination,
  nearestFloorStep,
  isBoundaryTile,
  isFloorTile,
  inBounds as tileInBounds,
} from '../../lib/game/ai/wallEscape';
import { Level, Position, Entity, Projectile, MobSubtype, Afterimage, Particle, Portal, Footprint } from '../../lib/game/types';
import { getEffectiveStats, getTotalDefense } from '../../lib/game/stats';
import { generateItem } from '../../lib/game/items';
import { recordItemOffer, getSoftAssistAdjustments, getOfferPowerMetrics } from '../../lib/game/itemEconomy';
import { getItemBaseName } from '../../lib/game/compendium-image-map';
import { audioManager } from '../../lib/audio';
import { eventLogger } from '../../lib/game/eventLogger';
import { GameOverlay } from './GameOverlay';
import { PerfOverlay } from './PerfOverlay';
import { isPerfOverlayEnabled } from '../../lib/game/perfFlags';
import { perfMonitor } from '../../lib/game/perfMonitor';
import {
  applyBufferedGameInput,
  bufferGameInputDirection,
  gameInputDirectionRef,
} from '../../lib/game/gameInput';
import {
  advanceInterpolation,
  entersNewFootprintTile,
  footprintFor,
  hasLanded,
  resolvePlayerStep,
  shouldBufferDirection,
} from '../../lib/game/movement/playerStep';
import { triggerHaptic } from '../../lib/game/haptics';
import { runtimeVisionDebuffRef } from '../../lib/game/runtimeRefs';
import {
  installShadowQualityGate,
  resolveRenderQuality,
  setShadowTier,
  strokeGlowRect,
  strokeGlowCircle,
  MOBILE_BREAKPOINT,
  type ShadowTier,
} from '../../lib/game/renderQuality';
import { applyCanvasDimensions, getCanvasDimensions } from '../../lib/game/renderer/canvasSizing';
import { fogLayerCache, tileLayerCache } from '../../lib/game/renderer/cacheInstances';
import { buildDrawFrameSnapshot, type DrawFrameSnapshot } from '../../lib/game/renderer/drawSnapshot';
import {
  clientToCanvas,
  createPerspectiveCamera,
  screenToTile as projectedScreenToTile,
  type PerspectiveCamera,
} from '../../lib/game/renderer/projection';
import { VoxelWorldRenderer } from '../../lib/game/renderer/voxelWorld';
import {
  trackStableViewport,
  type StableViewport,
} from '../../lib/game/renderer/cameraAnchor';
import { buildModifiers } from '../../lib/game/modifiers';
import {
  flushGameLoopBatch,
  queueCompendiumUnlock,
  queueStatsUpdate,
  resetGameLoopBatch,
} from '../../lib/game/gameLoopBatch';
import {
  getSectorElapsedMs,
  getSectorTimeLimitMs,
  getSectorTimeLeftSec,
  popSectorTimerPause,
  pushSectorTimerPause,
  resetSectorTimer,
} from '../../lib/game/sectorTimer';
import { canPlayerAttack, getPlayerMoveDelayMs } from '../../lib/game/combat/playerAttack';
import {
  beginAttackTelegraph,
  completeAttackTelegraph,
  isAttackTelegraphActive,
  BOSS_RANGED_TELEGRAPH_MS,
  RANGED_TELEGRAPH_MS,
} from '../../lib/game/combat/rangedTelegraph';
import {
  shouldAdvanceCerberusCombo,
  CERBERUS_COMBO_COOLDOWN_AFTER_MS,
  CERBERUS_COMBO_RESET_MS,
} from '../../lib/game/combat/cerberus';
import { applyEnemyHitFeedback, updateDamageNumbers } from '../../lib/game/combat/damageFeedback';
import { computeExitPathHint } from '../../lib/game/exitPathHint';
import { drawWeaponIcon, drawArmorIcon, drawUtilityIcon, drawConsumableIcon, preloadItemIcons } from '../../lib/game/itemIcons';

// Module-level cache for stairs image (persists across component instances)
const stairsImageCache: { img: HTMLImageElement | null; loading: boolean } = {
  img: null,
  loading: false
};

// Helper function to format entity names with initial caps
function formatEntityName(mobSubtype: MobSubtype | undefined, isBoss: boolean = false): string {
  if (!mobSubtype) {
    return isBoss ? 'Boss' : 'Enemy';
  }
  
  // Handle boss types
  if (mobSubtype.startsWith('boss_')) {
    const bossName = mobSubtype.replace('boss_', '');
    // Capitalize first letter: 'zeus' -> 'Zeus', 'hades' -> 'Hades', 'ares' -> 'Ares'
    return bossName.charAt(0).toUpperCase() + bossName.slice(1);
  }
  
  // For regular mobs, try to get the display name from MOB_TYPES
  const mobType = MOB_TYPE_BY_SUBTYPE.get(mobSubtype);
  if (mobType && mobType.name) {
    return mobType.name;
  }
  
  // Fallback: capitalize first letter of subtype
  return mobSubtype.charAt(0).toUpperCase() + mobSubtype.slice(1);
}

// Helper function to format item names with initial caps
function formatItemName(itemName: string): string {
  if (!itemName) return itemName;
  
  // Item names are usually already properly formatted, but ensure first letter is capitalized
  // Handle cases like "sword lv5" -> "Sword Lv5", "scroll of fortune" -> "Scroll of Fortune"
  return itemName
    .split(' ')
    .map((word, index) => {
      // Capitalize first letter of each word
      // Preserve special patterns like "Lv5", "of", etc.
      if (word.toLowerCase() === 'of' || word.toLowerCase() === 'the') {
        return word.toLowerCase(); // Keep lowercase for articles/prepositions
      }
      if (word.match(/^Lv\d+$/i)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); // "Lv5" -> "Lv5"
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

// Preload stairs image
function preloadStairsImage(): void {
  if (stairsImageCache.img || stairsImageCache.loading) {
    return; // Already loaded or loading
  }
  
  stairsImageCache.loading = true;
  const BASE_URL = import.meta.env.BASE_URL || '/';
  const stairsPath = `${BASE_URL}imgs/stairs.png`;
  const img = new Image();
  img.onload = () => {
    stairsImageCache.img = img;
    stairsImageCache.loading = false;
  };
  img.onerror = () => {
    console.warn(`Failed to load stairs image: ${stairsPath}`);
    stairsImageCache.loading = false;
  };
  img.src = stairsPath;
}

// Start loading stairs image immediately when module loads
preloadStairsImage();

interface GameCanvasProps {
  /** @deprecated Direction is read from gameInputDirectionRef; optional for Demo sandbox. */
  inputDirection?: { x: number; y: number };
  onGameOver: () => void;
  onLevelComplete: () => void;
  onTimeOut: () => void;
  gameOverState: { type: 'death' | 'timeout' } | null;
  /** Receives the portal API once the canvas mounts; null on unmount. */
  onPortalApiReady?: (api: PortalApi | null) => void;
  /** Called when the tile the player stands on gains or loses a portal. */
  onStandingOnPortalChange?: (standing: boolean) => void;
}

export interface PortalApi {
  /** Viewport pixel -> tile, inverting the camera transform. */
  screenToTile: (clientX: number, clientY: number) => Position | null;
  /** Enter the portal underfoot if `tile` is within the forgiveness square. */
  tryEnterPortalAt: (tile: Position) => boolean;
  /** Enter the portal underfoot, wherever the input came from. */
  enterPortalUnderPlayer: () => boolean;
  isStandingOnPortal: () => boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  inputDirection,
  onGameOver,
  onLevelComplete,
  onTimeOut,
  gameOverState,
  onPortalApiReady,
  onStandingOnPortalChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, dispatch } = useGame();
  
  const levelRef = useRef<Level | null>(null);
  const playerPosRef = useRef<Position>({ x: 0, y: 0 });
  const visualPosRef = useRef<Position>({ x: 0, y: 0 }); // Smooth interpolated visual position
  // Tallest canvas height seen at the current width. The camera anchor is
  // measured against it so a phone's URL bar sliding in and out — which shrinks
  // the `100dvh` run root — does not shift the world.
  const stableViewportRef = useRef<StableViewport | null>(null);
  const [voxelWorld] = useState(() => new VoxelWorldRenderer());
  const [perspectiveItems] = useState(() => new PerspectiveItems());
  const [perspectiveProjectiles] = useState(() => new PerspectiveProjectiles());
  const [perspectiveEntities] = useState(() => new PerspectiveEntities());
  const [perspectiveFog] = useState(() => new PerspectiveFog());
  const [perspectiveEffects] = useState(() => new PerspectiveEffects());
  const [perspectiveLandmarks] = useState(() => new PerspectiveLandmarks());
  // Picking must use the camera that produced the visible frame, including its
  // interpolated focus, rather than a newer simulation position.
  const renderedCameraRef = useRef<{
    perspective: PerspectiveCamera;
    perspectiveEnabled: boolean;
    legacyOffset: Position;
  } | null>(null);
  const moveStartPosRef = useRef<Position>({ x: 0, y: 0 }); // Position when movement started
  const moveProgressRef = useRef<number>(1); // 0 = start, 1 = complete
  const lastTimeRef = useRef<number>(0);
  const moveTimerRef = useRef<number>(0);
  const levelStartTimeRef = useRef<number>(0);
  const gameOverTriggeredRef = useRef<boolean>(false);
  // Track when each enemy last dealt damage to prevent frame-by-frame damage loops
  const enemyDamageCooldownRef = useRef<Map<string, number>>(new Map());
  const enemyMoveTimersRef = useRef<Map<string, number>>(new Map()); // Track individual mob move timers
  const projectileIdCounterRef = useRef<number>(0);
  const afterimageIdCounterRef = useRef<number>(0);
  const particleIdCounterRef = useRef<number>(0);
  const footprintIdCounterRef = useRef<number>(0);
  const lastPlayerAttackTimeRef = useRef<number>(0);
  const exitPathHintRef = useRef<Position[]>([]);
  const lastFootprintPosRef = useRef<Position | null>(null); // Track last position where footprint was created
  const nextFootIsLeftRef = useRef<boolean>(true); // Track which foot to place next (alternating)
  // Nyx shadow-pulse debuff: bounded stack with per-source cooldown and decay
  // (see lib/game/combat/visionDebuff.ts).
  const visionDebuffRef = useRef(createVisionDebuffState());
  const lightswitchRevealEndTimeRef = useRef<number | null>(null); // Track when lightswitch reveal ends
  // Use refs to track current stats to avoid race conditions with async state updates
  const statsRef = useRef<typeof state.stats>(state.stats);
  const loadoutRef = useRef<typeof state.loadout>(state.loadout);
  const activeModsRef = useRef<string[]>(state.activeMods);
  const temporaryVisionBoostRef = useRef<typeof state.temporaryVisionBoost>(state.temporaryVisionBoost);
  const activeScrollEffectsRef = useRef<typeof state.activeScrollEffects>(state.activeScrollEffects);
  const settingsRef = useRef(state.settings);
  const canvasSizeRef = useRef({
    logicalWidth: 1,
    logicalHeight: 1,
    dpr: 1,
  });
  const lastPlayerPosRef = useRef<Position>({ x: 0, y: 0 });
  const previousEnemyIdsRef = useRef<Set<string>>(new Set());
  const bonusSelectionRef = useRef<{ options: string[] } | null>(null);
  const [showBonusSelection, setShowBonusSelection] = useState(false);
  const showPerfOverlay = isPerfOverlayEnabled();
  const updateFnRef = useRef<(deltaTime: number) => void>(() => {});
  const drawFnRef = useRef<() => void>(() => {});
  const loopRunningRef = useRef(false);
  // One derived-stats snapshot per rAF, shared by update() and draw(). The loop
  // bumps frameCounterRef; the first caller in a frame builds, the rest reuse.
  const frameCounterRef = useRef(0);
  const frameSnapshotRef = useRef<{ frame: number; snapshot: DrawFrameSnapshot } | null>(null);

  const getFrameSnapshot = (now?: number): DrawFrameSnapshot => {
    const cached = frameSnapshotRef.current;
    if (cached && cached.frame === frameCounterRef.current) return cached.snapshot;
    const canvas = canvasRef.current;
    const isMobileViewport =
      (canvas ? canvas.clientWidth < MOBILE_BREAKPOINT : false) || window.innerWidth < MOBILE_BREAKPOINT;
    stableViewportRef.current = trackStableViewport(
      stableViewportRef.current,
      canvasSizeRef.current.logicalWidth,
      canvasSizeRef.current.logicalHeight,
    );
    const snapshot = buildDrawFrameSnapshot({
      stats: statsRef.current,
      loadout: loadoutRef.current,
      activeMods: activeModsRef.current,
      temporaryVisionBoost: temporaryVisionBoostRef.current,
      lightswitchRevealEndTime: lightswitchRevealEndTimeRef.current,
      visionDebuffLevel: visionDebuffRef.current.level,
      logicalWidth: canvasSizeRef.current.logicalWidth,
      logicalHeight: canvasSizeRef.current.logicalHeight,
      tileSize: TILE_SIZE,
      isMobileViewport,
      stableLogicalHeight: stableViewportRef.current.height,
      now,
    });
    frameSnapshotRef.current = { frame: frameCounterRef.current, snapshot };
    return snapshot;
  };
  
  // Calculate mod modifiers
  const getModifiers = () => buildModifiers(activeModsRef.current);

  const haptic = (pattern: 'light' | 'medium' | 'heavy' | 'success') => {
    triggerHaptic(pattern, { enabled: settingsRef.current.hapticsEnabled !== false });
  };

  /** Adds already summoned this boss fight, so a threshold cannot re-fire. */
  // Render-owned: the legacy 2D view's portal and sense effects, which used to
  // be pushed onto `level.particles` from inside draw(). See
  // lib/game/renderer/legacyEffects.ts.
  const legacyEffectsRef = useRef(createLegacyEffectField());
  const bossAddsSpawnedRef = useRef(0);

  // Who is allowed to be attacking right now. A mob holds its slot for a whole
  // attack cycle, not just the damage frame, so the crowd around the player can
  // be large while the number of things actually swinging stays bounded.
  const attackPressureRef = useRef(createPressureState());
  const peakPressureRef = useRef(0);

  /**
   * True when this mob may deal damage this tick, taking or renewing a slot if
   * one is free. A mob that cannot get one still pursues and repositions — it
   * simply does not get to swing.
   */
  const claimAttackSlot = (entity: Entity, now: number, cadenceMs: number): boolean => {
    const cap = slotCapForLevel(state.currentLevel);
    const cost = slotCostFor(entity.mobSubtype, entity.isBoss === true);
    // Held for the full cadence: telegraph, execution and recovery alike.
    const granted = tryClaimSlot(attackPressureRef.current, entity.id, cost, cap, now, cadenceMs);
    if (granted) {
      peakPressureRef.current = Math.max(peakPressureRef.current, usedSlots(attackPressureRef.current));
    }
    return granted;
  };

  /**
   * Somewhere to put a summoned add: on the far side of the boss from the
   * player, so one never materialises on top of them or behind their back.
   */
  const findAddSpawn = (bossPos: Position): Position => {
    const level = levelRef.current;
    if (!level) return bossPos;
    const away = {
      x: Math.sign(bossPos.x - playerPosRef.current.x) || 1,
      y: Math.sign(bossPos.y - playerPosRef.current.y) || 1,
    };
    for (let step = 2; step <= 5; step++) {
      for (const candidate of [
        { x: Math.round(bossPos.x + away.x * step), y: Math.round(bossPos.y) },
        { x: Math.round(bossPos.x), y: Math.round(bossPos.y + away.y * step) },
        { x: Math.round(bossPos.x + away.x * step), y: Math.round(bossPos.y + away.y * step) },
      ]) {
        if (checkCollision(candidate, level)) continue;
        const distToPlayer = Math.hypot(
          candidate.x - playerPosRef.current.x,
          candidate.y - playerPosRef.current.y,
        );
        if (distToPlayer >= 3) return candidate;
      }
    }
    return bossPos;
  };

  // Drop every per-mob record when a mob leaves the level, so a future mob that
  // reuses the id (waves, summons) starts with a clean clock and cooldowns.
  const releaseMobBookkeeping = (id: string) => {
    aiScheduler.forget(id);
    enemyMoveTimersRef.current.delete(id);
    enemyDamageCooldownRef.current.delete(id);
    releaseSlot(attackPressureRef.current, id);
  };

  // Apply vision debuff (stacks up to complete blindness)
  const applyVisionDebuff = (sourceId: string | undefined, now: number) => {
    applyVisionDebuffStack(visionDebuffRef.current, sourceId, now);
  };

  // Preload item icons and stairs image on mount
  useEffect(() => {
    preloadItemIcons();
    preloadStairsImage();
  }, []);

  // Sync refs with state to ensure game loop always has latest values
  useEffect(() => {
    statsRef.current = state.stats;
    loadoutRef.current = state.loadout;
    activeModsRef.current = state.activeMods;
    temporaryVisionBoostRef.current = state.temporaryVisionBoost;
    activeScrollEffectsRef.current = state.activeScrollEffects;
    settingsRef.current = state.settings;
  }, [state.stats, state.loadout, state.activeMods, state.temporaryVisionBoost, state.activeScrollEffects, state.settings]);

  // Sync optional prop input (Demo sandbox) into shared input ref
  useEffect(() => {
    if (inputDirection) {
      gameInputDirectionRef.current = { x: inputDirection.x, y: inputDirection.y };
    }
  }, [inputDirection?.x, inputDirection?.y]);

  // Freeze the run during bonus selection: timer, mobs and every cooldown.
  useEffect(() => {
    if (showBonusSelection) {
      pushSectorTimerPause('bonus');
      pauseGameClock('bonus');
      return () => {
        popSectorTimerPause('bonus');
        resumeGameClock('bonus');
      };
    }
    return undefined;
  }, [showBonusSelection]);

  // Handle pending scroll actions (excluding Commerce, which is handled in Game.tsx)
  useEffect(() => {
    if (state.pendingScrollAction && levelRef.current && state.pendingScrollAction.type !== 'scroll_commerce') {
      const { type, scrollId } = state.pendingScrollAction;
      
      if (type === 'scroll_fortune') {
        // Teleport near nearest item
        if (levelRef.current.items.length > 0) {
          // Find nearest item
          let nearestItem = levelRef.current.items[0];
          let minDist = Infinity;
          for (const item of levelRef.current.items) {
            const dist = Math.abs(item.pos.x - playerPosRef.current.x) + Math.abs(item.pos.y - playerPosRef.current.y);
            if (dist < minDist) {
              minDist = dist;
              nearestItem = item;
            }
          }
          
          // Find nearby floor tile (2-3 tiles away, not on item tile)
          const nearbyPositions: Position[] = [];
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const dist = Math.abs(dx) + Math.abs(dy);
              if (dist >= 2 && dist <= 3) {
                const x = nearestItem.pos.x + dx;
                const y = nearestItem.pos.y + dy;
                if (x >= 0 && x < levelRef.current.width && y >= 0 && y < levelRef.current.height &&
                    levelRef.current.tiles[y][x] === 'floor' &&
                    (x !== nearestItem.pos.x || y !== nearestItem.pos.y)) {
                  nearbyPositions.push({ x, y });
                }
              }
            }
          }
          
          if (nearbyPositions.length > 0) {
            const targetPos = nearbyPositions[Math.floor(Math.random() * nearbyPositions.length)];
            playerPosRef.current = { ...targetPos };
            visualPosRef.current = { ...targetPos };
            moveStartPosRef.current = { ...targetPos };
            moveProgressRef.current = 1;
            lastPlayerPosRef.current = { ...targetPos };
            audioManager.playSound('itemPickup');
            
            // Log scroll usage event
            eventLogger.logEvent('consumable', 'Used Scroll of Fortune - Teleported near item', {
              type: 'scroll',
              scrollType: 'scroll_fortune'
            });
          }
        }
      } else if (type === 'scroll_pathfinding') {
        // Teleport near exit
        const exitPos = levelRef.current.exitPos;
        const nearbyPositions: Position[] = [];
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist >= 2 && dist <= 3) {
              const x = exitPos.x + dx;
              const y = exitPos.y + dy;
              if (x >= 0 && x < levelRef.current.width && y >= 0 && y < levelRef.current.height &&
                  levelRef.current.tiles[y][x] === 'floor' &&
                  (x !== exitPos.x || y !== exitPos.y)) {
                nearbyPositions.push({ x, y });
              }
            }
          }
        }
        
        if (nearbyPositions.length > 0) {
          const targetPos = nearbyPositions[Math.floor(Math.random() * nearbyPositions.length)];
          playerPosRef.current = { ...targetPos };
          visualPosRef.current = { ...targetPos };
          moveStartPosRef.current = { ...targetPos };
          moveProgressRef.current = 1;
          lastPlayerPosRef.current = { ...targetPos };
          audioManager.playSound('itemPickup');
          
          // Log scroll usage event
          eventLogger.logEvent('consumable', 'Used Scroll of Pathfinding - Teleported near exit', {
            type: 'scroll',
            scrollType: 'scroll_pathfinding'
          });
        }
      } else if (type === 'scroll_ending') {
        // Advance to next boss sector
        let nextBossLevel = state.currentLevel;
        // Find the next boss level (must be greater than current level)
        while (true) {
          nextBossLevel++;
          const isBoss = nextBossLevel % BOSS_INTERVAL === 0 && nextBossLevel > 0;
          if (isBoss) break;
        }
        // Set to one level before target, then complete to reach target
        dispatch({ type: 'SET_CURRENT_LEVEL', payload: nextBossLevel - 1 });
        
        // Log scroll usage event
        eventLogger.logEvent('consumable', 'Used Scroll of Ending - Advanced to next boss sector', {
          type: 'scroll',
          scrollType: 'scroll_ending',
          targetLevel: nextBossLevel
        });
        
        onLevelComplete();
      }
      
      // Clear pending scroll action
      dispatch({ type: 'CLEAR_PENDING_SCROLL_ACTION' });
    }
  }, [state.pendingScrollAction, dispatch, state]);

  // Update audio volumes when settings change
  useEffect(() => {
    audioManager.setMusicVolume(state.settings.musicVolume);
    audioManager.setSfxVolume(state.settings.sfxVolume);
  }, [state.settings.musicVolume, state.settings.sfxVolume]);

  // Initialize Level
  useEffect(() => {
    const level = generateLevel(
      state.currentLevel,
      30,
      30,
      statsRef.current,
      loadoutRef.current
    );
    levelRef.current = level;
    renderedCameraRef.current = null;
    tileLayerCache.invalidate();
    fogLayerCache.invalidate();
    mobSpriteCache.setDpr(canvasSizeRef.current.dpr);
    resetGameLoopBatch();
    resetGameClock();
    resetSectorTimer(Date.now());
    playerPosRef.current = { ...level.startPos };
    visualPosRef.current = { ...level.startPos };
    moveStartPosRef.current = { ...level.startPos };
    moveProgressRef.current = 1;
    lastPlayerPosRef.current = { ...level.startPos };
    levelStartTimeRef.current = getGameNow();
    if (perfMonitor.isActive() && state.screen === 'run') {
      perfMonitor.setSectorLevel(state.currentLevel);
    }
    gameOverTriggeredRef.current = false;
    // Reset damage cooldowns when level changes
    enemyDamageCooldownRef.current.clear();
    enemyMoveTimersRef.current.clear();
    bossAddsSpawnedRef.current = 0;
    clearLegacyEffects(legacyEffectsRef.current);
    attackPressureRef.current.clear();
    peakPressureRef.current = 0;
    aiScheduler.reset();
    if (wasStandingOnPortalRef.current) {
      wasStandingOnPortalRef.current = false;
      onStandingOnPortalChangeRef.current?.(false);
    }
    previousEnemyIdsRef.current = new Set(level.entities.map(e => e.id));
    projectileIdCounterRef.current = 0;
    afterimageIdCounterRef.current = 0;
    particleIdCounterRef.current = 0;
    resetVisionDebuff(visionDebuffRef.current);
    runtimeVisionDebuffRef.current = 0;
    lightswitchRevealEndTimeRef.current = null;
    // Initialize afterimages array if not present
    if (!level.afterimages) {
      level.afterimages = [];
    }
    // Initialize particles array if not present
    if (!level.particles) {
      level.particles = [];
    }
    if (!level.damageNumbers) {
      level.damageNumbers = [];
    }
    // Initialize footprints array if not present
    if (!level.footprints) {
      level.footprints = [];
    }
    // Reset footprint tracking
    lastFootprintPosRef.current = null;
    nextFootIsLeftRef.current = true; // Start with left foot
    lastPlayerAttackTimeRef.current = 0;
    exitPathHintRef.current = [];
    // Reset bonus selection when level changes
    bonusSelectionRef.current = null;
    setShowBonusSelection(false);
    
    // Play maze music when entering a sector
    if (state.screen === 'run') {
      audioManager.resume();
      audioManager.playMusic('maze');
      
      // Log sector start event
      eventLogger.logEvent('progression', `Sector ${state.currentLevel} started`, {
        levelNum: state.currentLevel,
        isBoss: level.isBoss,
        isShop: level.isShop
      });
      
      // Log boss spawn event if this is a boss level
      if (level.isBoss) {
        const bossEntity = level.entities.find(e => e.isBoss);
        if (bossEntity && bossEntity.mobSubtype) {
          const bossName = formatEntityName(bossEntity.mobSubtype, true);
          eventLogger.logEvent('progression', `Boss ${bossName} spawned`, {
            bossType: bossEntity.mobSubtype
          });
        }
      }
    }
  }, [state.currentLevel, state.screen]);

  // Hand the parent the portal API. Refs only, so this mounts once and the
  // closures stay valid for the life of the canvas.
  const wasStandingOnPortalRef = useRef(false);
  const onStandingOnPortalChangeRef = useRef(onStandingOnPortalChange);
  onStandingOnPortalChangeRef.current = onStandingOnPortalChange;
  const portalApiRef = useRef<PortalApi | null>(null);
  useEffect(() => {
    if (!onPortalApiReady) return;
    const api: PortalApi = {
      screenToTile: (x, y) => portalApiRef.current!.screenToTile(x, y),
      tryEnterPortalAt: (tile) => portalApiRef.current!.tryEnterPortalAt(tile),
      enterPortalUnderPlayer: () => portalApiRef.current!.enterPortalUnderPlayer(),
      isStandingOnPortal: () => portalApiRef.current!.isStandingOnPortal(),
    };
    onPortalApiReady(api);
    return () => onPortalApiReady(null);
  }, [onPortalApiReady]);

  // E2e/debug hook: read-only view of the live level plus controlled mob spawning,
  // so AI scheduling can be verified without relying on random level layouts.
  useEffect(() => {
    window.__PIXLAB_LEVEL__ = {
      getPlayerPos: () => ({ ...playerPosRef.current }),
      getWorldRenderStats: () => voxelWorld.getStats(),
      getRenderedPerspectiveCamera: () => {
        const camera = renderedCameraRef.current?.perspective;
        return camera ? { ...camera, focus: { ...camera.focus }, anchor: { ...camera.anchor } } : null;
      },
      getPerspectiveFogStats: () => perspectiveFog.getStats(),
      getPlayerHp: () => statsRef.current.hp,
      // Render-owned legacy 2D effects. Exposed because the pause leak they
      // used to cause is only observable from outside the component.
      getLegacyEffectCount: () => legacyEffectsRef.current.effects.length,
      isWall: (x: number, y: number) => levelRef.current?.tiles[y]?.[x] === 'wall',
      getPressureStats: () => ({
        used: usedSlots(attackPressureRef.current),
        cap: slotCapForLevel(state.currentLevel),
        holders: attackPressureRef.current.size,
        peakUsed: peakPressureRef.current,
      }),
      getEntities: () =>
        (levelRef.current?.entities ?? []).map((e) => ({
          id: e.id,
          type: e.type,
          mobSubtype: e.mobSubtype ?? null,
          pos: { ...e.pos },
          hp: e.hp,
          bossPhase: e.bossPhase ?? null,
        })),
      getExitPos: () => (levelRef.current ? { ...levelRef.current.exitPos } : null),
      isFloor: (x: number, y: number) => levelRef.current?.tiles[y]?.[x] === 'floor',
      setPlayerPos: (pos) => {
        playerPosRef.current = { ...pos };
        visualPosRef.current = { ...pos };
        moveStartPosRef.current = { ...pos };
        moveProgressRef.current = 1;
        lastPlayerPosRef.current = { ...pos };
      },
      spawnMob: (subtype, pos) => {
        const level = levelRef.current;
        if (!level) return null;
        const entity = spawnMobEntity(level, subtype, { ...pos }, level.levelNumber, statsRef.current, loadoutRef.current);
        if (!entity) return null;
        level.entities = [...level.entities, entity];
        return entity.id;
      },
      clearMobs: () => {
        const level = levelRef.current;
        if (!level) return;
        level.entities = level.entities.filter((e) => e.type !== 'enemy' && e.type !== 'boss_enemy');
      },
      spawnItem: (item, pos) => {
        const level = levelRef.current;
        if (!level) return;
        level.items = [...level.items, { pos: { ...pos }, item }];
      },
      getItems: () => (levelRef.current?.items ?? []).map(({ pos, item }) => ({ pos: { ...pos }, item })),
      getLosCacheStats: () => (levelRef.current ? getLosCacheStats(levelRef.current) : null),
      spawnPortal: (pos: Position) => {
        const level = levelRef.current;
        if (!level) return null;
        const portal = spawnPortalAtPosition(level, { ...pos });
        if (!portal) return null;
        level.portals = [...(level.portals ?? []), portal];
        return portal.id;
      },
      clearPortals: () => {
        const level = levelRef.current;
        if (level) level.portals = [];
      },
      getPortals: () =>
        (levelRef.current?.portals ?? []).map((p) => ({
          id: p.id,
          pos: { ...p.pos },
          exitPos: { ...p.exitPos },
        })),
      isStandingOnPortal: () => portalApiRef.current?.isStandingOnPortal() ?? false,
      screenToTile: (x: number, y: number) => portalApiRef.current?.screenToTile(x, y) ?? null,
      tapAt: (x: number, y: number) => {
        const tile = portalApiRef.current?.screenToTile(x, y);
        if (!tile) return false;
        return portalApiRef.current?.tryEnterPortalAt(tile) ?? false;
      },
    };
    return () => {
      delete window.__PIXLAB_LEVEL__;
    };
  }, []);

  // Handle canvas resize — measure display size from the canvas element, not window
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const dims = getCanvasDimensions(canvas);
      canvasSizeRef.current = {
        logicalWidth: dims.logicalWidth,
        logicalHeight: dims.logicalHeight,
        dpr: dims.dpr,
      };
      applyCanvasDimensions(canvas, dims);
      renderedCameraRef.current = null;
      frameSnapshotRef.current = null;
      fogLayerCache.invalidate();
      tileLayerCache.invalidate();
      // Sprites carry a DPR-sized backing store, so they go with the rest.
      mobSpriteCache.setDpr(canvasSizeRef.current.dpr);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // The geometry lives in lib/game/input/portalTap.ts; what stays here is the
  // ref reading, which is all these closures were ever adding.
  const portalUnderPlayer = (): Portal | null =>
    portalAt(levelRef.current, playerPosRef.current);

  /**
   * Take the portal underfoot. The destination is rolled here rather than read
   * from `portal.exitPos`, so the same portal can send you somewhere different
   * on a second use (M6.3) and the roll sees the items still on the floor.
   */
  const enterPortalUnderPlayer = (): boolean => {
    const level = levelRef.current;
    const portal = portalUnderPlayer();
    if (!level || !portal) return false;

    const candidates = portalDestinationCandidates(level);

    const destination = rollPortalDestination({
      tiles: level.tiles,
      width: level.width,
      height: level.height,
      exitPos: level.exitPos,
      itemPositions: level.items.map((entry) => entry.pos),
      candidates,
      portalPos: { x: Math.floor(portal.pos.x), y: Math.floor(portal.pos.y) },
    });

    audioManager.playSound('itemPickup'); // Reuse sound for portal activation
    haptic('success');
    playerPosRef.current = { ...destination };
    visualPosRef.current = { ...destination };
    moveStartPosRef.current = { ...destination };
    moveProgressRef.current = 1;
    lastPlayerPosRef.current = { ...destination };

    eventLogger.logEvent('environment', 'Used portal', {
      type: 'portal',
      fromPos: { x: Math.floor(portal.pos.x), y: Math.floor(portal.pos.y) },
      toPos: destination,
    });

    const stillOnPortal = portalUnderPlayer() !== null;
    if (stillOnPortal !== wasStandingOnPortalRef.current) {
      wasStandingOnPortalRef.current = stillOnPortal;
      onStandingOnPortalChangeRef.current?.(stillOnPortal);
    }
    return true;
  };

  const screenToTile = (clientX: number, clientY: number): Position | null => {
    const canvas = canvasRef.current;
    if (!canvas || !levelRef.current) return null;
    const rect = canvas.getBoundingClientRect();
    const rendered = renderedCameraRef.current;
    if (!rendered) return null;
    const screen = clientToCanvas({ x: clientX, y: clientY }, rect, rendered.perspective);
    if (!screen) return null;
    if (rendered.perspectiveEnabled) return projectedScreenToTile(rendered.perspective, screen);
    return legacyScreenToTile(screen, rendered.legacyOffset, TILE_SIZE);
  };

  const tryEnterPortalAt = (tile: Position): boolean => {
    const portal = portalUnderPlayer();
    if (!portal) return false;
    if (!tapHitsPortal(tile, portal.pos)) return false;
    return enterPortalUnderPlayer();
  };

  // Refreshed every render so the published API always calls the current
  // closures; they only read refs, so any generation behaves identically.
  portalApiRef.current = {
    screenToTile,
    tryEnterPortalAt,
    enterPortalUnderPlayer,
    isStandingOnPortal: () => portalUnderPlayer() !== null,
  };

  // Helper function to calculate wall phase chance based on base chance and level
  const update = (deltaTime: number) => {
    try {
    if (!levelRef.current) return;

    if (perfMonitor.isActive()) {
      perfMonitor.setEntityCount(levelRef.current.entities.length);
    }

    // Pause/freeze sector state on gameover - stop all mobs, projectiles, and afterimages
    // Check both gameOverState prop and gameOverTriggeredRef to catch timeouts immediately
    if (gameOverState || gameOverTriggeredRef.current) {
      // Clear all projectiles, afterimages, particles, and footprints to prevent them from continuing to move
      if (levelRef.current.projectiles) {
        levelRef.current.projectiles = [];
      }
      if (levelRef.current.afterimages) {
        levelRef.current.afterimages = [];
      }
      if (levelRef.current.particles) {
        levelRef.current.particles = [];
      }
      if (levelRef.current.footprints) {
        levelRef.current.footprints = [];
      }
      return;
    }

    // Get current time - used throughout update for cooldowns and timers
    const now = getGameNow();
    const PROJECTILE_LIFETIME = 3000; // 3 seconds
    
    runtimeVisionDebuffRef.current = decayVisionDebuff(visionDebuffRef.current, deltaTime);

    // Check if temporary vision boost has expired
    if (temporaryVisionBoostRef.current && now >= temporaryVisionBoostRef.current.endTime) {
      temporaryVisionBoostRef.current = null;
    }

    // Check if lightswitch reveal has expired
    if (lightswitchRevealEndTimeRef.current && now >= lightswitchRevealEndTimeRef.current) {
      lightswitchRevealEndTimeRef.current = null;
      // Remove activated lightswitches
      if (levelRef.current && levelRef.current.lightswitches) {
        levelRef.current.lightswitches = levelRef.current.lightswitches.filter(ls => !ls.activated);
      }
    }

    // Check if phasing effect has expired
    if (activeScrollEffectsRef.current.phasing) {
      const phasingEffect = activeScrollEffectsRef.current.phasing;
      if (phasingEffect.endTime !== 'entire_level') {
        if (now >= phasingEffect.endTime) {
          // Phasing expired
          activeScrollEffectsRef.current.phasing = null;
        }
      }
    }

    // Check time limit
    // Don't check timer during bonus selection to prevent game over while player is choosing
    if (!levelRef.current.isShop && !levelRef.current.isBoss && !showBonusSelection) {
      const timeLimit = getSectorTimeLimitMs(activeModsRef.current);
      const elapsed = getSectorElapsedMs(now);
      
      if (elapsed > timeLimit && !gameOverTriggeredRef.current) {
        gameOverTriggeredRef.current = true;
        onTimeOut();
        return;
      }

      const timeLeftSec = getSectorTimeLeftSec(activeModsRef.current, now);
      if (timeLeftSec <= LOW_TIME_ASSIST_SEC && levelRef.current) {
        exitPathHintRef.current = computeExitPathHint(levelRef.current, playerPosRef.current);
      } else {
        exitPathHintRef.current = [];
      }
    }

    // Movement Logic - use refs to get current stats and apply item bonuses
    const baseStats = statsRef.current;
    const effectiveStats = getEffectiveStats(baseStats, loadoutRef.current);
    const moveDelay = getPlayerMoveDelayMs(effectiveStats.speed);

    // The step gate, read once at the top of the frame. Everything below wants
    // this value rather than the interpolated one: a step that finishes inside
    // this frame's `advanceInterpolation` must not also start the next one, or
    // holding a direction would move a tile per frame instead of one per
    // `moveDelay`.
    const progressAtFrameStart = moveProgressRef.current;

    // Buffer direction changes during tile interpolation for next legal move tick
    const heldDirection = {
      x: Math.round(gameInputDirectionRef.current.x),
      y: Math.round(gameInputDirectionRef.current.y),
    };
    if (shouldBufferDirection(progressAtFrameStart, heldDirection)) {
      bufferGameInputDirection(heldDirection);
    }
    if (hasLanded(progressAtFrameStart)) {
      applyBufferedGameInput();
    }

    // Re-read rather than reusing `heldDirection`: applying the buffer above
    // may have replaced it.
    const dx = Math.round(gameInputDirectionRef.current.x);
    const dy = Math.round(gameInputDirectionRef.current.y);

    const interpolation = advanceInterpolation({
      moveProgress: progressAtFrameStart,
      moveStartPos: moveStartPosRef.current,
      playerPos: playerPosRef.current,
      deltaTime,
      moveDelay,
    });
    moveProgressRef.current = interpolation.moveProgress;
    visualPosRef.current = interpolation.visualPos;

    const step = resolvePlayerStep({
      playerPos: playerPosRef.current,
      direction: { x: dx, y: dy },
      moveProgress: progressAtFrameStart,
      moveTimer: moveTimerRef.current,
      deltaTime,
      moveDelay,
      phasing: !!activeScrollEffectsRef.current.phasing?.active,
      level: levelRef.current,
    });
    // The decision owns the timer in every outcome: parked at the delay with no
    // input, still hot after a block so the retry is immediate, zero after a
    // step.
    moveTimerRef.current = step.moveTimer;

    if (step.outcome === 'stepped' && step.nextPos) {
      const nextPos = step.nextPos;
      // Play movement sound
      if (lastPlayerPosRef.current.x !== nextPos.x || lastPlayerPosRef.current.y !== nextPos.y) {
        audioManager.playSound('move');
      }
      
      // One footprint per tile entered, not per frame spent standing on it.
      if (entersNewFootprintTile(lastFootprintPosRef.current, nextPos)) {
        if (levelRef.current && levelRef.current.footprints) {
          levelRef.current.footprints.push(
            footprintFor({
              id: `footprint-${footprintIdCounterRef.current++}`,
              pos: nextPos,
              direction: { x: dx, y: dy },
              isLeftFoot: nextFootIsLeftRef.current,
              createdAt: getGameNow(),
            }),
          );
          lastFootprintPosRef.current = { x: nextPos.x, y: nextPos.y };
          // Alternate between left and right foot
          nextFootIsLeftRef.current = !nextFootIsLeftRef.current;
        }
      }
      
      // Start smooth animation from current visual position (not actual position)
      // This ensures smooth transitions even when changing direction mid-movement
      moveStartPosRef.current = { ...visualPosRef.current };
      moveProgressRef.current = 0;
      
      playerPosRef.current = nextPos;
      lastPlayerPosRef.current = { ...nextPos };
      
      // Check tile triggers
      const tile = levelRef.current.tiles[nextPos.y][nextPos.x];
      if (tile === 'exit') {
        audioManager.playSound('levelComplete');
        haptic('success');
        if (perfMonitor.isActive()) {
          perfMonitor.recordSectorClear(state.currentLevel, true);
        }
        onLevelComplete();
      }

      // Check for lightswitch collision
      const lightswitch = levelRef.current.lightswitches.find(
        ls => !ls.activated && Math.floor(ls.pos.x) === nextPos.x && Math.floor(ls.pos.y) === nextPos.y
      );
      if (lightswitch) {
        // Activate lightswitch: full maze reveal for 5 seconds, clear vision debuff, then remove lightswitch
        audioManager.playSound('itemPickup'); // Reuse sound for lightswitch activation
        lightswitch.activated = true;
        lightswitchRevealEndTimeRef.current = now + 5000; // 5 seconds
        resetVisionDebuff(visionDebuffRef.current); // Clear Nyx effect
        runtimeVisionDebuffRef.current = 0;

        // Log lightswitch activation event
        eventLogger.logEvent('environment', 'Activated lightswitch - Full maze reveal for 5s', {
          type: 'lightswitch',
          duration: 5000
        });
        
        // Remove lightswitch after reveal ends (handled in update loop)
      }

      // Check for item collection
      const itemIndex = levelRef.current.items.findIndex(
        item => item.pos.x === nextPos.x && item.pos.y === nextPos.y
      );
      if (itemIndex !== -1) {
        const collectedItem = levelRef.current.items[itemIndex].item;
        audioManager.playSound('itemPickup');
        haptic('light');
        dispatch({ type: 'ADD_ITEM', payload: collectedItem });
        levelRef.current.items = levelRef.current.items.filter((_, i) => i !== itemIndex);
        
        // Log item pickup event
        const itemName = formatItemName(collectedItem.name);
        eventLogger.logEvent('loot', `Picked up ${itemName} (${collectedItem.rarity})`, {
          item: collectedItem
        });
      }

      // Auto-attack nearby enemies with weapon-specific mechanics.
      //
      // The weapon's footprint and the per-swing rules live in
      // combat/playerStrike.ts; what stays here is the applying — hp, feedback,
      // the log, knockback and the death path.
      const weapon = loadoutRef.current.weapon;
      const weaponBaseName = weapon ? getItemBaseName(weapon.name) : null;
      const weaponLevel = weaponLevelFrom(weapon?.name, state.currentLevel);

      const attackableEnemies = selectAttackableEnemies({
        from: nextPos,
        weaponBaseName,
        entities: levelRef.current.entities,
        level: levelRef.current,
      });
      
      if (canPlayerAttack(lastPlayerAttackTimeRef.current, now) && attackableEnemies.length > 0) {
        let playerAttackLanded = false;
        attackableEnemies.forEach(enemy => {
        // Only a spear can use the answer, so only a spear pays for asking.
        const wallBetween =
          weaponBaseName?.toLowerCase() === 'spear' &&
          !!levelRef.current &&
          !hasLineOfSightCached(nextPos, enemy.pos, levelRef.current);

        const strike = resolveStrike({
          weaponBaseName,
          weaponLevel,
          baseDamage: effectiveStats.damage,
          wallBetween,
        });

        if (strike.kind === 'missed') return; // the pierce roll failed

        if (strike.kind === 'pierced') {
          // Through rock at half damage, and nothing else: no knockback, and no
          // death handling this tick. A mob killed through a wall is swept up
          // by the cleanup pass instead.
          audioManager.playSound('attack');
          enemy.hp -= strike.damage;
          if (levelRef.current) {
            applyEnemyHitFeedback(levelRef.current, enemy, strike.damage, now, false);
          }
          playerAttackLanded = true;

          const piercedName = formatEntityName(enemy.mobSubtype, enemy.isBoss);
          eventLogger.logEvent('combat', `Dealt ${Math.floor(strike.damage)} damage to ${piercedName}`, {
            damage: Math.floor(strike.damage),
            enemyType: enemy.mobSubtype,
            isBoss: enemy.isBoss,
            enemyHp: Math.floor(enemy.hp)
          });
          return;
        }

        audioManager.playSound('attack');

        const damage = strike.damage;
        const isCrit = strike.isCrit;

        // Apply damage
        enemy.hp -= damage;
        if (levelRef.current) {
          applyEnemyHitFeedback(levelRef.current, enemy, damage, now, isCrit);
        }
        playerAttackLanded = true;
        
        // Log player attack event
        const enemyTypeName = formatEntityName(enemy.mobSubtype, enemy.isBoss);
        const damageMessage = isCrit 
          ? `CRIT! Dealt ${Math.floor(damage)} damage to ${enemyTypeName}`
          : `Dealt ${Math.floor(damage)} damage to ${enemyTypeName}`;
        eventLogger.logEvent('combat', damageMessage, {
          damage: Math.floor(damage),
          enemyType: enemy.mobSubtype,
          isBoss: enemy.isBoss,
          enemyHp: Math.floor(enemy.hp),
          isCrit
        });
        
        // Mace: Knockback (higher level = more knockback)
        if (weaponBaseName?.toLowerCase() === 'mace' && enemy.hp > 0) {
          // Calculate knockback direction (away from player)
          const dx = enemy.pos.x - nextPos.x;
          const dy = enemy.pos.y - nextPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0 && levelRef.current) {
            // Knockback distance: 0.5 tiles base, +0.1 per level.
            //
            // Swept a whole tile at a time rather than applied as a vector.
            // The old fractional push validated only the destination's
            // floored tile, so a mob shoved to x = 28.45 passed the check
            // while its sprite visibly overlapped the wall at tile 29 — and
            // past one tile of distance it could land beyond a wall it was
            // never allowed to cross.
            const knockbackDistance = 0.5 + (weaponLevel - 1) * 0.1;
            enemy.pos = knockbackDestination(
              levelRef.current,
              enemy.pos,
              dx,
              dy,
              knockbackDistance,
            );
          }
        }
        
        if (enemy.hp <= 0) {
            // Store boss death position for exit placement
            const bossDeathPos = enemy.isBoss ? { x: Math.floor(enemy.pos.x), y: Math.floor(enemy.pos.y) } : null;
            
            // Remove enemy and award coins
            audioManager.playSound('enemyDeath');
            audioManager.playSound('coin');
            levelRef.current!.entities = levelRef.current!.entities.filter(e => e.id !== enemy.id);
            releaseMobBookkeeping(enemy.id);
            
            // Log kill event
            const enemyTypeName = formatEntityName(enemy.mobSubtype, enemy.isBoss);
            eventLogger.logEvent('combat', `Defeated ${enemyTypeName}`, {
              enemyType: enemy.mobSubtype,
              isBoss: enemy.isBoss
            });
            
            // If boss was defeated, place exit at boss death location
            if (enemy.isBoss && bossDeathPos && levelRef.current) {
              const exitX = bossDeathPos.x;
              const exitY = bossDeathPos.y;
              
              // Ensure position is within bounds and is a floor tile
              if (exitX >= 0 && exitX < levelRef.current.width && 
                  exitY >= 0 && exitY < levelRef.current.height &&
                  levelRef.current.tiles[exitY] &&
                  (levelRef.current.tiles[exitY][exitX] === 'floor' || levelRef.current.tiles[exitY][exitX] === 'wall')) {
                // Set the tile to exit (convert wall to floor first if needed)
                if (levelRef.current.tiles[exitY][exitX] === 'wall') {
                  levelRef.current.tiles[exitY][exitX] = 'floor';
                }
                levelRef.current.tiles[exitY][exitX] = 'exit';
                invalidateLosCache(levelRef.current);
                // Update exit position
                levelRef.current.exitPos = { x: exitX, y: exitY };
              }
              
              // Log boss defeat event
              const bossName = formatEntityName(enemy.mobSubtype, true);
              eventLogger.logEvent('progression', `Boss ${bossName} defeated`, {
                bossType: enemy.mobSubtype
              });
            }
            
            // Calculate coin reward based on mob type
            let coinReward = 10; // Default
            if (enemy.isBoss) {
              coinReward = 100;
            } else if (enemy.mobSubtype) {
              const mobType = MOB_TYPE_BY_SUBTYPE.get(enemy.mobSubtype);
              if (mobType) {
                coinReward = mobType.coinReward;
                // Add level scaling if coinPerLevel is defined
                if (mobType.coinPerLevel) {
                  coinReward += Math.floor(state.currentLevel * mobType.coinPerLevel);
                }
              }
            }
            
            coinReward *= getModifiers().coinMult;
            
            // Apply soft assist multiplier if economy ratio is low
            const metrics = getOfferPowerMetrics(state.currentLevel, state.loadout);
            const assists = getSoftAssistAdjustments(metrics.economyRatio);
            coinReward = Math.floor(coinReward * assists.coinRewardMultiplier);
            
            statsRef.current = { ...statsRef.current, coins: statsRef.current.coins + coinReward };
            queueStatsUpdate({ coins: statsRef.current.coins });
            
            // Log coin collection event
            eventLogger.logEvent('loot', `Collected ${coinReward} coins`, {
              amount: coinReward
            });
            
            // Unlock compendium card on first defeat
            if (enemy.mobSubtype) {
              queueCompendiumUnlock(enemy.mobSubtype);
            }
            
            // Check if all non-boss enemies are cleared
            if (levelRef.current && !levelRef.current.isBoss && !levelRef.current.isShop) {
              const remainingNonBossEnemies = levelRef.current.entities.filter(
                e => (e.type === 'enemy' || e.type === 'boss_enemy') && !e.isBoss
              );
              if (remainingNonBossEnemies.length === 0 && !bonusSelectionRef.current) {
                // Generate 2 random bonus options
                const allBonuses = ['restore_health', 'double_coins', 'skip_shop', 'skip_boss', 'mystery_box'];
                const shuffled = shuffleInPlace([...allBonuses]);
                const selectedOptions = shuffled.slice(0, 2);
                bonusSelectionRef.current = { options: selectedOptions };
                setShowBonusSelection(true);
                audioManager.playSound('levelComplete');
              }
            }
          }
        });
        if (playerAttackLanded) {
          lastPlayerAttackTimeRef.current = now;
        }
      }
    }

    // Update projectiles FIRST (before entity movement) to avoid timing issues
    // Wrap in try-catch to ensure update always completes even if projectiles fail
    //
    // Which of the five ends a shot meets — and in what order they are checked
    // — is combat/projectileStep.ts. What stays here is what each one costs.
    try {
      if (!levelRef.current.projectiles) {
        levelRef.current.projectiles = [];
      }

      const updatedProjectiles: Projectile[] = [];
      for (const projectile of levelRef.current.projectiles) {
        const outcome = stepProjectile({
          projectile,
          now,
          playerPos: playerPosRef.current,
          entities: levelRef.current.entities ?? [],
          level: levelRef.current,
          lifetimeMs: PROJECTILE_LIFETIME,
        });

        // Aged out, or stopped by rock: gone either way, and nothing to pay.
        if (outcome.kind === 'expired' || outcome.kind === 'blocked') continue;

        if (outcome.kind === 'hitPlayer') {
          // Hit player - update stats synchronously but ensure loop continues
          const damage = computeIncomingDamage({
            baseDamage: projectile.damage,
            defense: getTotalDefense(loadoutRef.current),
            hpRatio: baseStats.hp / baseStats.maxHp,
            maxHp: baseStats.maxHp,
            // The cadence the shot was fired at, not the shooter's current
            // one — the shooter may already be dead.
            cadenceMs: projectile.cadenceMs,
            isBoss: projectile.isBoss,
            level: state.currentLevel,
          });
          const newHp = Math.max(0, baseStats.hp - damage);
          
          // Apply vision debuff if shadow pulse (bounded stack, at most one
          // per moth per cooldown window)
          if (projectile.isShadowPulse) {
            applyVisionDebuff(projectile.ownerId, now);
          }
          
          // Find the projectile owner to identify attacker
          const attacker = levelRef.current?.entities.find(e => e.id === projectile.ownerId);
          const attackerTypeName = attacker 
            ? formatEntityName(attacker.mobSubtype, attacker.isBoss)
            : 'Unknown';
          
          // Update stats immediately - dispatch is fast and shouldn't block
          audioManager.playSound('damage');
          haptic('medium');
          statsRef.current = { ...statsRef.current, hp: newHp };
          queueStatsUpdate({ hp: newHp });
          
          // Log damage event (projectile/ranged attack)
          eventLogger.logEvent('combat', `Took ${damage} damage from ${attackerTypeName}`, {
            damage,
            enemyType: attacker?.mobSubtype,
            isBoss: attacker?.isBoss,
            isProjectile: true,
            hp: newHp,
            maxHp: baseStats.maxHp
          });
          
          if (newHp <= 0 && !gameOverTriggeredRef.current) {
            gameOverTriggeredRef.current = true;
            // Defer game over to next frame to ensure current frame completes
            requestAnimationFrame(() => {
              audioManager.playSound('gameOver');
              audioManager.stopMusic();
              onGameOver();
            });
          }
          
          continue; // Skip this projectile (hit player)
        }

        if (outcome.kind === 'hitEnemy') {
          const entity = outcome.target;
          const j = outcome.targetIndex;
          // Hit enemy - apply damage
          const newHp = Math.max(0, entity.hp - projectile.damage);
          
          if (newHp <= 0) {
            // Entity killed by friendly fire - remove immediately
            const bossDeathPos = entity.isBoss ? { x: Math.floor(entity.pos.x), y: Math.floor(entity.pos.y) } : null;
            
            // Play death sound (no coin sound - friendly fire kills don't reward player)
            audioManager.playSound('enemyDeath');
            
            // If boss was defeated, place exit at boss death location
            if (entity.isBoss && bossDeathPos && levelRef.current) {
              const exitX = bossDeathPos.x;
              const exitY = bossDeathPos.y;
              
              // Ensure position is within bounds and is a floor tile
              if (exitX >= 0 && exitX < levelRef.current.width && 
                  exitY >= 0 && exitY < levelRef.current.height &&
                  levelRef.current.tiles[exitY] &&
                  (levelRef.current.tiles[exitY][exitX] === 'floor' || levelRef.current.tiles[exitY][exitX] === 'wall')) {
                // Set the tile to exit (convert wall to floor first if needed)
                if (levelRef.current.tiles[exitY][exitX] === 'wall') {
                  levelRef.current.tiles[exitY][exitX] = 'floor';
                }
                levelRef.current.tiles[exitY][exitX] = 'exit';
                invalidateLosCache(levelRef.current);
                // Update exit position
                levelRef.current.exitPos = { x: exitX, y: exitY };
              }
            }
            
            // Remove the dead entity immediately
            levelRef.current.entities = levelRef.current.entities.filter(e => e.id !== entity.id);
            releaseMobBookkeeping(entity.id);
          } else {
            // Entity still alive - just update HP
            levelRef.current.entities[j] = {
              ...entity,
              hp: newHp
            };
            
            // Play damage sound
            audioManager.playSound('damage');
            haptic('medium');
          }
          continue; // Skip this projectile (hit enemy)
        }

        // Keep projectile with updated position
        updatedProjectiles.push({ ...projectile, pos: outcome.pos });
      }

      levelRef.current.projectiles = updatedProjectiles;
      
    } catch (error) {
      // If projectile update fails, just ensure array exists and continue
      console.error('Error updating projectiles:', error);
      if (!levelRef.current.projectiles) {
        levelRef.current.projectiles = [];
      }
    }

    // Update afterimages
    //
    // Not `dropExpired`: an afterimage that reaches the player is consumed by
    // the hit as well as by its age, so the loop stays and only the expiry
    // rule is shared.
    try {
      const updatedAfterimages: Afterimage[] = [];
      for (const afterimage of levelRef.current.afterimages ?? []) {
        if (hasExpired(afterimage, now)) continue;

        // Check player collision
        const distToPlayer = Math.sqrt(
          Math.pow(afterimage.pos.x - playerPosRef.current.x, 2) +
          Math.pow(afterimage.pos.y - playerPosRef.current.y, 2)
        );
        
        if (distToPlayer < 0.5) {
          // Hit player - chip damage
          const chipDamage = afterimage.damage;
          const newHp = Math.max(0, baseStats.hp - chipDamage);
          statsRef.current = { ...statsRef.current, hp: newHp };
          queueStatsUpdate({ hp: newHp });
          if (newHp <= 0 && !gameOverTriggeredRef.current) {
            gameOverTriggeredRef.current = true;
            requestAnimationFrame(() => {
              audioManager.playSound('gameOver');
              audioManager.stopMusic();
              onGameOver();
            });
          }
          continue; // Remove afterimage after hit
        }
        
        updatedAfterimages.push(afterimage);
      }
      
      levelRef.current.afterimages = updatedAfterimages;
    } catch (error) {
      console.error('Error updating afterimages:', error);
      if (!levelRef.current.afterimages) {
        levelRef.current.afterimages = [];
      }
    }

    // Update particles
    try {
      levelRef.current.particles = dropExpired(levelRef.current.particles, now);
    } catch (error) {
      console.error('Error updating particles:', error);
      if (!levelRef.current.particles) {
        levelRef.current.particles = [];
      }
    }

    if (levelRef.current) {
      updateDamageNumbers(levelRef.current, now);
    }

    // Update footprints
    try {
      levelRef.current.footprints = dropExpired(levelRef.current.footprints, now);
    } catch (error) {
      console.error('Error updating footprints:', error);
      if (!levelRef.current.footprints) {
        levelRef.current.footprints = [];
      }
    }

    // Advanced enemy AI with unique behaviors per mob type.
    // The scheduler decides per mob whether it gets a tick this frame (see
    // lib/game/ai/aiScheduler.ts): far-away mobs sleep, mid-range mobs are
    // staggered across frames, nearby / mid-attack mobs run every frame.
    // Tell the parent when the player steps on or off a portal, so the prompt
    // appears and disappears without polling from React.
    const standingOnPortal = portalUnderPlayer() !== null;
    if (standingOnPortal !== wasStandingOnPortalRef.current) {
      wasStandingOnPortalRef.current = standingOnPortal;
      onStandingOnPortalChangeRef.current?.(standingOnPortal);
    }

    aiScheduler.beginFrame();
    // Anything inside this radius is visible to the player and must keep animating.
    const awakeRadiusTiles = activeScrollEffectsRef.current.threatSense
      ? Infinity
      : getFrameSnapshot(now).fogRadius / TILE_SIZE;
    const playerTileX = playerPosRef.current.x;
    const playerTileY = playerPosRef.current.y;

    // Tile → mob occupancy, built lazily on the first move attempt this frame,
    // so mob-vs-mob collision is O(1) instead of a scan of every entity, and a
    // frame where nothing moves pays nothing.
    let mobOccupancy: Map<number, Entity[]> | null = null;
    const getMobOccupancy = (): Map<number, Entity[]> =>
      (mobOccupancy ??= buildMobOccupancy(levelRef.current!.entities));

    // Free the slots of anything whose cycle has run out, so a mob that died or
    // fled is not still occupying pressure.
    expireHolds(attackPressureRef.current, now);

    // Everything the behaviours reach for, and nothing else. Built once per
    // frame rather than per mob: the refs it reads do not change inside a tick.
    const mobBrainContext: MobBrainContext = {
      level: levelRef.current,
      playerPos: playerPosRef.current,
      sector: state.currentLevel,
      moveTimers: enemyMoveTimersRef.current,
      nextProjectileId: () => `projectile-${projectileIdCounterRef.current++}`,
      nextParticleId: () => `particle-${particleIdCounterRef.current++}`,
      nextAfterimageId: () => `afterimage-${afterimageIdCounterRef.current++}`,
      claimSlot: (entity, cadenceMs) => claimAttackSlot(entity, now, cadenceMs),
      projectileLifetimeMs: PROJECTILE_LIFETIME,
      occupancy: getMobOccupancy,
    };

    const updatedEntities = levelRef.current.entities.map(entity => {
      if (entity.type === 'enemy' || entity.type === 'boss_enemy') {
        const mobSubtype = entity.mobSubtype || 'drone';
        const mobType = MOB_TYPE_BY_SUBTYPE.get(mobSubtype);
        const aggroRange = mobType?.aggroRange ?? Infinity;

        const scheduleDx = entity.pos.x - playerTileX;
        const scheduleDy = entity.pos.y - playerTileY;
        const aiDelta = aiScheduler.schedule(
          entity,
          {
            distToPlayer: Math.sqrt(scheduleDx * scheduleDx + scheduleDy * scheduleDy),
            aggroRange,
            awakeRadius: awakeRadiusTiles,
            timingSensitive: isTimingSensitive(entity, now),
          },
          now,
          deltaTime,
        );
        if (aiDelta === null) return entity;

        const updatedEntity = { ...entity };
        const moveSpeed = entity.moveSpeed || 1.0;
        const baseMoveDelay = 1000 / (moveSpeed * 4); // Base movement delay
        
        // Update move timer for this entity
        const currentTimer = enemyMoveTimersRef.current.get(entity.id) || 0;
        enemyMoveTimersRef.current.set(entity.id, currentTimer + aiDelta);
        
        // Stationary mobs don't move
        if (entity.isStationary) {
          // Handle ranged attacks for stationary mobs
          if (entity.isRanged && entity.range) {
            const distToPlayer = Math.sqrt(
              Math.pow(entity.pos.x - playerPosRef.current.x, 2) +
              Math.pow(entity.pos.y - playerPosRef.current.y, 2)
            );
            
            // Only attack if player is within aggro range and attack range
            if (distToPlayer <= aggroRange && distToPlayer <= entity.range) {
              const lastAttack = entity.lastAttackTime || 0;
              const cooldown = entity.attackCooldown || 1500;

              const telegraphComplete = completeAttackTelegraph(updatedEntity, now, (velocity) => {
                if (levelRef.current) {
                  // Only the turret phases among the stationary shooters; the
                  // rest are stopped by rock like anything else.
                  fireProjectile(levelRef.current, {
                    id: `projectile-${projectileIdCounterRef.current++}`,
                    shooter: entity,
                    velocity,
                    now,
                    lifetimeMs: PROJECTILE_LIFETIME,
                    ...(mobSubtype === 'turret' && {
                      wallPhaseChance: wallPhaseChance(WALL_PHASE_BASE.turret, state.currentLevel),
                    }),
                  });
                }
                audioManager.playSound('attack');
              });
              Object.assign(updatedEntity, telegraphComplete);

              // Ranged winds up through the same scheduler as melee: two
              // implementations must not become two budgets on one health bar.
              if (
                !isAttackTelegraphActive(updatedEntity, now) &&
                now - lastAttack >= cooldown &&
                claimAttackSlot(updatedEntity, now, cooldown)
              ) {
                Object.assign(
                  updatedEntity,
                  beginAttackTelegraph(updatedEntity, now, playerPosRef.current, RANGED_TELEGRAPH_MS),
                );
              }
            }
          }
          return updatedEntity;
        }
        
        // Movement logic for non-stationary mobs
        const moveTimer = enemyMoveTimersRef.current.get(entity.id) || 0;
        if (moveTimer >= baseMoveDelay) {
          // What this mob wants to do with its tick: ai/mobBehaviour.ts. What
          // it is allowed to do with the result is below.
          const { nextPos, shouldMove } = decideMobMove(
            { entity, updatedEntity, now, aggroRange, mobSubtype, moveTimer, baseMoveDelay },
            mobBrainContext,
          );
          
          // Apply movement if valid
          if (shouldMove && levelRef.current) {
            const level = levelRef.current;
            const targetTileX = Math.floor(nextPos.x);
            const targetTileY = Math.floor(nextPos.y);
            // `checkCollision` reports out-of-bounds and "wall" with the same
            // boolean. Conflating them let a phaser spend its wall budget on a
            // step off the grid that the bounds check then refused — and since
            // the counter only updates on a committed move, it never reset.
            const targetInBounds = tileInBounds(level, targetTileX, targetTileY);
            const targetIsWall =
              targetInBounds && checkCollision(nextPos, level);
            // Phasing mobs may cut through walls, but only for a few tiles at a
            // time — otherwise the maze stops being cover and they become
            // unbreakable stalkers.
            //
            // The outer ring is one-way: a phaser may never step *into* it from
            // the maze (there is nothing beyond it, so it can only get stuck),
            // but one already there must be free to move along and out of it.
            // Blocking both directions strands a mob in the corner, where every
            // cardinal neighbour is also ring.
            const enteringBoundary =
              isBoundaryTile(level, targetTileX, targetTileY) &&
              !isBoundaryTile(level, Math.floor(entity.pos.x), Math.floor(entity.pos.y));
            const canMove = !targetInBounds
              ? false
              : targetIsWall
                ? entity.canPhase &&
                  !enteringBoundary &&
                  phaseCanEnterTile({
                    wallTilesTraversed: entity.wallTilesTraversed ?? 0,
                    targetIsWall: true,
                  })
                : true;
            if (!canMove && entity.canPhase) {
              // Refused while phasing: clear the budget so the mob is free to
              // surface on its next tick instead of retrying the same step
              // forever.
              updatedEntity.wallTilesTraversed = 0;
            }
            if (canMove) {
              {
                // Check if target tile is the exit - mobs cannot occupy exit tile
                const tileX = Math.floor(nextPos.x);
                const tileY = Math.floor(nextPos.y);
                const exitPos = levelRef.current.exitPos;
                if (tileX === exitPos.x && tileY === exitPos.y) {
                  // Block movement onto exit tile
                  return updatedEntity;
                }
                
                // Check for mob collision - prevent stacking unless one can phase or one is stationary
                const occupants = getMobOccupancy().get(occupancyKey(tileX, tileY));
                const targetMob = occupants?.find(e => e.id !== entity.id) ?? null;
                
                // Allow movement if no mobs at target, or if stacking is allowed
                let canStack = true;
                if (targetMob) {
                  // Check if stacking is allowed: moving mob can phase OR target mob is stationary
                  canStack = entity.canPhase || (targetMob.isStationary === true);
                }
                
                if (canStack) {
                  const stepDx = nextPos.x - entity.pos.x;
                  const stepDy = nextPos.y - entity.pos.y;
                  // Surfacing is a tell, not a hit: stamp it so the melee gate
                  // can hold the mob for a readable beat.
                  if (isEmergingStep(entity.wallTilesTraversed ?? 0, targetIsWall)) {
                    updatedEntity.phaseEmergedAt = now;
                  }
                  updatedEntity.pos = nextPos;
                  updatedEntity.wallTilesTraversed = nextWallTilesTraversed(
                    entity.wallTilesTraversed ?? 0,
                    targetIsWall,
                  );
                  // A diagonal step covers √2 tiles, so it costs √2 delays.
                  // Cardinal steps still carry 0, exactly as before.
                  enemyMoveTimersRef.current.set(
                    entity.id,
                    nextMoveTimer(baseMoveDelay, stepDx, stepDy),
                  );
                }
              }
            }
          }
        }

        // Contact: does this mob reach the player, and may it swing?
        //
        // Both questions live in combat/mobContact.ts. What stays here is the
        // applying: hp, the cooldown stamp, sound, haptics, the event log and
        // the game-over path.
        const reach = mobReachesPlayer(updatedEntity, playerPosRef.current, levelRef.current);

        if (reach.reaches) {
          const outcome = resolveMobMeleeAttack({
            attacker: updatedEntity,
            now,
            lastDamageTime: enemyDamageCooldownRef.current.get(entity.id) || 0,
            attackerInWall: reach.attackerInWall,
            defense: getTotalDefense(loadoutRef.current),
            hp: baseStats.hp,
            maxHp: baseStats.maxHp,
            sector: state.currentLevel,
            claimSlot: (cadenceMs) => claimAttackSlot(updatedEntity, now, cadenceMs),
          });

          if (outcome.kind === 'hit') {
            if (outcome.comboCount !== undefined) {
              // Mark this combo count as having dealt damage
              updatedEntity.lastDamageComboCount = outcome.comboCount;
            }
            if (outcome.countsAgainstCycle) {
              updatedEntity.bossPhaseHits = (updatedEntity.bossPhaseHits ?? 0) + 1;
            }

            enemyDamageCooldownRef.current.set(entity.id, now);
            audioManager.playSound('damage');
            haptic('medium');
            statsRef.current = { ...statsRef.current, hp: outcome.newHp };
            queueStatsUpdate({ hp: outcome.newHp });

            const enemyTypeName = formatEntityName(entity.mobSubtype, entity.isBoss);
            eventLogger.logEvent('combat', `Took ${outcome.damage} damage from ${enemyTypeName}`, {
              damage: outcome.damage,
              enemyType: entity.mobSubtype,
              // The tri-bite's event carried `isBoss` and the ordinary one did
              // not. Preserved rather than tidied: unifying a logged payload is
              // still a change, and this PR is an extraction.
              ...(outcome.comboCount !== undefined ? { isBoss: entity.isBoss } : {}),
              hp: outcome.newHp,
              maxHp: baseStats.maxHp,
            });

            if (outcome.newHp <= 0 && !gameOverTriggeredRef.current) {
              gameOverTriggeredRef.current = true;
              audioManager.playSound('gameOver');
              audioManager.stopMusic();
              onGameOver();
            }
          }
        }
        // No `else` clearing the cooldown here. Dropping the entry on every
        // loss of contact made `attackCooldown` a floor only while contact was
        // continuous, so any oscillating mob could launder its own cadence.
        // The entry is released in `releaseMobBookkeeping` when the mob leaves
        // the level, and cleared wholesale on sector change.

        return updatedEntity;
      }
      return entity;
    });
    
    // A boss calls for help as it loses ground, rather than arriving with a
    // random pack. `addsDueAt` is a running total, so crossing two thresholds
    // in one tick spawns two and nothing can double-fire.
    if (levelRef.current.isBoss) {
      const boss = updatedEntities.find((e) => e.type === 'boss_enemy');
      if (boss && boss.maxHp > 0) {
        const due = addsDueAt(boss.hp / boss.maxHp, state.currentLevel);
        while (bossAddsSpawnedRef.current < due) {
          const add = spawnMobEntity(
            levelRef.current,
            'cerberus',
            findAddSpawn(boss.pos),
            state.currentLevel,
            statsRef.current,
            loadoutRef.current,
          );
          bossAddsSpawnedRef.current += 1;
          if (!add) break;
          add.id = `boss-add-${bossAddsSpawnedRef.current}`;
          updatedEntities.push(add);
          audioManager.playSound('attack');
        }
      }
    }

    // Update entities array with new array (no mutation)
    levelRef.current.entities = updatedEntities;
    
    // Cleanup: Remove dead entities (killed by friendly fire or other means)
    const deadEntities = levelRef.current.entities.filter(e => 
      (e.type === 'enemy' || e.type === 'boss_enemy') && e.hp <= 0
    );
    
    if (deadEntities.length > 0) {
      deadEntities.forEach(enemy => {
        // Store boss death position for exit placement
        const bossDeathPos = enemy.isBoss ? { x: Math.floor(enemy.pos.x), y: Math.floor(enemy.pos.y) } : null;
        
        // Play death sound (no coin sound - friendly fire kills don't reward player)
        audioManager.playSound('enemyDeath');
        
        // Log kill event (for entities that died from other causes)
        const enemyTypeName = formatEntityName(enemy.mobSubtype, enemy.isBoss);
        eventLogger.logEvent('combat', `Defeated ${enemyTypeName}`, {
          enemyType: enemy.mobSubtype,
          isBoss: enemy.isBoss
        });
        
        // If boss was defeated, place exit at boss death location
        if (enemy.isBoss && bossDeathPos && levelRef.current) {
          const exitX = bossDeathPos.x;
          const exitY = bossDeathPos.y;
          
          // Ensure position is within bounds and is a floor tile
          if (exitX >= 0 && exitX < levelRef.current.width && 
              exitY >= 0 && exitY < levelRef.current.height &&
              levelRef.current.tiles[exitY] &&
              (levelRef.current.tiles[exitY][exitX] === 'floor' || levelRef.current.tiles[exitY][exitX] === 'wall')) {
            // Set the tile to exit (convert wall to floor first if needed)
            if (levelRef.current.tiles[exitY][exitX] === 'wall') {
              levelRef.current.tiles[exitY][exitX] = 'floor';
            }
            levelRef.current.tiles[exitY][exitX] = 'exit';
            invalidateLosCache(levelRef.current);
            // Update exit position
            levelRef.current.exitPos = { x: exitX, y: exitY };
          }
          
          // Log boss defeat event
          const bossName = formatEntityName(enemy.mobSubtype, true);
          eventLogger.logEvent('progression', `Boss ${bossName} defeated`, {
            bossType: enemy.mobSubtype
          });
        }
      });
      
      // Remove dead entities
      deadEntities.forEach(enemy => releaseMobBookkeeping(enemy.id));
      levelRef.current.entities = levelRef.current.entities.filter(e => 
        !((e.type === 'enemy' || e.type === 'boss_enemy') && e.hp <= 0)
      );
    }
    } finally {
      flushGameLoopBatch(dispatch);
    }
  };

  const draw = () => {
    let restoreShadowGate: (() => void) | null = null;
    // Wrap entire draw function in try-catch to ensure it always completes
    try {
      const canvas = canvasRef.current;
      if (!canvas || !levelRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const frame = getFrameSnapshot();
      const effectiveQuality = resolveRenderQuality(
        settingsRef.current.renderQuality ?? 'auto',
        frame.isMobileViewport,
      );
      restoreShadowGate = installShadowQualityGate(ctx, effectiveQuality);

    // Get color theme for current level (changes every 4 sectors)
    const theme = getThemeForLevel(state.currentLevel);
    const { logicalWidth, logicalHeight, dpr } = canvasSizeRef.current;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    // Use visual position for camera to follow smooth movement; the player is
    // pinned to the screen anchor (centred horizontally; lifted above centre on mobile).
    const camX = visualPosRef.current.x * TILE_SIZE - frame.playerScreenX + TILE_SIZE / 2;
    const camY = visualPosRef.current.y * TILE_SIZE - frame.playerScreenY + TILE_SIZE / 2;

    const perspective = createPerspectiveCamera({
      player: visualPosRef.current,
      width: logicalWidth,
      height: logicalHeight,
      stableHeight: stableViewportRef.current?.height,
      isMobile: frame.isMobileViewport,
      tileSize: TILE_SIZE,
    });
    renderedCameraRef.current = { perspective, perspectiveEnabled: settingsRef.current.gameplayView === 'perspective', legacyOffset: { x: camX, y: camY } };
    if (settingsRef.current.gameplayView === 'perspective') {
      const drawNow = getGameNow();
      const visibility = perspectiveFog.prepare(perspective, frame.fogRadius / TILE_SIZE, effectiveQuality);
      const entities = perspectiveEntities.prepare(levelRef.current, perspective, effectiveQuality,
        drawNow, !!activeScrollEffectsRef.current.phasing?.active,
        perspectiveEffects.prepare(levelRef.current, drawNow, effectiveQuality, exitPathHintRef.current,
          perspectiveLandmarks.prepare(levelRef.current, theme.floor, stairsImageCache.img, drawNow)));
      voxelWorld.draw(ctx, perspective, levelRef.current, theme, effectiveQuality,
        perspectiveProjectiles.prepare(levelRef.current.projectiles, effectiveQuality,
          perspectiveItems.prepare(levelRef.current.items, entities)), visibility);
      perspectiveEntities.drawDamageNumbers(ctx, perspective, levelRef.current, drawNow, visibility);
      drawPerspectiveSenses(ctx, perspective, levelRef.current, frame.visionRadiusPx / TILE_SIZE,
        !!activeScrollEffectsRef.current.threatSense, !!activeScrollEffectsRef.current.lootSense,
        drawNow, effectiveQuality);
      if (perfMonitor.isActive()) perfMonitor.recordDrawnEntities(perspectiveEntities.drawnEntities);
      if (isGamePaused()) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
      }
      return;
    }

    ctx.save();
    ctx.translate(-camX, -camY);

    // Draw Map — static wall/floor from tile cache; exit stairs drawn separately
    const startCol = Math.max(0, Math.floor(camX / TILE_SIZE));
    const endCol = Math.min(levelRef.current.width, startCol + (logicalWidth / TILE_SIZE) + 2);
    const startRow = Math.max(0, Math.floor(camY / TILE_SIZE));
    const endRow = Math.min(levelRef.current.height, startRow + (logicalHeight / TILE_SIZE) + 2);

    tileLayerCache.build(levelRef.current, theme, String(state.currentLevel));
    tileLayerCache.drawVisibleRegion(ctx, camX, camY, logicalWidth, logicalHeight);

    if (exitPathHintRef.current.length > 0) {
      const pulse = 0.28 + 0.14 * Math.sin(getGameNow() / 260);
      ctx.save();
      ctx.fillStyle = `rgba(5, 217, 232, ${pulse})`;
      for (const step of exitPathHintRef.current.slice(0, 10)) {
        const tileX = step.x * TILE_SIZE;
        const tileY = step.y * TILE_SIZE;
        ctx.fillRect(tileX + 8, tileY + 8, TILE_SIZE - 16, TILE_SIZE - 16);
      }
      ctx.restore();
    }

    for (let y = startRow; y < endRow; y++) {
      for (let x = startCol; x < endCol; x++) {
        const tile = levelRef.current.tiles[y][x];
        if (tile !== 'exit') continue;
          const tileX = x * TILE_SIZE;
          const tileY = y * TILE_SIZE;
          
          // Draw floor background
          ctx.fillStyle = theme.floor;
          ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
          
          // Check if the tile above is a wall
          const tileAbove = y > 0 ? levelRef.current.tiles[y - 1][x] : null;
          const shouldRotate = tileAbove === 'wall';
          
          // Always use stairs.png image - never draw programmatic stairs
          if (stairsImageCache.img) {
            ctx.save();
            
            if (shouldRotate) {
              // Rotate 90 degrees to the left (counterclockwise)
              const centerX = tileX + TILE_SIZE / 2;
              const centerY = tileY + TILE_SIZE / 2;
              ctx.translate(centerX, centerY);
              ctx.rotate(-Math.PI / 2); // -90 degrees
              ctx.drawImage(stairsImageCache.img, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
            } else {
              ctx.drawImage(stairsImageCache.img, tileX, tileY, TILE_SIZE, TILE_SIZE);
            }
            
            // Apply color filter to match theme
            // Use 'color' blend mode to preserve luminance (brightness/contrast) while applying theme hue
            ctx.globalCompositeOperation = 'color';
            
            // Create a tint color based on the theme (use floor color as base)
            // Lighten it slightly to maintain better visibility
            const tintColor = theme.floor;
            ctx.fillStyle = tintColor;
            
            if (shouldRotate) {
              // Already translated and rotated, so draw at origin
              ctx.fillRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
            } else {
              ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            }
            
            // Reset composite operation
            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();
          } else {
            // Temporary placeholder only while image loads (should be very brief)
            const holePadding = 4;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(tileX + holePadding, tileY + holePadding, TILE_SIZE - holePadding * 2, TILE_SIZE - holePadding * 2);
            
            // Add glow effect around the hole
            setShadowTier('exit');
            ctx.shadowColor = COLORS.exit;
            ctx.shadowBlur = 8;
            ctx.strokeStyle = COLORS.exit;
            ctx.lineWidth = 1;
            ctx.strokeRect(tileX + holePadding, tileY + holePadding, TILE_SIZE - holePadding * 2, TILE_SIZE - holePadding * 2);
            ctx.shadowBlur = 0;
          }
      }
    }

    // Draw Particles (fading pixie trail for moth)
    try {
      if (levelRef.current.particles && levelRef.current.particles.length > 0) {
        levelRef.current.particles.forEach((particle: Particle) => {
          const age = getGameNow() - particle.createdAt;
          const lifetime = particle.lifetime;
          const alpha = 1 - (age / lifetime); // Fade out over lifetime
          
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.7)); // Max 70% opacity, fading
          ctx.fillStyle = COLORS.mob_moth;
          ctx.shadowColor = COLORS.mob_moth;
          ctx.shadowBlur = 6;
          const particleSize = 3; // Small pixie-like particles
          ctx.beginPath();
          ctx.arc(
            particle.pos.x * TILE_SIZE + TILE_SIZE / 2,
            particle.pos.y * TILE_SIZE + TILE_SIZE / 2,
            particleSize,
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
        });
      }
    } catch (error) {
      console.error('Error drawing particles:', error);
    }

    // Draw Afterimages (fading trails)
    try {
      if (levelRef.current.afterimages && levelRef.current.afterimages.length > 0) {
        levelRef.current.afterimages.forEach((afterimage: Afterimage) => {
          const age = getGameNow() - afterimage.createdAt;
          const lifetime = afterimage.lifetime;
          const alpha = 1 - (age / lifetime); // Fade out over lifetime
          
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.6)); // Max 60% opacity
          ctx.fillStyle = COLORS.mob_tracker;
          ctx.shadowColor = COLORS.mob_tracker;
          ctx.shadowBlur = 8;
          const trailSize = TILE_SIZE - 16;
          ctx.fillRect(
            afterimage.pos.x * TILE_SIZE + (TILE_SIZE - trailSize) / 2,
            afterimage.pos.y * TILE_SIZE + (TILE_SIZE - trailSize) / 2,
            trailSize,
            trailSize
          );
          ctx.shadowBlur = 0;
          ctx.restore();
        });
      }
    } catch (error) {
      console.error('Error drawing afterimages:', error);
    }

    // Draw Footprints (fading foot-shaped prints)
    try {
      if (levelRef.current.footprints && levelRef.current.footprints.length > 0) {
        levelRef.current.footprints.forEach((footprint: Footprint) => {
          const age = getGameNow() - footprint.createdAt;
          const lifetime = footprint.lifetime;
          const alpha = 1 - (age / lifetime); // Fade out over lifetime
          
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.6)); // Max 60% opacity for shadows
          
          // Calculate rotation angle based on movement direction
          const angle = Math.atan2(footprint.direction.y, footprint.direction.x);
          
          // Position in screen coordinates
          const screenX = footprint.pos.x * TILE_SIZE;
          const screenY = footprint.pos.y * TILE_SIZE;
          const centerX = screenX + TILE_SIZE / 2;
          const centerY = screenY + TILE_SIZE / 2;
          
          // Calculate perpendicular direction for left/right offset
          // Perpendicular to movement direction (90 degrees rotated)
          const perpAngle = angle + Math.PI / 2;
          const offsetDistance = TILE_SIZE * 0.15; // Offset from center
          const offsetX = Math.cos(perpAngle) * offsetDistance;
          const offsetY = Math.sin(perpAngle) * offsetDistance;
          
          // Position left foot on left side, right foot on right side
          // For left foot, offset in negative perpendicular direction
          // For right foot, offset in positive perpendicular direction
          const footprintX = centerX + (footprint.isLeftFoot ? -offsetX : offsetX);
          const footprintY = centerY + (footprint.isLeftFoot ? -offsetY : offsetY);
          
          // Draw foot shape
          ctx.translate(footprintX, footprintY);
          ctx.rotate(angle);
          
          // Use dark shadow color
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Dark shadow color
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.lineWidth = 1;
          
          // Draw actual foot shape (left or right)
          const footLength = TILE_SIZE * 0.35;
          const footWidth = TILE_SIZE * 0.2;
          const toeWidth = TILE_SIZE * 0.15;
          const heelWidth = TILE_SIZE * 0.12;
          
          ctx.beginPath();
          
          if (footprint.isLeftFoot) {
            // Left foot shape - outer edge on left, inner edge on right
            // Toe area (front, wider)
            ctx.moveTo(footLength / 2, -toeWidth / 2);
            ctx.lineTo(footLength / 2, toeWidth / 2);
            // Outer edge (left side - curves outward)
            ctx.quadraticCurveTo(footLength / 3, -footWidth / 2, -footLength / 3, -heelWidth / 2);
            // Heel (back, narrower)
            ctx.lineTo(-footLength / 2, -heelWidth / 2);
            ctx.lineTo(-footLength / 2, heelWidth / 2);
            // Inner edge (right side - curves inward)
            ctx.quadraticCurveTo(-footLength / 3, footWidth / 2, footLength / 3, toeWidth / 2);
            ctx.closePath();
          } else {
            // Right foot shape - outer edge on right, inner edge on left (mirrored)
            // Toe area (front, wider)
            ctx.moveTo(footLength / 2, -toeWidth / 2);
            ctx.lineTo(footLength / 2, toeWidth / 2);
            // Outer edge (right side - curves outward)
            ctx.quadraticCurveTo(footLength / 3, footWidth / 2, -footLength / 3, heelWidth / 2);
            // Heel (back, narrower)
            ctx.lineTo(-footLength / 2, heelWidth / 2);
            ctx.lineTo(-footLength / 2, -heelWidth / 2);
            // Inner edge (left side - curves inward)
            ctx.quadraticCurveTo(-footLength / 3, -footWidth / 2, footLength / 3, -toeWidth / 2);
            ctx.closePath();
          }
          
          ctx.fill();
          ctx.stroke();
          
          ctx.restore();
        });
      }
    } catch (error) {
      console.error('Error drawing footprints:', error);
    }

    // Draw Projectiles (wrap in try-catch to prevent rendering errors from blocking draw)
    try {
      if (levelRef.current.projectiles && levelRef.current.projectiles.length > 0) {
        levelRef.current.projectiles.forEach((projectile: Projectile) => {
          // Use different color for shadow pulse
          if (projectile.isShadowPulse) {
            ctx.fillStyle = COLORS.mob_moth;
            ctx.shadowColor = COLORS.mob_moth;
          } else {
            ctx.fillStyle = COLORS.projectile;
            ctx.shadowColor = COLORS.projectile;
          }
          ctx.shadowBlur = 5;
          const projSize = 6;
          ctx.fillRect(
            projectile.pos.x * TILE_SIZE + TILE_SIZE / 2 - projSize / 2,
            projectile.pos.y * TILE_SIZE + TILE_SIZE / 2 - projSize / 2,
            projSize,
            projSize
          );
          ctx.shadowBlur = 0;
        });
      }
    } catch (error) {
      console.error('Error drawing projectiles:', error);
      // Continue rendering even if projectiles fail
    }

    // Draw Entities with unique appearances. Mobs well outside the camera are
    // skipped; the margin is the longest mob attack reach plus slack, so a
    // telegraph aim line from an off-screen mob toward the player is never clipped.
    const ENTITY_CULL_MARGIN = TILE_SIZE * (MAX_MOB_RANGE_TILES + 2);
    const cullMinX = camX - ENTITY_CULL_MARGIN;
    const cullMaxX = camX + logicalWidth + ENTITY_CULL_MARGIN;
    const cullMinY = camY - ENTITY_CULL_MARGIN;
    const cullMaxY = camY + logicalHeight + ENTITY_CULL_MARGIN;

    // Cull to the fog as well as the camera. The fog gradient reaches full
    // opacity at `fogRadius`, so anything past it was drawn and then painted
    // over — on a wide screen that is most of the sector's population.
    //
    // Only when the fog is actually opaque: a lightswitch reveal or a vision
    // boost lifts the fog entirely, so there the camera bound is the only one
    // that holds.
    //
    // Threat-sense used to disable this too, which cost the whole M7.1 saving
    // whenever the scroll was up — every distant mob's sprite was drawn in full
    // and then completely blacked out by opaque fog. Its marker is drawn later,
    // in screen space, *after* the fog blit, so it reveals those mobs on its
    // own and the wasted sprite pass buys nothing.
    const fogHidesDistantMobs =
      !lightswitchRevealEndTimeRef.current &&
      !temporaryVisionBoostRef.current;
    // One tile of slack so a mob is never popped out while still half-lit.
    const fogCullRadius = frame.fogRadius + TILE_SIZE;
    const fogCullRadiusSq = fogCullRadius * fogCullRadius;
    const playerPxX = playerPosRef.current.x * TILE_SIZE;
    const playerPxY = playerPosRef.current.y * TILE_SIZE;

    let drawnEntities = 0;

    levelRef.current.entities.forEach(entity => {
      const entityPx = entity.pos.x * TILE_SIZE;
      const entityPy = entity.pos.y * TILE_SIZE;
      if (entityPx < cullMinX || entityPx > cullMaxX || entityPy < cullMinY || entityPy > cullMaxY) {
        return;
      }
      if (fogHidesDistantMobs) {
        const dx = entityPx - playerPxX;
        const dy = entityPy - playerPxY;
        if (dx * dx + dy * dy > fogCullRadiusSq) return;
      }
      drawnEntities++;
      setShadowTier(entity.isBoss ? 'boss' : 'generic');
      let color = COLORS.enemy;
      let size = TILE_SIZE - 8;
      
      // Determine color and size based on mob subtype
      if (entity.isBoss) {
        // Boss-specific colors
        if (entity.mobSubtype === 'boss_zeus') {
          color = COLORS.boss_zeus; // Electric cyan
        } else if (entity.mobSubtype === 'boss_hades') {
          color = COLORS.boss_hades; // Purple
        } else if (entity.mobSubtype === 'boss_ares') {
          color = COLORS.boss_ares; // Red
        } else {
          color = COLORS.boss; // Fallback to gold
        }
        size = TILE_SIZE - 4;
      } else if (entity.mobSubtype) {
        const subtypeKey = `mob_${entity.mobSubtype}` as keyof typeof COLORS;
        color = COLORS[subtypeKey] || COLORS.enemy;
        
        // Adjust size based on mob type
        if (entity.mobSubtype === 'swarm') {
          size = TILE_SIZE - 12; // Smaller
        } else if (entity.mobSubtype === 'moth') {
          size = TILE_SIZE - 18; // Even smaller for moth
        } else if (entity.mobSubtype === 'guardian' || entity.mobSubtype === 'turret' || entity.mobSubtype === 'cerberus') {
          size = TILE_SIZE - 6; // Larger
        }
      }
      
      // A mob's appearance is a pure function of subtype, size, colour, quality
      // and whether it is mid-charge, so it is rendered once per distinct look
      // and blitted thereafter. See renderer/mobArt.ts for the art itself.
      const spriteTier: ShadowTier = entity.isBoss ? 'boss' : 'generic';
      const sprite = mobSpriteCache.get(
        {
          subtype: entity.mobSubtype,
          isBoss: entity.isBoss === true,
          color,
          size,
          quality: effectiveQuality,
          charging: !!entity.chargeDirection,
        },
        spriteTier,
      );

      if (sprite) {
        mobSpriteCache.draw(ctx, sprite, entity.pos.x, entity.pos.y);
      } else {
        // Canvas allocation failed: draw straight to the screen rather than
        // showing nothing.
        ctx.save();
        drawMobArt(
          ctx,
          {
            subtype: entity.mobSubtype,
            isBoss: entity.isBoss === true,
            centerX: entity.pos.x * TILE_SIZE + TILE_SIZE / 2,
            centerY: entity.pos.y * TILE_SIZE + TILE_SIZE / 2,
            color,
            size,
            quality: effectiveQuality,
            charging: !!entity.chargeDirection,
          },
          strokeGlowCircle,
        );
        ctx.restore();
      }
      
      const drawNow = getGameNow();
      const entityCenterX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
      const entityCenterY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;

      if (entity.attackTelegraphUntil && drawNow < entity.attackTelegraphUntil && entity.attackTelegraphVelocity) {
        const telegraphDuration =
          entity.attackTelegraphMs ??
          (entity.isBoss || entity.mobSubtype === 'boss_zeus'
            ? BOSS_RANGED_TELEGRAPH_MS
            : RANGED_TELEGRAPH_MS);
        const progress = Math.min(1, 1 - (entity.attackTelegraphUntil - drawNow) / telegraphDuration);
        const lineLen = TILE_SIZE * (1.1 + progress * 2.2);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 80, 120, ${0.35 + progress * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(entityCenterX, entityCenterY);
        ctx.lineTo(
          entityCenterX + entity.attackTelegraphVelocity.x * lineLen,
          entityCenterY + entity.attackTelegraphVelocity.y * lineLen,
        );
        ctx.stroke();
        ctx.restore();
      }

      if (entity.hitFlashUntil && drawNow < entity.hitFlashUntil) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(entity.pos.x * TILE_SIZE + 2, entity.pos.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        ctx.restore();
      }

      // Health bar (always fully opaque)
      ctx.fillStyle = '#ff0000';
      const barWidth = TILE_SIZE - 4;
      const barHeight = 3;
      ctx.fillRect(entity.pos.x * TILE_SIZE + 2, entity.pos.y * TILE_SIZE + 2, barWidth, barHeight);
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(entity.pos.x * TILE_SIZE + 2, entity.pos.y * TILE_SIZE + 2, (entity.hp / entity.maxHp) * barWidth, barHeight);
    });

    if (perfMonitor.isActive()) {
      perfMonitor.recordDrawnEntities(drawnEntities);
    }

    if (levelRef.current.damageNumbers?.length) {
      const drawNow = getGameNow();
      levelRef.current.damageNumbers.forEach((entry) => {
        const age = drawNow - entry.createdAt;
        const t = Math.min(1, age / entry.lifetime);
        const alpha = 1 - t;
        const yOffset = t * 20;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = entry.isCrit ? '#ffd700' : '#f8fafc';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          String(entry.amount),
          entry.pos.x * TILE_SIZE + TILE_SIZE / 2,
          entry.pos.y * TILE_SIZE + 8 - yOffset,
        );
        ctx.restore();
      });
    }

    // Draw Items (PNG icons only, no background)
    levelRef.current.items.forEach(({ pos, item }) => {
      const itemSize = TILE_SIZE - 12;
      const offset = (TILE_SIZE - itemSize) / 2;
      
      // Draw item icon based on type (using PNG images)
      const iconX = pos.x * TILE_SIZE + offset;
      const iconY = pos.y * TILE_SIZE + offset;
      
      if (item.type === 'weapon') {
        drawWeaponIcon(ctx, iconX, iconY, itemSize, item);
      } else if (item.type === 'armor') {
        drawArmorIcon(ctx, iconX, iconY, itemSize, item);
      } else if (item.type === 'utility') {
        drawUtilityIcon(ctx, iconX, iconY, itemSize, item);
      } else if (item.type === 'consumable') {
        drawConsumableIcon(ctx, iconX, iconY, itemSize, item);
      }
    });

    // Draw Portals (glow and particles)
    if (levelRef.current && levelRef.current.portals) {
      levelRef.current.portals.forEach(portal => {
      const centerX = portal.pos.x * TILE_SIZE + TILE_SIZE / 2;
      const centerY = portal.pos.y * TILE_SIZE + TILE_SIZE / 2;
      const portalSize = TILE_SIZE * 0.8;
      const time = getGameNow() * 0.003; // Slow animation
      
      // Outer glow (pulsing)
      const glowRadius = portalSize / 2 + Math.sin(time) * 3;
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
      gradient.addColorStop(0, 'rgba(100, 50, 255, 0.8)');
      gradient.addColorStop(0.5, 'rgba(150, 100, 255, 0.4)');
      gradient.addColorStop(1, 'rgba(200, 150, 255, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner portal ring
      ctx.strokeStyle = '#9B59FF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, portalSize / 2 - 5, 0, Math.PI * 2);
      ctx.stroke();
      
      // Portal center (void effect)
      ctx.fillStyle = '#6C3483';
      ctx.beginPath();
      ctx.arc(centerX, centerY, portalSize / 2 - 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Generate particles (bright fading particles)
      if (levelRef.current) {
        // Add new particles occasionally
        if (Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.5 + Math.random() * 0.5;
          const particle = {
            id: `portal-particle-${getGameNow()}-${Math.random().toString(36).substr(2, 9)}`,
            pos: {
              x: centerX + Math.cos(angle) * (portalSize / 2 - 5),
              y: centerY + Math.sin(angle) * (portalSize / 2 - 5),
            },
            createdAt: getGameNow(),
            lifetime: 1000 + Math.random() * 500, // 1-1.5 seconds
            velocity: {
              x: Math.cos(angle) * speed,
              y: Math.sin(angle) * speed,
            },
          };
          spawnLegacyEffect(legacyEffectsRef.current, particle as never, isGamePaused());
        }
        
        // Draw existing particles. Ageing and expiry are the field's job now;
        // this pass only paints what survived.
        {
          const now = getGameNow();
          stepLegacyEffects(legacyEffectsRef.current, now);
          for (const p of effectsWithPrefix(legacyEffectsRef.current, 'portal-particle-')) {
            const alpha = 1 - (now - p.createdAt) / p.lifetime;
            ctx.fillStyle = `rgba(255, 200, 255, ${alpha})`;
            ctx.shadowColor = 'rgba(255, 200, 255, 0.8)';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }
      });
    }

    // Draw Lightswitches
    if (levelRef.current && levelRef.current.lightswitches) {
      levelRef.current.lightswitches.forEach(lightswitch => {
        if (!lightswitch.activated) {
          const centerX = lightswitch.pos.x * TILE_SIZE + TILE_SIZE / 2;
          const centerY = lightswitch.pos.y * TILE_SIZE + TILE_SIZE / 2;
          const switchSize = TILE_SIZE * 0.6;
          
          // Lightswitch base (yellow/white glow)
          ctx.fillStyle = '#FFD700';
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 10;
          ctx.fillRect(
            centerX - switchSize / 2,
            centerY - switchSize / 2,
            switchSize,
            switchSize
          );
          ctx.shadowBlur = 0;
          
          // Lightswitch indicator (small circle)
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(centerX, centerY, switchSize / 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Draw Player at visual position for smooth animation
    setShadowTier('player');
    const isPhasing = activeScrollEffectsRef.current.phasing && activeScrollEffectsRef.current.phasing.active;
    
    // Visual indicator for phasing (semi-transparent with glow)
    if (isPhasing) {
      ctx.globalAlpha = 0.7;
      ctx.shadowColor = '#9B59FF';
      ctx.shadowBlur = 20;
    }
    
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(visualPosRef.current.x * TILE_SIZE + 6, visualPosRef.current.y * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 15;
    ctx.fillStyle = 'white';
    ctx.fillRect(visualPosRef.current.x * TILE_SIZE + 10, visualPosRef.current.y * TILE_SIZE + 10, TILE_SIZE - 20, TILE_SIZE - 20);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;

    if (effectiveQuality === 'low') {
      const playerX = visualPosRef.current.x * TILE_SIZE + 6;
      const playerY = visualPosRef.current.y * TILE_SIZE + 6;
      const playerSize = TILE_SIZE - 12;
      strokeGlowRect(ctx, playerX, playerY, playerSize, playerSize, COLORS.player, 2);
    }

    ctx.restore();

    // Spotlight + Fog — cached offscreen gradient, rebuilt only when vision/size changes
    fogLayerCache.draw(ctx, {
      logicalWidth: frame.logicalWidth,
      logicalHeight: frame.logicalHeight,
      dpr,
      centerX: frame.fogCenterX,
      centerY: frame.fogCenterY,
      radius: frame.fogRadius,
    });

    // Draw Scroll Sense Effects (above spotlight overlay)
    // Threat-sense: Show all enemies, Loot-sense: Show all items
    if (levelRef.current && (activeScrollEffectsRef.current.threatSense || activeScrollEffectsRef.current.lootSense)) {
      ctx.save();
      
      // Player screen position (same anchor the camera and fog use)
      const playerScreenX = frame.playerScreenX;
      const playerScreenY = frame.playerScreenY;
      const visionRadius = frame.visionRadiusPx;
      
      // Draw Threat-sense: All enemies
      if (activeScrollEffectsRef.current.threatSense) {
        // Track entities that are in range to remove their particles
        const entitiesInRange: Array<{ x: number; y: number }> = [];
        
        levelRef.current.entities.forEach(entity => {
          if (entity.type === 'enemy' || entity.type === 'boss_enemy') {
            const entityScreenX = (entity.pos.x - visualPosRef.current.x) * TILE_SIZE + playerScreenX;
            const entityScreenY = (entity.pos.y - visualPosRef.current.y) * TILE_SIZE + playerScreenY;
            const distFromPlayer = Math.sqrt(
              Math.pow(entityScreenX - playerScreenX, 2) + Math.pow(entityScreenY - playerScreenY, 2)
            );
            
            // Marker only where the fog actually hides the mob.
            //
            // This used to be `distFromPlayer > visionRadius`, but `visionRadius`
            // is where the fog reaches *full* opacity — not where it starts to
            // hide anything. The lit spotlight is roughly the inner 70%, so the
            // old gate stamped a marker over every mob in the lit disc and the
            // whole falloff, covering the very art the player could already see.
            const isOutsideRange = needsThreatMarker(distFromPlayer, visionRadius);
            
            if (isOutsideRange) {
              // Draw blurred entity with sparkling particles
              ctx.save();
              ctx.filter = 'blur(3px)';
              ctx.globalAlpha = 0.6;
              
              // Draw entity (simplified representation)
              const size = TILE_SIZE * 0.6;
              ctx.fillStyle = '#ff4444';
              ctx.beginPath();
              ctx.arc(entityScreenX, entityScreenY, size / 2, 0, Math.PI * 2);
              ctx.fill();
              
              ctx.restore();
              
              // Add sparkling particles
              if (Math.random() < 0.1 && levelRef.current) {
                const angle = Math.random() * Math.PI * 2;
                const sparkle = {
                  id: `threatsense-sparkle-${getGameNow()}-${Math.random().toString(36).substr(2, 9)}`,
                  pos: {
                    x: entityScreenX + Math.cos(angle) * (size / 2),
                    y: entityScreenY + Math.sin(angle) * (size / 2),
                  },
                  createdAt: getGameNow(),
                  lifetime: 500 + Math.random() * 300,
                };
                spawnLegacyEffect(legacyEffectsRef.current, sparkle as never, isGamePaused());
              }
            } else {
              // Thin enough fog that the real sprite reads: draw nothing. The
              // old code stamped an opaque #ff4444 disc here too — the comment
              // said "ensure it's fully visible", but it was covering the mob's
              // own art, colour and health bar with a flat red circle.
              //
              // Still tracked, so the sparkle particles from when this mob was
              // out of range get cleaned up as it comes into view.
              entitiesInRange.push({ x: entityScreenX, y: entityScreenY });
            }
          }
        });
        
        // Remove particles near entities that are now in range
        clearEffectsNear(
          legacyEffectsRef.current,
          'threatsense-sparkle-',
          entitiesInRange,
          TILE_SIZE * 1.5,
        );
      }
      
      // Draw Loot-sense: All items
      if (activeScrollEffectsRef.current.lootSense) {
        // Track items that are in range to remove their particles
        const itemsInRange: Array<{ x: number; y: number }> = [];
        
        levelRef.current.items.forEach(({ pos, item }) => {
          const itemScreenX = (pos.x - visualPosRef.current.x) * TILE_SIZE + playerScreenX;
          const itemScreenY = (pos.y - visualPosRef.current.y) * TILE_SIZE + playerScreenY;
          const distFromPlayer = Math.sqrt(
            Math.pow(itemScreenX - playerScreenX, 2) + Math.pow(itemScreenY - playerScreenY, 2)
          );
          
          // Check if item is outside visible range
          const isOutsideRange = distFromPlayer > visionRadius;
          
          if (isOutsideRange) {
            // Draw blurred item with sparkling particles
            ctx.save();
            ctx.filter = 'blur(3px)';
            ctx.globalAlpha = 0.6;
            
            // Draw item icon using proper icon functions
            const itemSize = TILE_SIZE - 12;
            const offset = (TILE_SIZE - itemSize) / 2;
            const iconX = itemScreenX - TILE_SIZE / 2 + offset;
            const iconY = itemScreenY - TILE_SIZE / 2 + offset;
            
            if (item.type === 'weapon') {
              drawWeaponIcon(ctx, iconX, iconY, itemSize, item);
            } else if (item.type === 'armor') {
              drawArmorIcon(ctx, iconX, iconY, itemSize, item);
            } else if (item.type === 'utility') {
              drawUtilityIcon(ctx, iconX, iconY, itemSize, item);
            } else if (item.type === 'consumable') {
              drawConsumableIcon(ctx, iconX, iconY, itemSize, item);
            }
            
            ctx.restore();
            
            // Add sparkling particles
            if (Math.random() < 0.1 && levelRef.current) {
              const angle = Math.random() * Math.PI * 2;
              const sparkle = {
                id: `lootsense-sparkle-${getGameNow()}-${Math.random().toString(36).substr(2, 9)}`,
                pos: {
                  x: itemScreenX + Math.cos(angle) * (itemSize / 2),
                  y: itemScreenY + Math.sin(angle) * (itemSize / 2),
                },
                createdAt: getGameNow(),
                lifetime: 500 + Math.random() * 300,
              };
              spawnLegacyEffect(legacyEffectsRef.current, sparkle as never, isGamePaused());
            }
          } else {
            // Item is in range - ensure it's fully visible with no blur, no particles, no rarity color effects
            ctx.save();
            ctx.filter = 'none'; // Explicitly clear blur
            ctx.globalAlpha = 1.0; // Full opacity
            ctx.shadowBlur = 0; // Clear any shadow effects
            ctx.shadowColor = 'transparent'; // Clear shadow color
            
            // Draw item icon using proper icon functions
            const itemSize = TILE_SIZE - 12;
            const offset = (TILE_SIZE - itemSize) / 2;
            const iconX = itemScreenX - TILE_SIZE / 2 + offset;
            const iconY = itemScreenY - TILE_SIZE / 2 + offset;
            
            if (item.type === 'weapon') {
              drawWeaponIcon(ctx, iconX, iconY, itemSize, item);
            } else if (item.type === 'armor') {
              drawArmorIcon(ctx, iconX, iconY, itemSize, item);
            } else if (item.type === 'utility') {
              drawUtilityIcon(ctx, iconX, iconY, itemSize, item);
            } else if (item.type === 'consumable') {
              drawConsumableIcon(ctx, iconX, iconY, itemSize, item);
            }
            
            ctx.restore();
            
            // Track this item's position to remove nearby particles
            itemsInRange.push({ x: itemScreenX, y: itemScreenY });
          }
        });
        
        // Remove particles near items that are now in range
        if (levelRef.current && levelRef.current.particles && itemsInRange.length > 0) {
          clearEffectsNear(
            legacyEffectsRef.current,
            'lootsense-sparkle-',
            itemsInRange,
            TILE_SIZE * 1.5,
          );
        }
      }
      
      // Draw sparkling particles for sense effects
      {
        const particleNow = getGameNow();
        stepLegacyEffects(legacyEffectsRef.current, particleNow);
        const sense = effectsWithPrefix(
          legacyEffectsRef.current,
          'threatsense-sparkle-',
          'lootsense-sparkle-',
        );
        for (const p of sense) {
          const alpha = 1 - (particleNow - p.createdAt) / p.lifetime;
          ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
          ctx.shadowColor = 'rgba(255, 255, 200, 0.8)';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.pos.x, p.pos.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      
      ctx.restore();
    }

    // Mobile sector timer is rendered in HUD (SectorTimerBar) to avoid browser chrome overlap.

    // Frozen run: dim the world so the pause is visible even when the dialog that
    // caused it is small (menu dropdown) or off to one side. The PAUSED badge is
    // DOM (PauseIndicator) so it stays crisp under the HUD scale.
    if (isGamePaused()) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    }

    // CRT Scanlines overlay is now handled by GameOverlay component
    // to ensure consistent application across canvas and React UI elements
    } catch (error) {
      // If draw fails, log error but don't block the game loop
      console.error('Error in draw function:', error);
    } finally {
      restoreShadowGate?.();
    }
  };

  updateFnRef.current = update;
  drawFnRef.current = draw;

  // Game loop — stable deps; reads input from gameInputDirectionRef
  useEffect(() => {
    if (perfMonitor.isActive()) {
      perfMonitor.recordLoopRestart();
    }

    let animationFrameId = 0;
    let isFirstFrame = true;

    const loop = (time: number) => {
      if (!loopRunningRef.current || document.hidden) {
        return;
      }

      if (isFirstFrame) {
        lastTimeRef.current = time;
        isFirstFrame = false;
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      if (isGamePaused()) {
        lastTimeRef.current = time;
        // Still a new frame for the derived-stats memo: the canvas can be
        // resized while paused (browser chrome showing/hiding on phones) and the
        // camera anchor must follow the new dimensions immediately.
        frameCounterRef.current += 1;
        drawFnRef.current();
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      let deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const MAX_DELTA_TIME = 100;
      deltaTime = Math.min(deltaTime, MAX_DELTA_TIME);

      frameCounterRef.current += 1;
      const frameStart = performance.now();
      const updateStart = performance.now();
      updateFnRef.current(deltaTime);
      const updateMs = performance.now() - updateStart;
      const drawStart = performance.now();
      drawFnRef.current();
      const drawMs = performance.now() - drawStart;
      const frameMs = performance.now() - frameStart;
      if (perfMonitor.isActive()) {
        perfMonitor.recordFrame(frameMs, drawMs, updateMs);
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (loopRunningRef.current || document.hidden) return;
      loopRunningRef.current = true;
      isFirstFrame = true;
      animationFrameId = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      loopRunningRef.current = false;
      cancelAnimationFrame(animationFrameId);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
        void audioManager.suspend();
      } else {
        void audioManager.resume();
        startLoop();
      }
    };

    startLoop();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopLoop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleBonusSelect = (bonusType: string) => {
    if (!bonusSelectionRef.current) return;
    
    switch (bonusType) {
      case 'restore_health': {
        dispatch({ type: 'UPDATE_STATS', payload: { hp: statsRef.current.maxHp } });
        break;
      }
      case 'double_coins': {
        dispatch({ type: 'UPDATE_STATS', payload: { coins: statsRef.current.coins * 2 } });
        break;
      }
      case 'skip_shop': {
        let nextLevel = state.currentLevel;
        while (true) {
          nextLevel++;
          const isBoss = nextLevel % BOSS_INTERVAL === 0 && nextLevel > 0;
          const isShop = nextLevel % SHOP_INTERVAL === 0 && !isBoss;
          if (isShop) break;
        }
        // Set to one level before target, then complete to reach target
        dispatch({ type: 'SET_CURRENT_LEVEL', payload: nextLevel - 1 });
        bonusSelectionRef.current = null;
        setShowBonusSelection(false);
        onLevelComplete();
        return;
      }
      case 'skip_boss': {
        let nextLevel = state.currentLevel;
        while (nextLevel % BOSS_INTERVAL !== 0 || nextLevel === state.currentLevel) {
          nextLevel++;
        }
        // Set to one level before target, then complete to reach target
        dispatch({ type: 'SET_CURRENT_LEVEL', payload: nextLevel - 1 });
        bonusSelectionRef.current = null;
        setShowBonusSelection(false);
        onLevelComplete();
        return;
      }
      case 'mystery_box': {
        const randomItem = generateItem(state.currentLevel);
        // Record mystery box offer
        recordItemOffer(
          randomItem,
          state.currentLevel,
          'bonus',
          state.stats.coins,
          false // Not purchased, it's a bonus
        );
        dispatch({ type: 'ADD_ITEM', payload: randomItem });
        break;
      }
    }
    
    bonusSelectionRef.current = null;
    setShowBonusSelection(false);
    // Complete the level after bonus selection
    onLevelComplete();
  };

  const handleForgoReward = () => {
    bonusSelectionRef.current = null;
    setShowBonusSelection(false);
    // Complete the level without any reward
    onLevelComplete();
  };

  return (
    <div className="relative w-full h-full">
      <canvas 
        ref={canvasRef} 
        className="game-canvas absolute inset-0 w-full h-full touch-none"
        style={{ zIndex: 0 }}
      />
      <PerfOverlay visible={showPerfOverlay && perfMonitor.isActive()} />
      <GameOverlay />
      {showBonusSelection && bonusSelectionRef.current && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[199]">
          <div className="bg-[#1a1a2e] border-2 border-[#05d9e8] rounded-lg p-6 max-w-md w-full mx-4 relative">
            <button
              onClick={handleForgoReward}
              className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center"
              aria-label="Forgo reward"
            >
              ×
            </button>
            <h2 className="text-2xl font-bold text-[#05d9e8] mb-4 text-center">SECTOR CLEARED!</h2>
            <p className="text-white mb-6 text-center">Choose your bonus:</p>
            <div className="space-y-3">
              {bonusSelectionRef.current.options.map((option) => {
                const bonusNames: Record<string, string> = {
                  restore_health: 'Restore Health',
                  double_coins: 'Double Coins',
                  skip_shop: 'Skip to Next Vendor',
                  skip_boss: 'Skip to Next Boss',
                  mystery_box: 'Mystery Box',
                };
                const bonusDescriptions: Record<string, string> = {
                  restore_health: 'Restore HP to maximum',
                  double_coins: 'Double all coins earned from this maze',
                  skip_shop: 'Skip directly to the next vendor shop',
                  skip_boss: 'Skip directly to the next boss',
                  mystery_box: 'Receive a random item',
                };
                return (
                  <button
                    key={option}
                    onClick={() => handleBonusSelect(option)}
                    className="w-full bg-[#16213e] hover:bg-[#0f1625] border-2 border-[#05d9e8] rounded-lg p-4 text-left transition-colors"
                  >
                    <div className="text-[#05d9e8] font-bold text-lg">{bonusNames[option]}</div>
                    <div className="text-gray-300 text-sm mt-1">{bonusDescriptions[option]}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
