import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../../lib/store';
import { generateLevel, checkCollision, getEntitiesInRadius, hasLineOfSight, getAttackablePositions } from '../../lib/game/engine';
import { TILE_SIZE, COLORS, LEVEL_TIME_LIMIT, MODS, RARITY_COLORS, MOB_TYPES, SHOP_INTERVAL, BOSS_INTERVAL } from '../../lib/game/constants';
import { getThemeForLevel } from '../../lib/game/colorThemes';
import { Level, Position, Entity, Projectile, MobSubtype, Afterimage, Particle, Footprint } from '../../lib/game/types';
import { getEffectiveStats, getTotalDefense } from '../../lib/game/stats';
import { generateItem } from '../../lib/game/items';
import { recordItemOffer, getSoftAssistAdjustments, getOfferPowerMetrics } from '../../lib/game/itemEconomy';
import { getItemBaseName } from '../../lib/game/compendium-image-map';
import { audioManager } from '../../lib/audio';
import { eventLogger } from '../../lib/game/eventLogger';
import { GameOverlay } from './GameOverlay';
import { drawWeaponIcon, drawArmorIcon, drawUtilityIcon, drawConsumableIcon, preloadItemIcons } from '../../lib/game/itemIcons';

// Module-level cache for stairs image (persists across component instances)
const stairsImageCache: { img: HTMLImageElement | null; loading: boolean } = {
  img: null,
  loading: false
};

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
  inputDirection: { x: number; y: number };
  onGameOver: () => void;
  onLevelComplete: () => void;
  onTimeOut: () => void;
  gameOverState: { type: 'death' | 'timeout' } | null;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ inputDirection, onGameOver, onLevelComplete, onTimeOut, gameOverState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, dispatch } = useGame();
  
  const levelRef = useRef<Level | null>(null);
  const playerPosRef = useRef<Position>({ x: 0, y: 0 });
  const visualPosRef = useRef<Position>({ x: 0, y: 0 }); // Smooth interpolated visual position
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
  const lastFootprintPosRef = useRef<Position | null>(null); // Track last position where footprint was created
  const nextFootIsLeftRef = useRef<boolean>(true); // Track which foot to place next (alternating)
  const visionDebuffLevelRef = useRef<number>(0); // Track vision debuff level (0-1.0, where 1.0 = complete blindness)
  const lightswitchRevealEndTimeRef = useRef<number | null>(null); // Track when lightswitch reveal ends
  // Use refs to track current stats to avoid race conditions with async state updates
  const statsRef = useRef<typeof state.stats>(state.stats);
  const loadoutRef = useRef<typeof state.loadout>(state.loadout);
  const activeModsRef = useRef<string[]>(state.activeMods);
  const temporaryVisionBoostRef = useRef<typeof state.temporaryVisionBoost>(state.temporaryVisionBoost);
  const activeScrollEffectsRef = useRef<typeof state.activeScrollEffects>(state.activeScrollEffects);
  const canvasSizeRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  const lastPlayerPosRef = useRef<Position>({ x: 0, y: 0 });
  const previousEnemyIdsRef = useRef<Set<string>>(new Set());
  const bonusSelectionRef = useRef<{ options: string[] } | null>(null);
  const [showBonusSelection, setShowBonusSelection] = useState(false);
  
  // Calculate mod modifiers
  const getModifiers = () => {
    let modifiers = { enemyHp: 1, coinMult: 1, timerMult: 1, visionMult: 1, explosiveDeaths: false, autoReveal: false };
    state.activeMods.forEach(modId => {
      const mod = MODS.find(m => m.id === modId);
      if (mod?.modifiers) {
        Object.assign(modifiers, mod.modifiers);
      }
    });
    return modifiers;
  };

  // Apply vision debuff (stacks up to complete blindness)
  const applyVisionDebuff = (amount: number = 0.15) => {
    // Add to debuff level, capped at 1.0 (complete blindness)
    visionDebuffLevelRef.current = Math.min(1.0, visionDebuffLevelRef.current + amount);
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
  }, [state.stats, state.loadout, state.activeMods, state.temporaryVisionBoost, state.activeScrollEffects]);

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
    playerPosRef.current = { ...level.startPos };
    visualPosRef.current = { ...level.startPos };
    moveStartPosRef.current = { ...level.startPos };
    moveProgressRef.current = 1;
    lastPlayerPosRef.current = { ...level.startPos };
    levelStartTimeRef.current = Date.now();
    gameOverTriggeredRef.current = false;
    // Reset damage cooldowns when level changes
    enemyDamageCooldownRef.current.clear();
    enemyMoveTimersRef.current.clear();
    previousEnemyIdsRef.current = new Set(level.entities.map(e => e.id));
    projectileIdCounterRef.current = 0;
    afterimageIdCounterRef.current = 0;
    particleIdCounterRef.current = 0;
    visionDebuffLevelRef.current = 0;
    lightswitchRevealEndTimeRef.current = null;
    // Initialize afterimages array if not present
    if (!level.afterimages) {
      level.afterimages = [];
    }
    // Initialize particles array if not present
    if (!level.particles) {
      level.particles = [];
    }
    // Initialize footprints array if not present
    if (!level.footprints) {
      level.footprints = [];
    }
    // Reset footprint tracking
    lastFootprintPosRef.current = null;
    nextFootIsLeftRef.current = true; // Start with left foot
    // Reset bonus selection when level changes
    bonusSelectionRef.current = null;
    setShowBonusSelection(false);
    
    // Play combat music when entering a level
    if (state.screen === 'run') {
      audioManager.resume();
      if (level.isBoss) {
        audioManager.playMusic('boss');
      } else {
        audioManager.playMusic('combat');
      }
      
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
          eventLogger.logEvent('progression', `Boss ${bossEntity.mobSubtype} spawned`, {
            bossType: bossEntity.mobSubtype
          });
        }
      }
    }
  }, [state.currentLevel, state.screen]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvasSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    // Set initial size
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Game Loop
  useEffect(() => {
    let animationFrameId: number;
    let isFirstFrame = true;

    const loop = (time: number) => {
      // Initialize lastTimeRef on first frame to prevent huge deltaTime
      if (isFirstFrame) {
        lastTimeRef.current = time;
        isFirstFrame = false;
        animationFrameId = requestAnimationFrame(loop);
        return;
      }
      
      let deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;
      
      // Cap deltaTime to prevent frame rate spikes from affecting game logic
      // This ensures mobs don't move/attack faster when player speed changes
      const MAX_DELTA_TIME = 100; // Cap at 100ms (10 FPS minimum)
      deltaTime = Math.min(deltaTime, MAX_DELTA_TIME);

      update(deltaTime);
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [inputDirection]);

  // Helper function to check if a mob can move diagonally (flying mobs)
  const canMoveDiagonally = (entity: Entity): boolean => {
    // Phase mobs and moth mobs can move diagonally
    if (entity.mobSubtype === 'phase' || entity.mobSubtype === 'moth') {
      return true;
    }
    // Boss Hades can phase through walls, so it can move diagonally
    if (entity.mobSubtype === 'boss_hades' || entity.canPhase) {
      return true;
    }
    return false;
  };

  // Helper function to restrict movement to cardinal directions for non-flying mobs
  const restrictToCardinal = (dx: number, dy: number): { x: number; y: number } => {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // If both directions are non-zero (diagonal), choose the larger component
    if (absDx > 0 && absDy > 0) {
      if (absDx > absDy) {
        return { x: Math.sign(dx), y: 0 };
      } else if (absDy > absDx) {
        return { x: 0, y: Math.sign(dy) };
      } else {
        // Equal distance, prefer horizontal (can be changed to random or vertical)
        return { x: Math.sign(dx), y: 0 };
      }
    }
    
    // Already cardinal, return as-is
    return { x: Math.sign(dx), y: Math.sign(dy) };
  };

  // Helper function to check if a position is in a cardinal direction (reachable by non-flying mobs)
  const isInCardinalDirection = (fromPos: Position, toPos: Position): boolean => {
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    // Cardinal direction means either dx or dy is zero (or both, meaning same position)
    return dx === 0 || dy === 0;
  };

  // Helper function to calculate wall phase chance based on base chance and level
  const calculateWallPhaseChance = (baseChance: number): number => {
    const phaseChancePerLevel = 0.005; // 0.5% per level
    return Math.min(1.0, baseChance + (state.currentLevel * phaseChancePerLevel));
  };

  const update = (deltaTime: number) => {
    if (!levelRef.current) return;

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
    const now = Date.now();
    const PROJECTILE_LIFETIME = 3000; // 3 seconds
    
    // Decay vision debuff over time (reduces by 2% per second)
    if (visionDebuffLevelRef.current > 0) {
      const decayRate = 0.02 * (deltaTime / 1000); // 2% per second
      visionDebuffLevelRef.current = Math.max(0, visionDebuffLevelRef.current - decayRate);
    }

    // Check if temporary vision boost has expired
    if (temporaryVisionBoostRef.current && now >= temporaryVisionBoostRef.current.endTime) {
      temporaryVisionBoostRef.current = null;
      // Clear from state (dispatch will trigger re-render and sync ref)
      dispatch({ type: 'UPDATE_STATS', payload: {} });
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
          dispatch({ type: 'UPDATE_STATS', payload: {} }); // Trigger state update
        }
      }
    }

    // Check time limit
    // Don't check timer during bonus selection to prevent game over while player is choosing
    if (!levelRef.current.isShop && !levelRef.current.isBoss && !showBonusSelection) {
      const modifiers = getModifiers();
      const timeLimit = LEVEL_TIME_LIMIT * modifiers.timerMult * 1000; // ms
      const elapsed = Date.now() - levelStartTimeRef.current;
      
      if (elapsed > timeLimit && !gameOverTriggeredRef.current) {
        gameOverTriggeredRef.current = true;
        onTimeOut();
        return;
      }
    }

    // Movement Logic - use refs to get current stats and apply item bonuses
    const baseStats = statsRef.current;
    const effectiveStats = getEffectiveStats(baseStats, loadoutRef.current);
    const moveDelay = 1000 / (effectiveStats.speed * 4);
    const dx = Math.round(inputDirection.x);
    const dy = Math.round(inputDirection.y);
    const hasInput = dx !== 0 || dy !== 0;

    // Update visual position interpolation
    if (moveProgressRef.current < 1) {
      moveProgressRef.current = Math.min(1, moveProgressRef.current + (deltaTime / moveDelay));
      // Use ease-out for smoother deceleration
      const easedProgress = 1 - Math.pow(1 - moveProgressRef.current, 3);
      visualPosRef.current = {
        x: moveStartPosRef.current.x + (playerPosRef.current.x - moveStartPosRef.current.x) * easedProgress,
        y: moveStartPosRef.current.y + (playerPosRef.current.y - moveStartPosRef.current.y) * easedProgress,
      };
    } else {
      // Ensure visual position matches actual position when not moving
      visualPosRef.current = { ...playerPosRef.current };
    }

    if (hasInput) {
      moveTimerRef.current += deltaTime;
      if (moveTimerRef.current > moveDelay) {
        const nextPos = { x: playerPosRef.current.x + dx, y: playerPosRef.current.y + dy };
        
        // Check if phasing is active
        const isPhasing = activeScrollEffectsRef.current.phasing && activeScrollEffectsRef.current.phasing.active;
        const canMove = isPhasing || !checkCollision(nextPos, levelRef.current);
        
        if (canMove) {
          // Play movement sound
          if (lastPlayerPosRef.current.x !== nextPos.x || lastPlayerPosRef.current.y !== nextPos.y) {
            audioManager.playSound('move');
          }
          
          // Create footprint if player moved to a new tile
          const currentTileX = Math.floor(nextPos.x);
          const currentTileY = Math.floor(nextPos.y);
          const lastFootprintTile = lastFootprintPosRef.current 
            ? { x: Math.floor(lastFootprintPosRef.current.x), y: Math.floor(lastFootprintPosRef.current.y) }
            : null;
          
          // Create footprint when entering a new tile (not on the same tile)
          if (!lastFootprintTile || lastFootprintTile.x !== currentTileX || lastFootprintTile.y !== currentTileY) {
            if (levelRef.current && levelRef.current.footprints) {
              const isLeftFoot = nextFootIsLeftRef.current;
              const footprint: Footprint = {
                id: `footprint-${footprintIdCounterRef.current++}`,
                pos: { x: nextPos.x, y: nextPos.y },
                direction: { x: dx, y: dy },
                isLeftFoot: isLeftFoot,
                createdAt: Date.now(),
                lifetime: 3000, // 3 seconds (fade sooner)
              };
              levelRef.current.footprints.push(footprint);
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
          moveTimerRef.current = 0;
          
          // Check tile triggers
          const tile = levelRef.current.tiles[nextPos.y][nextPos.x];
          if (tile === 'exit') {
            audioManager.playSound('levelComplete');
            onLevelComplete();
          }

          // Check for portal collision
          const portal = levelRef.current.portals.find(
            p => Math.floor(p.pos.x) === nextPos.x && Math.floor(p.pos.y) === nextPos.y
          );
          if (portal) {
            // Teleport player to portal exit position
            audioManager.playSound('itemPickup'); // Reuse sound for portal activation
            playerPosRef.current = { ...portal.exitPos };
            visualPosRef.current = { ...portal.exitPos };
            moveStartPosRef.current = { ...portal.exitPos };
            moveProgressRef.current = 1;
            lastPlayerPosRef.current = { ...portal.exitPos };
            
            // Log portal usage event
            eventLogger.logEvent('environment', 'Used portal', {
              type: 'portal',
              fromPos: { x: nextPos.x, y: nextPos.y },
              toPos: portal.exitPos
            });
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
            visionDebuffLevelRef.current = 0; // Clear Nyx effect
            
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
            dispatch({ type: 'ADD_ITEM', payload: collectedItem });
            levelRef.current.items = levelRef.current.items.filter((_, i) => i !== itemIndex);
            
            // Log item pickup event
            eventLogger.logEvent('loot', `Picked up ${collectedItem.name} (${collectedItem.rarity})`, {
              item: collectedItem
            });
          }

          // Auto-attack nearby enemies with weapon-specific mechanics
          const weapon = loadoutRef.current.weapon;
          const weaponBaseName = weapon ? getItemBaseName(weapon.name) : null;
          
          // Extract weapon level from item name (e.g., "Sword Lv5" -> 5, or use current level as fallback)
          let weaponLevel = state.currentLevel;
          if (weapon) {
            const levelMatch = weapon.name.match(/Lv(\d+)/i);
            if (levelMatch) {
              weaponLevel = parseInt(levelMatch[1], 10);
            }
          }
          
          // Get attackable positions based on weapon type
          const attackablePositions = getAttackablePositions(nextPos, weaponBaseName, levelRef.current);
          
          // Find enemies in attackable positions
          const attackableEnemies = levelRef.current.entities.filter(enemy => {
            if (enemy.type !== 'enemy' && enemy.type !== 'boss_enemy') return false;
            
            // Check if enemy is in any attackable position using distance-based check
            // This matches mob attack logic (1.5 tile range for melee, 2.0 for spear)
            const meleeRange = 1.5;
            const isInRange = attackablePositions.some(pos => {
              const dx = enemy.pos.x - pos.x;
              const dy = enemy.pos.y - pos.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              // For spear, use 2-tile range (spear attacks 2 tiles in each direction)
              if (weaponBaseName?.toLowerCase() === 'spear') {
                return distance <= 2.0;
              }
              
              // Default melee range: 1.5 tiles (matching mob attack range)
              return distance <= meleeRange;
            });
            
            if (!isInRange) return false;
            
            // Check line of sight - prevent attacks through walls
            // Spear has special wall-piercing logic handled later, but still check LOS here
            if (levelRef.current) {
              const hasLOS = hasLineOfSight(nextPos, enemy.pos, levelRef.current);
              // For non-spear weapons, require line of sight
              // For spear, allow it through (wall-piercing logic handles it later)
              if (weaponBaseName?.toLowerCase() !== 'spear' && !hasLOS) {
                return false;
              }
            }
            
            return true;
          });
          
          attackableEnemies.forEach(enemy => {
            // Spear: Check if enemy is behind a wall (10% chance to pierce through)
            if (weaponBaseName?.toLowerCase() === 'spear' && levelRef.current) {
              const hasLOS = hasLineOfSight(nextPos, enemy.pos, levelRef.current);
              if (!hasLOS) {
                // Enemy is behind a wall - only 10% chance to hit
                if (Math.random() >= 0.10) {
                  return; // Attack fails, don't damage enemy
                }
                // Attack succeeds through wall, but with reduced damage
                audioManager.playSound('attack');
                let damage = effectiveStats.damage * 0.5; // 50% damage when piercing through wall
                enemy.hp -= damage;
                
                // Log player attack event
                const enemyTypeName = enemy.mobSubtype || (enemy.isBoss ? 'Boss' : 'Enemy');
                eventLogger.logEvent('combat', `Dealt ${Math.floor(damage)} damage to ${enemyTypeName}`, {
                  damage: Math.floor(damage),
                  enemyType: enemy.mobSubtype,
                  isBoss: enemy.isBoss,
                  enemyHp: Math.floor(enemy.hp)
                });
                
                return; // Skip other weapon mechanics for wall-piercing attacks
              }
            }
            
            audioManager.playSound('attack');
            
            // Calculate base damage
            let damage = effectiveStats.damage;
            
            // Dagger: Critical hit chance (higher level = more chance)
            // Base 10% crit chance, +2% per level
            let isCrit = false;
            if (weaponBaseName?.toLowerCase() === 'dagger') {
              const critChance = 0.10 + (weaponLevel - 1) * 0.02; // 10% base, +2% per level
              if (Math.random() < critChance) {
                damage *= 3; // Triple damage on crit
                isCrit = true;
              }
            }
            
            // Apply damage
            enemy.hp -= damage;
            
            // Log player attack event
            const enemyTypeName = enemy.mobSubtype || (enemy.isBoss ? 'Boss' : 'Enemy');
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
              
              if (distance > 0) {
                // Knockback distance: 0.5 tiles base, +0.1 per level
                const knockbackDistance = 0.5 + (weaponLevel - 1) * 0.1;
                const knockbackX = (dx / distance) * knockbackDistance;
                const knockbackY = (dy / distance) * knockbackDistance;
                
                const newPos = {
                  x: enemy.pos.x + knockbackX,
                  y: enemy.pos.y + knockbackY
                };
                
                // Only apply knockback if the new position is valid (not a wall)
                if (!checkCollision(newPos, levelRef.current)) {
                  enemy.pos = newPos;
                }
              }
            }
            
            if (enemy.hp <= 0) {
                // Store boss death position for exit placement
                const bossDeathPos = enemy.isBoss ? { x: Math.floor(enemy.pos.x), y: Math.floor(enemy.pos.y) } : null;
                
                // Remove enemy and award coins
                audioManager.playSound('enemyDeath');
                audioManager.playSound('coin');
                levelRef.current!.entities = levelRef.current!.entities.filter(e => e.id !== enemy.id);
                
                // Log kill event
                const enemyTypeName = enemy.mobSubtype || (enemy.isBoss ? 'Boss' : 'Enemy');
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
                    // Update exit position
                    levelRef.current.exitPos = { x: exitX, y: exitY };
                  }
                  
                  // Log boss defeat event
                  eventLogger.logEvent('progression', `Boss ${enemy.mobSubtype} defeated`, {
                    bossType: enemy.mobSubtype
                  });
                }
                
                // Calculate coin reward based on mob type
                let coinReward = 10; // Default
                if (enemy.isBoss) {
                  coinReward = 100;
                } else if (enemy.mobSubtype) {
                  const mobType = MOB_TYPES.find((m: typeof MOB_TYPES[0]) => m.subtype === enemy.mobSubtype);
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
                
                // Use base stats from ref to ensure we have latest coins value
                dispatch({ type: 'UPDATE_STATS', payload: { coins: baseStats.coins + coinReward } });
                
                // Log coin collection event
                eventLogger.logEvent('loot', `Collected ${coinReward} coins`, {
                  amount: coinReward
                });
                
                // Unlock compendium card on first defeat
                if (enemy.mobSubtype) {
                  dispatch({ type: 'UNLOCK_COMPENDIUM_CARD', payload: enemy.mobSubtype });
                }
                
                // Check if all non-boss enemies are cleared
                if (levelRef.current && !levelRef.current.isBoss && !levelRef.current.isShop) {
                  const remainingNonBossEnemies = levelRef.current.entities.filter(
                    e => (e.type === 'enemy' || e.type === 'boss_enemy') && !e.isBoss
                  );
                  if (remainingNonBossEnemies.length === 0 && !bonusSelectionRef.current) {
                    // Generate 2 random bonus options
                    const allBonuses = ['restore_health', 'double_coins', 'skip_shop', 'skip_boss', 'mystery_box'];
                    const shuffled = [...allBonuses].sort(() => Math.random() - 0.5);
                    const selectedOptions = shuffled.slice(0, 2);
                    bonusSelectionRef.current = { options: selectedOptions };
                    setShowBonusSelection(true);
                    audioManager.playSound('levelComplete');
                  }
                }
              }
          });
        }
      }
    } else {
      moveTimerRef.current = moveDelay;
    }

    // Update projectiles FIRST (before entity movement) to avoid timing issues
    // Wrap in try-catch to ensure update always completes even if projectiles fail
    try {
      const PROJECTILE_SPEED = 0.15; // tiles per frame (roughly)
      
      // Ensure projectiles array exists
      if (!levelRef.current.projectiles) {
        levelRef.current.projectiles = [];
      }
      
      // Early exit if no projectiles to process
      if (levelRef.current.projectiles.length === 0) {
        // Skip projectile processing if empty
      } else {
        // Update projectiles - use for loop for better performance
        const updatedProjectiles: Projectile[] = [];
        for (let i = 0; i < levelRef.current.projectiles.length; i++) {
          const projectile = levelRef.current.projectiles[i];
          
          // Check lifetime
          if (now - projectile.createdAt > PROJECTILE_LIFETIME) {
            continue; // Skip expired projectiles
          }
          
          // Update position
          const newPos = {
            x: projectile.pos.x + projectile.velocity.x * PROJECTILE_SPEED,
            y: projectile.pos.y + projectile.velocity.y * PROJECTILE_SPEED,
          };
          
          // Check if hit player
          const distToPlayer = Math.sqrt(
            Math.pow(newPos.x - playerPosRef.current.x, 2) +
            Math.pow(newPos.y - playerPosRef.current.y, 2)
          );
          
          if (distToPlayer < 0.5) {
            // Hit player - update stats synchronously but ensure loop continues
            const defense = getTotalDefense(loadoutRef.current);
            const damageAfterDefense = Math.max(1, projectile.damage - defense);
            const hpRatio = baseStats.hp / baseStats.maxHp;
            const damage = Math.max(1, Math.floor(damageAfterDefense * (1 - hpRatio * 0.3)));
            const newHp = Math.max(0, baseStats.hp - damage);
            
            // Apply vision debuff if shadow pulse (stacks)
            if (projectile.isShadowPulse) {
              applyVisionDebuff(0.15); // Add 15% to debuff stack
            }
            
            // Update stats immediately - dispatch is fast and shouldn't block
            audioManager.playSound('damage');
            dispatch({ type: 'UPDATE_STATS', payload: { hp: newHp } });
            
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
          
          // Check friendly fire - projectile hits other mobs (but not its owner)
          let hitEnemy = false;
          if (levelRef.current && levelRef.current.entities) {
            for (let j = 0; j < levelRef.current.entities.length; j++) {
              const entity = levelRef.current.entities[j];
              
              // Skip if this is the projectile owner or not an enemy
              if (entity.id === projectile.ownerId || 
                  (entity.type !== 'enemy' && entity.type !== 'boss_enemy')) {
                continue;
              }
              
              // Check collision with enemy
              const distToEnemy = Math.sqrt(
                Math.pow(newPos.x - entity.pos.x, 2) +
                Math.pow(newPos.y - entity.pos.y, 2)
              );
              
              if (distToEnemy < 0.5) {
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
                      // Update exit position
                      levelRef.current.exitPos = { x: exitX, y: exitY };
                    }
                  }
                  
                  // Remove the dead entity immediately
                  levelRef.current.entities = levelRef.current.entities.filter(e => e.id !== entity.id);
                } else {
                  // Entity still alive - just update HP
                  levelRef.current.entities[j] = {
                    ...entity,
                    hp: newHp
                  };
                  
                  // Play damage sound
                  audioManager.playSound('damage');
                }
                
                hitEnemy = true;
                break; // Projectile can only hit one enemy
              }
            }
          }
          
          if (hitEnemy) {
            continue; // Skip this projectile (hit enemy)
          }
          
          // Check wall collision
          if (levelRef.current && checkCollision(newPos, levelRef.current)) {
            // Check if projectile can phase through walls (Zeus projectiles)
            if (projectile.wallPhaseChance !== undefined && projectile.wallPhaseChance > 0) {
              // Roll for phase chance - if successful, projectile passes through
              if (Math.random() < projectile.wallPhaseChance) {
                // Projectile phases through wall - continue movement
              } else {
                // Projectile hits wall - remove it
                continue;
              }
            } else {
              // No phase chance - projectile hits wall
              continue; // Skip this projectile (hit wall)
            }
          }
          
          // Keep projectile with updated position
          updatedProjectiles.push({ ...projectile, pos: newPos });
        }
        
        levelRef.current.projectiles = updatedProjectiles;
      }
      
    } catch (error) {
      // If projectile update fails, just ensure array exists and continue
      console.error('Error updating projectiles:', error);
      if (!levelRef.current.projectiles) {
        levelRef.current.projectiles = [];
      }
    }

    // Update afterimages
    try {
      if (!levelRef.current.afterimages) {
        levelRef.current.afterimages = [];
      }
      
      const updatedAfterimages: Afterimage[] = [];
      for (let i = 0; i < levelRef.current.afterimages.length; i++) {
        const afterimage = levelRef.current.afterimages[i];
        
        // Check lifetime
        if (now - afterimage.createdAt > afterimage.lifetime) {
          continue; // Skip expired afterimages
        }
        
        // Check player collision
        const distToPlayer = Math.sqrt(
          Math.pow(afterimage.pos.x - playerPosRef.current.x, 2) +
          Math.pow(afterimage.pos.y - playerPosRef.current.y, 2)
        );
        
        if (distToPlayer < 0.5) {
          // Hit player - chip damage
          const chipDamage = afterimage.damage;
          const newHp = Math.max(0, baseStats.hp - chipDamage);
          dispatch({ type: 'UPDATE_STATS', payload: { hp: newHp } });
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
      if (!levelRef.current.particles) {
        levelRef.current.particles = [];
      }
      
      const updatedParticles: Particle[] = [];
      for (let i = 0; i < levelRef.current.particles.length; i++) {
        const particle = levelRef.current.particles[i];
        
        // Check lifetime
        if (now - particle.createdAt > particle.lifetime) {
          continue; // Skip expired particles
        }
        
        updatedParticles.push(particle);
      }
      
      levelRef.current.particles = updatedParticles;
      
    } catch (error) {
      console.error('Error updating particles:', error);
      if (!levelRef.current.particles) {
        levelRef.current.particles = [];
      }
    }

    // Update footprints
    try {
      if (!levelRef.current.footprints) {
        levelRef.current.footprints = [];
      }
      
      const updatedFootprints: Footprint[] = [];
      for (let i = 0; i < levelRef.current.footprints.length; i++) {
        const footprint = levelRef.current.footprints[i];
        
        // Check lifetime
        if (now - footprint.createdAt > footprint.lifetime) {
          continue; // Skip expired footprints
        }
        
        updatedFootprints.push(footprint);
      }
      
      levelRef.current.footprints = updatedFootprints;
    } catch (error) {
      console.error('Error updating footprints:', error);
      if (!levelRef.current.footprints) {
        levelRef.current.footprints = [];
      }
    }

    // Advanced enemy AI with unique behaviors per mob type
    const updatedEntities = levelRef.current.entities.map(entity => {
      if (entity.type === 'enemy' || entity.type === 'boss_enemy') {
        const updatedEntity = { ...entity };
        const mobSubtype = entity.mobSubtype || 'drone';
        const moveSpeed = entity.moveSpeed || 1.0;
        const baseMoveDelay = 1000 / (moveSpeed * 4); // Base movement delay
        
        // Update move timer for this entity
        const currentTimer = enemyMoveTimersRef.current.get(entity.id) || 0;
        enemyMoveTimersRef.current.set(entity.id, currentTimer + deltaTime);
        
        // Stationary mobs don't move
        if (entity.isStationary) {
          // Handle ranged attacks for stationary mobs
          if (entity.isRanged && entity.range) {
            const distToPlayer = Math.sqrt(
              Math.pow(entity.pos.x - playerPosRef.current.x, 2) +
              Math.pow(entity.pos.y - playerPosRef.current.y, 2)
            );
            
            // Check aggro range first
            const mobType = MOB_TYPES.find(m => m.subtype === mobSubtype);
            const aggroRange = mobType?.aggroRange ?? Infinity;
            
            // Only attack if player is within aggro range and attack range
            if (distToPlayer <= aggroRange && distToPlayer <= entity.range) {
              const lastAttack = entity.lastAttackTime || 0;
              const cooldown = entity.attackCooldown || 1500;
              
              if (now - lastAttack >= cooldown) {
                // Fire projectile - restrict to cardinal directions only
                const dx = playerPosRef.current.x - entity.pos.x;
                const dy = playerPosRef.current.y - entity.pos.y;
                // Determine which cardinal direction has the largest component
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                let velocity;
                if (absDx > absDy) {
                  // Horizontal direction (left or right)
                  velocity = { x: Math.sign(dx), y: 0 };
                } else {
                  // Vertical direction (up or down)
                  velocity = { x: 0, y: Math.sign(dy) };
                }
                
                if (levelRef.current) {
                  if (!levelRef.current.projectiles) {
                    levelRef.current.projectiles = [];
                  }
                  
                  // Calculate wall phase chance for turret projectiles (25% base)
                  let wallPhaseChance: number | undefined;
                  if (mobSubtype === 'turret') {
                    wallPhaseChance = calculateWallPhaseChance(0.25);
                  }
                  
                  levelRef.current.projectiles.push({
                    id: `projectile-${projectileIdCounterRef.current++}`,
                    pos: { ...entity.pos },
                    velocity,
                    damage: entity.damage,
                    ownerId: entity.id,
                    lifetime: PROJECTILE_LIFETIME,
                    createdAt: now,
                    ...(wallPhaseChance !== undefined && { wallPhaseChance }),
                  });
                }
                
                updatedEntity.lastAttackTime = now;
                audioManager.playSound('attack');
              }
            }
          }
          return updatedEntity;
        }
        
        // Movement logic for non-stationary mobs
        const moveTimer = enemyMoveTimersRef.current.get(entity.id) || 0;
        if (moveTimer >= baseMoveDelay) {
          let nextPos = { ...entity.pos };
          let shouldMove = false;
          
          // Calculate distance to player
          const dx = playerPosRef.current.x - entity.pos.x;
          const dy = playerPosRef.current.y - entity.pos.y;
          const distToPlayer = Math.sqrt(dx * dx + dy * dy);
          
          // Get mob type and aggro range
          const mobType = MOB_TYPES.find(m => m.subtype === mobSubtype);
          const aggroRange = mobType?.aggroRange ?? Infinity;
          
          // Helper function for idle roaming behavior
          const performIdleRoaming = (): { x: number; y: number } | null => {
            const ROAM_CHANGE_INTERVAL = 2000; // Change direction every 2 seconds
            const lastRoamChange = entity.lastRoamChange || 0;
            
            // Initialize or change roam direction periodically
            if (!entity.roamDirection || (now - lastRoamChange >= ROAM_CHANGE_INTERVAL)) {
              // Pick a random cardinal direction
              const directions = [
                { x: 1, y: 0 },   // Right
                { x: -1, y: 0 },  // Left
                { x: 0, y: 1 },   // Down
                { x: 0, y: -1 },  // Up
              ];
              const randomDir = directions[Math.floor(Math.random() * directions.length)];
              updatedEntity.roamDirection = randomDir;
              updatedEntity.lastRoamChange = now;
            }
            
            return updatedEntity.roamDirection || entity.roamDirection || null;
          };
          
          // Unique AI behaviors based on mob subtype
          // Check aggro range: if player is outside aggro range, mobs should idle roam
          if (distToPlayer > aggroRange) {
            // Player is outside aggro range - perform idle roaming
            const roamDir = performIdleRoaming();
            if (roamDir) {
              nextPos = {
                x: entity.pos.x + roamDir.x,
                y: entity.pos.y + roamDir.y,
              };
              shouldMove = true;
            }
          } else {
            // Player is within aggro range - clear roaming state and execute mob-specific behavior
            updatedEntity.roamDirection = null;
            switch (mobSubtype) {
            case 'charger': {
              // Ares Charger: Fast charge in straight line
              if (entity.chargeDirection) {
                // Continue charging
                nextPos = {
                  x: entity.pos.x + entity.chargeDirection.x,
                  y: entity.pos.y + entity.chargeDirection.y,
                };
                shouldMove = true;
                
                // Stop charging if hit wall or reached player
                if (levelRef.current && checkCollision(nextPos, levelRef.current) && !entity.canPhase) {
                  updatedEntity.chargeDirection = null;
                  shouldMove = false;
                } else if (distToPlayer < 1.5) {
                  updatedEntity.chargeDirection = null;
                }
              } else {
                // Start new charge
                if (distToPlayer > 2) {
                  // Restrict charge direction to cardinal only
                  const dir = restrictToCardinal(dx, dy);
                  updatedEntity.chargeDirection = { x: dir.x, y: dir.y };
                  nextPos = {
                    x: entity.pos.x + dir.x,
                    y: entity.pos.y + dir.y,
                  };
                  shouldMove = true;
                } else {
                  // Close enough, normal movement (restricted to cardinal)
                  const dir = restrictToCardinal(dx, dy);
                  nextPos = {
                    x: entity.pos.x + dir.x,
                    y: entity.pos.y + dir.y,
                  };
                  shouldMove = true;
                }
              }
              break;
            }
            
            case 'sniper': {
              // Apollo Sniper: Slow movement, ranged attacks
              if (entity.isRanged && entity.range && distToPlayer <= entity.range && distToPlayer > 1) {
                // Try to maintain distance, move away if too close (restricted to cardinal)
                if (distToPlayer < 3) {
                  const dir = restrictToCardinal(-dx, -dy);
                  nextPos = {
                    x: entity.pos.x + dir.x,
                    y: entity.pos.y + dir.y,
                  };
                  shouldMove = true;
                }
                
                // Fire projectile if in range
                const lastAttack = entity.lastAttackTime || 0;
                const cooldown = entity.attackCooldown || 2000;
                
                if (now - lastAttack >= cooldown) {
                  // Restrict to cardinal directions only
                  const absDx = Math.abs(dx);
                  const absDy = Math.abs(dy);
                  let velocity;
                  if (absDx > absDy) {
                    // Horizontal direction (left or right)
                    velocity = { x: Math.sign(dx), y: 0 };
                  } else {
                    // Vertical direction (up or down)
                    velocity = { x: 0, y: Math.sign(dy) };
                  }
                  
                  if (levelRef.current) {
                    if (!levelRef.current.projectiles) {
                      levelRef.current.projectiles = [];
                    }
                    
                    // Calculate wall phase chance for sniper projectiles (10% base)
                    const wallPhaseChance = calculateWallPhaseChance(0.10);
                    
                    levelRef.current.projectiles.push({
                      id: `projectile-${projectileIdCounterRef.current++}`,
                      pos: { ...entity.pos },
                      velocity,
                      damage: entity.damage,
                      ownerId: entity.id,
                      lifetime: PROJECTILE_LIFETIME,
                      createdAt: now,
                      wallPhaseChance,
                    });
                  }
                  
                  updatedEntity.lastAttackTime = now;
                  audioManager.playSound('attack');
                }
              } else {
                // Move towards player slowly (restricted to cardinal)
                const dir = restrictToCardinal(dx, dy);
                nextPos = {
                  x: entity.pos.x + dir.x,
                  y: entity.pos.y + dir.y,
                };
                shouldMove = true;
              }
              break;
            }
            
            case 'phase': {
              // Hades Phase: Can move through walls
              // Aggro'd: Move toward player
              nextPos = {
                x: entity.pos.x + Math.sign(dx),
                y: entity.pos.y + Math.sign(dy),
              };
              shouldMove = true;
              // Clear roaming state when aggro'd
              updatedEntity.roamDirection = null;
              // Phase mobs ignore wall collision
              break;
            }
            
            case 'guardian': {
              // Athena Guardian: Slow, tanky, direct path (restricted to cardinal)
              const dir = restrictToCardinal(dx, dy);
              nextPos = {
                x: entity.pos.x + dir.x,
                y: entity.pos.y + dir.y,
              };
              shouldMove = true;
              break;
            }
            
            case 'swarm': {
              // Minion Swarm: Fast, direct movement (restricted to cardinal)
              const dir = restrictToCardinal(dx, dy);
              nextPos = {
                x: entity.pos.x + dir.x,
                y: entity.pos.y + dir.y,
              };
              shouldMove = true;
              break;
            }
            
            case 'moth': {
              // Nyx Glitchmoth: Orbiting movement, blinking, shadow pulse
              const orbitRadius = 2.5;
              let currentAngle = entity.orbitAngle || Math.atan2(dy, dx);
              
              // Update orbit angle
              currentAngle += 0.1;
              updatedEntity.orbitAngle = currentAngle;
              
              // Calculate orbiting position
              const orbitX = playerPosRef.current.x + Math.cos(currentAngle) * orbitRadius;
              const orbitY = playerPosRef.current.y + Math.sin(currentAngle) * orbitRadius;
              
              // Check blink cooldown
              const blinkCooldown = entity.blinkCooldown || 0;
              if (now - blinkCooldown >= 3000 + Math.random() * 2000) { // 3-5 seconds
                // Find dark area (tile with no nearby entities)
                if (levelRef.current) {
                  const darkTiles: Position[] = [];
                  const exitPos = levelRef.current.exitPos;
                  for (let y = 0; y < levelRef.current.height; y++) {
                    for (let x = 0; x < levelRef.current.width; x++) {
                      if (levelRef.current.tiles[y][x] === 'floor' &&
                          (x !== exitPos.x || y !== exitPos.y)) {
                        const tilePos = { x, y };
                        const distToPlayer = Math.sqrt(
                          Math.pow(tilePos.x - playerPosRef.current.x, 2) +
                          Math.pow(tilePos.y - playerPosRef.current.y, 2)
                        );
                        if (distToPlayer <= 6) {
                          // Check if no entities nearby
                          const nearbyEntities = getEntitiesInRadius(tilePos, 1.5, levelRef.current.entities);
                          if (nearbyEntities.length === 0) {
                            darkTiles.push(tilePos);
                          }
                        }
                      }
                    }
                  }
                  if (darkTiles.length > 0) {
                    const randomDarkTile = darkTiles[Math.floor(Math.random() * darkTiles.length)];
                    nextPos = randomDarkTile;
                    shouldMove = true;
                    updatedEntity.blinkCooldown = now;
                  } else {
                    // Fallback to orbiting
                    nextPos = { x: orbitX, y: orbitY };
                    shouldMove = true;
                  }
                }
              } else {
                // Normal orbiting
                nextPos = { x: orbitX, y: orbitY };
                shouldMove = true;
              }
              
              // Create particle trail when moth moves
              if (shouldMove && levelRef.current) {
                if (!levelRef.current.particles) {
                  levelRef.current.particles = [];
                }
                // Create small particles at previous position
                const particleCount = 2; // Create 2 particles per movement
                for (let i = 0; i < particleCount; i++) {
                  const offsetX = (Math.random() - 0.5) * 0.3;
                  const offsetY = (Math.random() - 0.5) * 0.3;
                  levelRef.current.particles.push({
                    id: `particle-${particleIdCounterRef.current++}`,
                    pos: {
                      x: entity.pos.x + offsetX,
                      y: entity.pos.y + offsetY,
                    },
                    createdAt: now,
                    lifetime: 800, // Fade out over 800ms
                  });
                }
              }
              
              // Shadow pulse attack
              if (distToPlayer >= 3 && distToPlayer <= 4 && entity.isRanged) {
                const lastAttack = entity.lastAttackTime || 0;
                const cooldown = entity.attackCooldown || 1250;
                
                if (now - lastAttack >= cooldown) {
                  // Fire shadow pulse projectile
                  const absDx = Math.abs(dx);
                  const absDy = Math.abs(dy);
                  let velocity;
                  if (absDx > absDy) {
                    velocity = { x: Math.sign(dx), y: 0 };
                  } else {
                    velocity = { x: 0, y: Math.sign(dy) };
                  }
                  
                  if (levelRef.current) {
                    if (!levelRef.current.projectiles) {
                      levelRef.current.projectiles = [];
                    }
                    
                    // Calculate wall phase chance for moth (nyx) projectiles (5% base)
                    const wallPhaseChance = calculateWallPhaseChance(0.05);
                    
                    levelRef.current.projectiles.push({
                      id: `projectile-${projectileIdCounterRef.current++}`,
                      pos: { ...entity.pos },
                      velocity,
                      damage: entity.damage,
                      ownerId: entity.id,
                      lifetime: PROJECTILE_LIFETIME,
                      createdAt: now,
                      isShadowPulse: true,
                      wallPhaseChance,
                    });
                  }
                  
                  updatedEntity.lastAttackTime = now;
                  audioManager.playSound('attack');
                }
              }
              break;
            }
            
            case 'tracker': {
              // Artemis Tracker: Stalking, pounce, afterimage trail
              if (entity.isStalking) {
                // Stalking behavior: maintain distance, check for clear path
                if (distToPlayer > 4 && distToPlayer < 5) {
                  // Check for straight line path (Bresenham-like check)
                  let hasClearPath = true;
                  const steps = Math.max(Math.abs(dx), Math.abs(dy));
                  if (steps > 0) {
                    for (let i = 1; i <= steps; i++) {
                      const checkX = Math.floor(entity.pos.x + (dx / steps) * i);
                      const checkY = Math.floor(entity.pos.y + (dy / steps) * i);
                      if (levelRef.current && levelRef.current.tiles[checkY] && levelRef.current.tiles[checkY][checkX] === 'wall') {
                        hasClearPath = false;
                        break;
                      }
                    }
                  }
                  
                  if (hasClearPath) {
                    // Initiate pounce (restricted to cardinal)
                    updatedEntity.isStalking = false;
                    const dir = restrictToCardinal(dx, dy);
                    updatedEntity.pounceDirection = { x: dir.x, y: dir.y };
                    nextPos = {
                      x: entity.pos.x + dir.x * 2,
                      y: entity.pos.y + dir.y * 2,
                    };
                    shouldMove = true;
                    
                    // Create afterimage trail
                    if (levelRef.current) {
                      if (!levelRef.current.afterimages) {
                        levelRef.current.afterimages = [];
                      }
                      const pounceDistance = Math.min(3, Math.floor(distToPlayer));
                      for (let i = 1; i <= pounceDistance; i++) {
                        const trailPos = {
                          x: entity.pos.x + (dir.x * i),
                          y: entity.pos.y + (dir.y * i),
                        };
                        levelRef.current.afterimages.push({
                          id: `afterimage-${afterimageIdCounterRef.current++}`,
                          pos: trailPos,
                          createdAt: now,
                          lifetime: 2500, // 2.5 seconds
                          damage: 1 + Math.floor(Math.random()), // 1-2 chip damage
                        });
                      }
                    }
                  } else {
                    // No clear path, continue stalking (restricted to cardinal)
                    const dir = restrictToCardinal(dx, dy);
                    nextPos = {
                      x: entity.pos.x + dir.x * 0.5,
                      y: entity.pos.y + dir.y * 0.5,
                    };
                    shouldMove = true;
                  }
                } else if (distToPlayer > 5) {
                  // Too far, move closer slowly (restricted to cardinal)
                  const dir = restrictToCardinal(dx, dy);
                  nextPos = {
                    x: entity.pos.x + dir.x * 0.5,
                    y: entity.pos.y + dir.y * 0.5,
                  };
                  shouldMove = true;
                }
              } else if (entity.pounceDirection) {
                // Continue pounce (pounce direction already set, but restrict if diagonal)
                const pounceDir = entity.pounceDirection;
                // Check if pounce is diagonal and restrict if needed
                if (pounceDir.x !== 0 && pounceDir.y !== 0) {
                  const restrictedDir = restrictToCardinal(pounceDir.x, pounceDir.y);
                  updatedEntity.pounceDirection = restrictedDir;
                  nextPos = {
                    x: entity.pos.x + restrictedDir.x,
                    y: entity.pos.y + restrictedDir.y,
                  };
                } else {
                  nextPos = {
                    x: entity.pos.x + pounceDir.x,
                    y: entity.pos.y + pounceDir.y,
                  };
                }
                shouldMove = true;
                
                // Stop pounce if reached player or hit wall
                if (distToPlayer < 1.5) {
                  updatedEntity.pounceDirection = null;
                  updatedEntity.isStalking = true; // Return to stalking
                } else if (levelRef.current && checkCollision(nextPos, levelRef.current)) {
                  updatedEntity.pounceDirection = null;
                  updatedEntity.isStalking = true;
                  shouldMove = false;
                }
              } else {
                // Return to stalking (restricted to cardinal)
                updatedEntity.isStalking = true;
                const dir = restrictToCardinal(dx, dy);
                nextPos = {
                  x: entity.pos.x + dir.x * 0.5,
                  y: entity.pos.y + dir.y * 0.5,
                };
                shouldMove = true;
              }
              break;
            }
            
            case 'cerberus': {
              // Cerberus Firewall: Slow walk, triple-lunge, tri-bite combo
              // Calculate time since last bite (needed for both combo logic and reset logic)
              const lastBite = entity.lastBiteTime || 0;
              const biteComboCount = entity.biteComboCount || 0;
              const timeSinceLastBite = now - lastBite;
              
              // Check for straight lane to player
              let hasStraightLane = false;
              const steps = Math.max(Math.abs(dx), Math.abs(dy));
              if (steps > 0 && steps <= 3) {
                hasStraightLane = true;
                for (let i = 1; i <= steps; i++) {
                  const checkX = Math.floor(entity.pos.x + (dx / steps) * i);
                  const checkY = Math.floor(entity.pos.y + (dy / steps) * i);
                  if (levelRef.current && levelRef.current.tiles[checkY] && levelRef.current.tiles[checkY][checkX] === 'wall') {
                    hasStraightLane = false;
                    break;
                  }
                }
              }
              
              if (hasStraightLane && distToPlayer > 1.5) {
                // Triple-lunge (restricted to cardinal)
                const dir = restrictToCardinal(dx, dy);
                // Check each intermediate tile for collisions
                let canLunge = true;
                if (levelRef.current) {
                  for (let i = 1; i <= 3; i++) {
                    const checkPos = {
                      x: entity.pos.x + dir.x * i,
                      y: entity.pos.y + dir.y * i,
                    };
                    if (checkCollision(checkPos, levelRef.current)) {
                      canLunge = false;
                      break;
                    }
                  }
                }
                if (canLunge) {
                  nextPos = {
                    x: entity.pos.x + dir.x * 3,
                    y: entity.pos.y + dir.y * 3,
                  };
                  shouldMove = true;
                } else {
                  // Fall back to normal walk if lunge path is blocked
                  nextPos = {
                    x: entity.pos.x + dir.x,
                    y: entity.pos.y + dir.y,
                  };
                  shouldMove = true;
                }
              } else {
                // Normal slow walk (restricted to cardinal)
                const dir = restrictToCardinal(dx, dy);
                nextPos = {
                  x: entity.pos.x + dir.x,
                  y: entity.pos.y + dir.y,
                };
                shouldMove = true;
              }
              
              // Tri-bite combo when in melee range
              if (distToPlayer <= 1.5) {
                const cooldown = entity.attackCooldown || 2200;
                
                if (biteComboCount === 0 && timeSinceLastBite >= cooldown) {
                  // Start combo - first bite
                  updatedEntity.biteComboCount = 1;
                  updatedEntity.lastBiteTime = now;
                  updatedEntity.lastDamageComboCount = 0; // Reset damage tracking for new combo
                } else if (biteComboCount > 0 && biteComboCount < 3) {
                  // Continue combo - advance based on timing
                  if (biteComboCount === 1 && timeSinceLastBite >= 200) {
                    updatedEntity.biteComboCount = 2;
                    // Don't update lastBiteTime - keep original combo start time
                  } else if (biteComboCount === 2 && timeSinceLastBite >= 400) {
                    updatedEntity.biteComboCount = 3;
                    // Don't update lastBiteTime - keep original combo start time
                  } else if (biteComboCount === 3 && timeSinceLastBite >= 600) {
                    // Combo complete, reset after all bites
                    updatedEntity.biteComboCount = 0;
                    updatedEntity.lastBiteTime = now;
                    updatedEntity.lastDamageComboCount = 0; // Reset damage tracking
                  }
                } else if (biteComboCount === 3 && timeSinceLastBite >= 1000) {
                  // Reset combo after 1 second of completion
                  updatedEntity.biteComboCount = 0;
                  updatedEntity.lastBiteTime = now;
                  updatedEntity.lastDamageComboCount = 0; // Reset damage tracking
                }
              } else {
                // Reset combo if too far
                if (timeSinceLastBite >= 1000) {
                  updatedEntity.biteComboCount = 0;
                  updatedEntity.lastDamageComboCount = 0; // Reset damage tracking
                }
              }
              break;
            }
            
            case 'boss_zeus': {
              // Zeus Boss: Ranged attacks
              if (entity.isRanged && entity.range && distToPlayer <= entity.range) {
                const lastAttack = entity.lastAttackTime || 0;
                const cooldown = entity.attackCooldown || 1000;
                
                if (now - lastAttack >= cooldown) {
                  // Restrict to cardinal directions only
                  const absDx = Math.abs(dx);
                  const absDy = Math.abs(dy);
                  let velocity;
                  if (absDx > absDy) {
                    // Horizontal direction (left or right)
                    velocity = { x: Math.sign(dx), y: 0 };
                  } else {
                    // Vertical direction (up or down)
                    velocity = { x: 0, y: Math.sign(dy) };
                  }
                  
                  if (levelRef.current) {
                    if (!levelRef.current.projectiles) {
                      levelRef.current.projectiles = [];
                    }
                    
                    // Calculate wall phase chance for Zeus projectiles (50% base + 0.5% per level, capped at 100%)
                    const basePhaseChance = 0.5; // 50% base
                    const phaseChancePerLevel = 0.005; // 0.5% per level
                    const wallPhaseChance = Math.min(1.0, basePhaseChance + (state.currentLevel * phaseChancePerLevel));
                    
                    levelRef.current.projectiles.push({
                      id: `projectile-${projectileIdCounterRef.current++}`,
                      pos: { ...entity.pos },
                      velocity,
                      damage: entity.damage,
                      ownerId: entity.id,
                      lifetime: PROJECTILE_LIFETIME,
                      createdAt: now,
                      wallPhaseChance, // Zeus projectiles can phase through walls
                    });
                  }
                  
                  updatedEntity.lastAttackTime = now;
                  audioManager.playSound('attack');
                }
              }
              
              // Move towards player (restricted to cardinal)
              const dir = restrictToCardinal(dx, dy);
              nextPos = {
                x: entity.pos.x + dir.x,
                y: entity.pos.y + dir.y,
              };
              shouldMove = true;
              break;
            }
            
            case 'boss_hades': {
              // Hades Boss: Can phase through walls (can move diagonally)
              nextPos = {
                x: entity.pos.x + Math.sign(dx),
                y: entity.pos.y + Math.sign(dy),
              };
              shouldMove = true;
              break;
            }
            
            case 'boss_ares': {
              // Ares Boss: Powerful charge attacks
              if (entity.chargeDirection) {
                // Continue charging - boss charges faster and further
                // Check if charge direction is diagonal and restrict if needed
                const chargeDir = entity.chargeDirection;
                if (chargeDir.x !== 0 && chargeDir.y !== 0) {
                  const restrictedDir = restrictToCardinal(chargeDir.x, chargeDir.y);
                  updatedEntity.chargeDirection = restrictedDir;
                  nextPos = {
                    x: entity.pos.x + restrictedDir.x,
                    y: entity.pos.y + restrictedDir.y,
                  };
                } else {
                  nextPos = {
                    x: entity.pos.x + chargeDir.x,
                    y: entity.pos.y + chargeDir.y,
                  };
                }
                shouldMove = true;
                
                // Stop charging if hit wall (Ares can't phase) or reached player
                if (levelRef.current && checkCollision(nextPos, levelRef.current)) {
                  updatedEntity.chargeDirection = null;
                  shouldMove = false;
                } else if (distToPlayer < 1.5) {
                  updatedEntity.chargeDirection = null;
                }
              } else {
                // Start new charge - Ares charges from further away and more frequently (restricted to cardinal)
                if (distToPlayer > 3) {
                  const dir = restrictToCardinal(dx, dy);
                  updatedEntity.chargeDirection = { x: dir.x, y: dir.y };
                  nextPos = {
                    x: entity.pos.x + dir.x,
                    y: entity.pos.y + dir.y,
                  };
                  shouldMove = true;
                } else {
                  // Close enough, normal movement (restricted to cardinal)
                  const dir = restrictToCardinal(dx, dy);
                  nextPos = {
                    x: entity.pos.x + dir.x,
                    y: entity.pos.y + dir.y,
                  };
                  shouldMove = true;
                }
              }
              break;
            }
            
            default: {
              // Default: Basic drone movement (Hermes) (restricted to cardinal)
              const dir = restrictToCardinal(dx, dy);
              nextPos = {
                x: entity.pos.x + dir.x,
                y: entity.pos.y + dir.y,
              };
              shouldMove = true;
              break;
            }
          }
          }
          
          // Apply movement if valid
          if (shouldMove && levelRef.current) {
            const canMove = entity.canPhase || !checkCollision(nextPos, levelRef.current);
            if (canMove) {
              // Check bounds
              if (nextPos.x >= 0 && nextPos.x < levelRef.current.width &&
                  nextPos.y >= 0 && nextPos.y < levelRef.current.height) {
                // Check if target tile is the exit - mobs cannot occupy exit tile
                const tileX = Math.floor(nextPos.x);
                const tileY = Math.floor(nextPos.y);
                const exitPos = levelRef.current.exitPos;
                if (tileX === exitPos.x && tileY === exitPos.y) {
                  // Block movement onto exit tile
                  return updatedEntity;
                }
                
                // Check for mob collision - prevent stacking unless one can phase or one is stationary
                const mobsAtTarget = levelRef.current.entities.filter(e => {
                  if (e.id === entity.id) return false; // Skip self
                  if (e.type !== 'enemy' && e.type !== 'boss_enemy') return false; // Only check other mobs
                  const otherTileX = Math.floor(e.pos.x);
                  const otherTileY = Math.floor(e.pos.y);
                  return otherTileX === tileX && otherTileY === tileY;
                });
                
                // Allow movement if no mobs at target, or if stacking is allowed
                let canStack = true;
                if (mobsAtTarget.length > 0) {
                  // Check if stacking is allowed: moving mob can phase OR target mob is stationary
                  const targetMob = mobsAtTarget[0];
                  canStack = entity.canPhase || (targetMob.isStationary === true);
                }
                
                if (canStack) {
                  updatedEntity.pos = nextPos;
                  enemyMoveTimersRef.current.set(entity.id, 0);
                }
              }
            }
          }
        }

        // Calculate distance to player for melee check
        const finalDistToPlayer = Math.sqrt(
          Math.pow(updatedEntity.pos.x - playerPosRef.current.x, 2) +
          Math.pow(updatedEntity.pos.y - playerPosRef.current.y, 2)
        );
        
        // Check collision with player for melee damage
        // Use distance-based check for melee attacks (1.5 tiles), exact position for ranged
        const meleeRange = 1.5;
        const isInMeleeRange = finalDistToPlayer <= meleeRange;
        const isExactPosition = updatedEntity.pos.x === playerPosRef.current.x && updatedEntity.pos.y === playerPosRef.current.y;
        
        // For non-flying mobs, only allow attacks in cardinal directions
        const canAttack = canMoveDiagonally(updatedEntity) || isInCardinalDirection(updatedEntity.pos, playerPosRef.current);
        
        if ((isExactPosition || (!entity.isRanged && isInMeleeRange)) && canAttack) {
          if (!entity.isRanged || finalDistToPlayer <= 1) {
            // Special handling for Cerberus tri-bite combo
            if (mobSubtype === 'cerberus') {
              const biteComboCount = updatedEntity.biteComboCount || 0;
              const lastBite = updatedEntity.lastBiteTime || 0;
              const timeSinceLastBite = now - lastBite;
              const lastDamageComboCount = updatedEntity.lastDamageComboCount || 0;
              
              // Apply damage when combo count changes and timing is right
              // Track which combo count has already dealt damage to prevent duplicates
              let shouldDamage = false;
              if (biteComboCount === 1 && biteComboCount > lastDamageComboCount && timeSinceLastBite < 100) {
                // First bite - immediate (within 100ms of combo start)
                shouldDamage = true;
              } else if (biteComboCount === 2 && biteComboCount > lastDamageComboCount && timeSinceLastBite >= 200 && timeSinceLastBite < 300) {
                // Second bite - around 200ms
                shouldDamage = true;
              } else if (biteComboCount === 3 && biteComboCount > lastDamageComboCount && timeSinceLastBite >= 400 && timeSinceLastBite < 500) {
                // Third bite - around 400ms
                shouldDamage = true;
              }
              
              // Also check if we just transitioned to a new combo count (fallback)
              const prevBiteComboCount = entity.biteComboCount || 0;
              if (biteComboCount > prevBiteComboCount && biteComboCount > lastDamageComboCount) {
                shouldDamage = true;
              }
              
              if (shouldDamage) {
                const lastDamageTime = enemyDamageCooldownRef.current.get(entity.id) || 0;
                // Use a short cooldown to prevent multiple hits on same bite
                if (now - lastDamageTime >= 100) {
                  const defense = getTotalDefense(loadoutRef.current);
                  const baseDamage = entity.damage;
                  const damageAfterDefense = Math.max(1, baseDamage - defense);
                  const hpRatio = baseStats.hp / baseStats.maxHp;
                  const damage = Math.max(1, Math.floor(damageAfterDefense * (1 - hpRatio * 0.3)));
                  const newHp = Math.max(0, baseStats.hp - damage);
                  
                  // Mark this combo count as having dealt damage
                  updatedEntity.lastDamageComboCount = biteComboCount;
                  
                  enemyDamageCooldownRef.current.set(entity.id, now);
                  audioManager.playSound('damage');
                  dispatch({ type: 'UPDATE_STATS', payload: { hp: newHp } });
                  
                  if (newHp <= 0 && !gameOverTriggeredRef.current) {
                    gameOverTriggeredRef.current = true;
                    audioManager.playSound('gameOver');
                    audioManager.stopMusic();
                    onGameOver();
                  }
                }
              }
            } else {
              // Normal melee damage cooldown
              const lastDamageTime = enemyDamageCooldownRef.current.get(entity.id) || 0;
              const DAMAGE_COOLDOWN_MS = entity.attackCooldown || 500;
              
              if (now - lastDamageTime >= DAMAGE_COOLDOWN_MS) {
                const defense = getTotalDefense(loadoutRef.current);
                const baseDamage = entity.damage;
                const damageAfterDefense = Math.max(1, baseDamage - defense);
                const hpRatio = baseStats.hp / baseStats.maxHp;
                const damage = Math.max(1, Math.floor(damageAfterDefense * (1 - hpRatio * 0.3)));
                const newHp = Math.max(0, baseStats.hp - damage);
                
                enemyDamageCooldownRef.current.set(entity.id, now);
                audioManager.playSound('damage');
                dispatch({ type: 'UPDATE_STATS', payload: { hp: newHp } });
                
                // Log damage event
                eventLogger.logEvent('combat', `Took ${damage} damage from ${entity.mobSubtype || 'enemy'}`, {
                  damage,
                  enemyType: entity.mobSubtype,
                  hp: newHp,
                  maxHp: baseStats.maxHp
                });
                
                if (newHp <= 0 && !gameOverTriggeredRef.current) {
                  gameOverTriggeredRef.current = true;
                  audioManager.playSound('gameOver');
                  audioManager.stopMusic();
                  onGameOver();
                }
              }
            }
          }
        } else {
          enemyDamageCooldownRef.current.delete(entity.id);
        }

        return updatedEntity;
      }
      return entity;
    });
    
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
        const enemyTypeName = enemy.mobSubtype || (enemy.isBoss ? 'Boss' : 'Enemy');
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
            // Update exit position
            levelRef.current.exitPos = { x: exitX, y: exitY };
          }
          
          // Log boss defeat event
          eventLogger.logEvent('progression', `Boss ${enemy.mobSubtype} defeated`, {
            bossType: enemy.mobSubtype
          });
        }
      });
      
      // Remove dead entities
      levelRef.current.entities = levelRef.current.entities.filter(e => 
        !((e.type === 'enemy' || e.type === 'boss_enemy') && e.hp <= 0)
      );
    }
  };

  const draw = () => {
    // Wrap entire draw function in try-catch to ensure it always completes
    try {
      const canvas = canvasRef.current;
      if (!canvas || !levelRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

    // Get color theme for current level (changes every 4 sectors)
    const theme = getThemeForLevel(state.currentLevel);

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Use visual position for camera to follow smooth movement
    const camX = visualPosRef.current.x * TILE_SIZE - canvas.width / 2 + TILE_SIZE / 2;
    const camY = visualPosRef.current.y * TILE_SIZE - canvas.height / 2 + TILE_SIZE / 2;

    ctx.save();
    ctx.translate(-camX, -camY);

    // Draw Map
    const startCol = Math.max(0, Math.floor(camX / TILE_SIZE));
    const endCol = Math.min(levelRef.current.width, startCol + (canvas.width / TILE_SIZE) + 2);
    const startRow = Math.max(0, Math.floor(camY / TILE_SIZE));
    const endRow = Math.min(levelRef.current.height, startRow + (canvas.height / TILE_SIZE) + 2);

    for (let y = startRow; y < endRow; y++) {
      for (let x = startCol; x < endCol; x++) {
        const tile = levelRef.current.tiles[y][x];
        
        if (tile === 'wall') {
          ctx.fillStyle = theme.wall;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        } else if (tile === 'floor') {
          ctx.fillStyle = theme.floor;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else if (tile === 'exit') {
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
            ctx.shadowColor = COLORS.exit;
            ctx.shadowBlur = 8;
            ctx.strokeStyle = COLORS.exit;
            ctx.lineWidth = 1;
            ctx.strokeRect(tileX + holePadding, tileY + holePadding, TILE_SIZE - holePadding * 2, TILE_SIZE - holePadding * 2);
            ctx.shadowBlur = 0;
          }
        }
      }
    }

    // Draw Particles (fading pixie trail for moth)
    try {
      if (levelRef.current.particles && levelRef.current.particles.length > 0) {
        levelRef.current.particles.forEach((particle: Particle) => {
          const age = Date.now() - particle.createdAt;
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
          const age = Date.now() - afterimage.createdAt;
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
          const age = Date.now() - footprint.createdAt;
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

    // Draw Entities with unique appearances
    levelRef.current.entities.forEach(entity => {
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
      
      // Save context state before drawing
      ctx.save();
      
      // Special rendering for bosses
      if (entity.isBoss) {
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        
        if (entity.mobSubtype === 'boss_zeus') {
          // Zeus Boss: Electric energy effect with lightning glow
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
          ctx.fill();
          // Inner glow
          ctx.shadowBlur = 8;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.beginPath();
          ctx.arc(centerX, centerY, size / 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (entity.mobSubtype === 'boss_hades') {
          // Hades Boss: Shadow/void effect with purple glow
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
          ctx.fill();
          // Dark center
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.beginPath();
          ctx.arc(centerX, centerY, size / 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (entity.mobSubtype === 'boss_ares') {
          // Ares Boss: Aggressive red with charge indicator
          if (entity.chargeDirection) {
            // Enhanced glow when charging
            ctx.shadowColor = color;
            ctx.shadowBlur = 20;
          } else {
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
          }
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
          ctx.fill();
          // Inner fire effect
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255, 100, 0, 0.8)';
          ctx.beginPath();
          ctx.arc(centerX, centerY, size / 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Default boss rendering
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (entity.mobSubtype === 'phase') {
        // Hades Phase: Ghost/wraith appearance with bright eyes
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        
        // Wispy, ethereal body - elongated oval shape
        ctx.save();
        ctx.globalAlpha = 0.7; // Semi-transparent ghostly effect
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        
        // Main body - elongated oval (wraith shape)
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, size / 2.2, size / 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Wispy tail/body extension
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + size / 3, size / 3, size / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
        ctx.restore();
        
        // Inner glow for ethereal effect
        ctx.fillStyle = 'rgba(157, 78, 221, 0.4)'; // Lighter purple
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, size / 3, size / 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Small, bright eyes
        const eyeSize = 2.5;
        const eyeY = centerY - size / 4;
        const eyeSpacing = size / 4;
        
        // Left eye - bright cyan
        ctx.fillStyle = '#00FFFF'; // Bright cyan
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(centerX - eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Right eye - bright cyan
        ctx.beginPath();
        ctx.arc(centerX + eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye pupils
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(centerX - eyeSpacing, eyeY, eyeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(centerX + eyeSpacing, eyeY, eyeSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (entity.mobSubtype === 'charger') {
        // Ares Charger: Octagon with horns and nose ring
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        
        // Glowing effect when charging
        if (entity.chargeDirection) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
        }
        
        // Octagon shape
        ctx.fillStyle = color;
        ctx.beginPath();
        const octagonRadius = size / 2;
        const numSides = 8;
        for (let i = 0; i < numSides; i++) {
          const angle = (i / numSides) * Math.PI * 2 - Math.PI / 2; // Start from top
          const x = centerX + Math.cos(angle) * octagonRadius;
          const y = centerY + Math.sin(angle) * octagonRadius;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // White triangles for horns on either side
        const hornSize = size * 0.25;
        const hornOffset = size * 0.4;
        // Left horn
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(centerX - hornOffset, centerY - size * 0.15);
        ctx.lineTo(centerX - hornOffset - hornSize * 0.5, centerY - size * 0.35);
        ctx.lineTo(centerX - hornOffset + hornSize * 0.5, centerY - size * 0.35);
        ctx.closePath();
        ctx.fill();
        // Right horn
        ctx.beginPath();
        ctx.moveTo(centerX + hornOffset, centerY - size * 0.15);
        ctx.lineTo(centerX + hornOffset - hornSize * 0.5, centerY - size * 0.35);
        ctx.lineTo(centerX + hornOffset + hornSize * 0.5, centerY - size * 0.35);
        ctx.closePath();
        ctx.fill();
        
        // Yellow half hollow circle for bull's nose ring in the middle
        const noseRingRadius = size * 0.1; // Smaller
        const noseRingThickness = 3.5; // Thicker
        ctx.strokeStyle = '#FFD700'; // Yellow
        ctx.lineWidth = noseRingThickness;
        ctx.beginPath();
        ctx.arc(centerX, centerY + size * 0.1, noseRingRadius, 0, Math.PI);
        ctx.stroke();
      } else if (entity.mobSubtype === 'turret') {
        // Hephaestus Turret: Base, turret top, and gun barrel pointing left
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        const baseSize = size * 0.7;
        const turretSize = size * 0.6;
        
        // Base (bottom rectangle)
        ctx.fillStyle = color;
        ctx.fillRect(
          centerX - baseSize / 2,
          centerY + baseSize / 4,
          baseSize,
          baseSize / 2
        );
        
        // Turret top (square on top of base)
        ctx.fillStyle = '#0d8f6a';
        ctx.fillRect(
          centerX - turretSize / 2,
          centerY - turretSize / 2,
          turretSize,
          turretSize
        );
        
        // Glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#0d8f6a';
        ctx.fillRect(
          centerX - turretSize / 2 + 3,
          centerY - turretSize / 2 + 3,
          turretSize - 6,
          turretSize - 6
        );
        ctx.shadowBlur = 0;
        
        // Gun barrel pointing left - shorter and same color as turret
        const barrelLength = size * 0.35; // Shorter
        const barrelWidth = size * 0.3;
        const barrelX = centerX - turretSize / 2 - barrelLength;
        const barrelY = centerY - barrelWidth / 2;
        
        // Main barrel body (same color as turret)
        ctx.fillStyle = '#0d8f6a';
        ctx.fillRect(barrelX, barrelY, barrelLength, barrelWidth);
        
        // Barrel outline for definition
        ctx.strokeStyle = '#0d8f6a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barrelX, barrelY, barrelLength, barrelWidth);
        
        // Barrel tip (slightly darker turret color)
        ctx.fillStyle = '#0a6b52';
        ctx.fillRect(barrelX, barrelY, barrelLength * 0.2, barrelWidth);
        
        // Barrel connection to turret (mount)
        ctx.fillStyle = '#0d8f6a';
        ctx.fillRect(centerX - turretSize / 2 - 3, centerY - barrelWidth / 3, 3, barrelWidth * 0.67);
        
        // Barrel details (rings/segments)
        ctx.strokeStyle = '#0a6b52';
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          const ringX = barrelX + (barrelLength * 0.33 * i);
          ctx.beginPath();
          ctx.moveTo(ringX, barrelY);
          ctx.lineTo(ringX, barrelY + barrelWidth);
          ctx.stroke();
        }
      } else if (entity.mobSubtype === 'sniper') {
        // Apollo Sniper: Diamond shape with reticle
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        
        // Diamond shape
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - size / 2);
        ctx.lineTo(centerX + size / 2, centerY);
        ctx.lineTo(centerX, centerY + size / 2);
        ctx.lineTo(centerX - size / 2, centerY);
        ctx.closePath();
        ctx.fill();
        
        // Reticle (crosshair) in center with detail
        const reticleSize = size * 0.35;
        const reticleThickness = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = reticleThickness;
        
        // Two concentric circles
        ctx.beginPath();
        ctx.arc(centerX, centerY, reticleSize * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centerX, centerY, reticleSize * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        
        // Horizontal line with tick marks
        ctx.beginPath();
        ctx.moveTo(centerX - reticleSize / 2, centerY);
        ctx.lineTo(centerX + reticleSize / 2, centerY);
        ctx.stroke();
        // Top tick marks
        const tickLength = 3;
        ctx.beginPath();
        ctx.moveTo(centerX - reticleSize * 0.4, centerY - tickLength);
        ctx.lineTo(centerX - reticleSize * 0.4, centerY + tickLength);
        ctx.moveTo(centerX + reticleSize * 0.4, centerY - tickLength);
        ctx.lineTo(centerX + reticleSize * 0.4, centerY + tickLength);
        ctx.stroke();
        
        // Vertical line with tick marks
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - reticleSize / 2);
        ctx.lineTo(centerX, centerY + reticleSize / 2);
        ctx.stroke();
        // Side tick marks
        ctx.beginPath();
        ctx.moveTo(centerX - tickLength, centerY - reticleSize * 0.4);
        ctx.lineTo(centerX + tickLength, centerY - reticleSize * 0.4);
        ctx.moveTo(centerX - tickLength, centerY + reticleSize * 0.4);
        ctx.lineTo(centerX + tickLength, centerY + reticleSize * 0.4);
        ctx.stroke();
        
        // Center dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, reticleThickness, 0, Math.PI * 2);
        ctx.fill();
      } else if (entity.mobSubtype === 'moth') {
        // Nyx Glitchmoth: Smaller body with transparent wings and pixie trail
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        const bodySize = size / 3; // Smaller body (was size / 2)
        
        // Draw transparent wings first (behind body)
        ctx.save();
        ctx.globalAlpha = 0.3; // Transparent wings
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        
        // Left wing
        ctx.beginPath();
        ctx.ellipse(
          centerX - bodySize * 0.8,
          centerY,
          bodySize * 1.2,
          bodySize * 0.8,
          -0.3,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        // Right wing
        ctx.beginPath();
        ctx.ellipse(
          centerX + bodySize * 0.8,
          centerY,
          bodySize * 1.2,
          bodySize * 0.8,
          0.3,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
        
        // Draw main body - smaller
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(centerX, centerY, bodySize, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner glow
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#2d1a5a';
        ctx.beginPath();
        ctx.arc(centerX, centerY, bodySize / 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (entity.mobSubtype === 'tracker') {
        // Artemis Tracker: Lunar Neon, angular shape
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        ctx.beginPath();
        // Angular/predator shape
        ctx.moveTo(centerX, centerY - size / 2);
        ctx.lineTo(centerX + size / 2, centerY);
        ctx.lineTo(centerX, centerY + size / 2);
        ctx.lineTo(centerX - size / 3, centerY + size / 4);
        ctx.lineTo(centerX - size / 2, centerY);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (entity.mobSubtype === 'cerberus') {
        // Cerberus Firewall: Brimstone Vermillion, three-part design (three heads)
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        // Draw three heads
        const headSize = size / 3;
        // Left head
        ctx.beginPath();
        ctx.arc(centerX - size / 3, centerY, headSize / 2, 0, Math.PI * 2);
        ctx.fill();
        // Center head
        ctx.beginPath();
        ctx.arc(centerX, centerY, headSize / 2, 0, Math.PI * 2);
        ctx.fill();
        // Right head
        ctx.beginPath();
        ctx.arc(centerX + size / 3, centerY, headSize / 2, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillRect(centerX - size / 2, centerY, size, size / 2);
        ctx.shadowBlur = 0;
      } else if (entity.mobSubtype === 'drone') {
        // Hermes Drone: Redesigned with pronounced yellow eye
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        
        // Main body with glow
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner darker circle for depth
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, size / 2.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Pronounced yellow eye (smaller so pink is visible)
        const eyeSize = size / 4.5; // Smaller than before (was size / 3)
        ctx.fillStyle = '#FFD700'; // Bright yellow
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(centerX, centerY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye highlight/glow
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFF00'; // Brighter yellow for highlight
        ctx.beginPath();
        ctx.arc(centerX - eyeSize / 4, centerY - eyeSize / 4, eyeSize / 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye pupil
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(centerX, centerY, eyeSize / 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (entity.mobSubtype === 'guardian') {
        // Athena Guardian: Helmet with glowing eye space
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        
        // Helmet shape (rounded top, wider bottom)
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        // Top curve (helmet dome)
        ctx.arc(centerX, centerY - size * 0.15, size * 0.35, Math.PI, 0, false);
        // Sides
        ctx.lineTo(centerX + size * 0.4, centerY + size * 0.35);
        // Bottom curve
        ctx.arc(centerX, centerY + size * 0.35, size * 0.4, 0, Math.PI, true);
        // Other side
        ctx.lineTo(centerX - size * 0.4, centerY - size * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Glowing eye space (horizontal slit)
        const eyeSlitWidth = size * 0.5;
        const eyeSlitHeight = size * 0.12;
        const eyeSlitY = centerY - size * 0.05;
        
        // Eye glow
        ctx.fillStyle = '#00FFFF'; // Bright cyan glow
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = 15;
        ctx.fillRect(
          centerX - eyeSlitWidth / 2,
          eyeSlitY - eyeSlitHeight / 2,
          eyeSlitWidth,
          eyeSlitHeight
        );
        ctx.shadowBlur = 0;
        
        // Eye slit outline
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          centerX - eyeSlitWidth / 2,
          eyeSlitY - eyeSlitHeight / 2,
          eyeSlitWidth,
          eyeSlitHeight
        );
      } else if (entity.mobSubtype === 'swarm') {
        // Minion Swarm: Multiple small squares with eyes (matching compendium)
        const centerX = entity.pos.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = entity.pos.y * TILE_SIZE + TILE_SIZE / 2;
        const minionSize = size / 2.5; // Smaller squares
        
        // Render multiple small minions in a pattern
        const positions = [
          { x: centerX - minionSize * 0.6, y: centerY - minionSize * 0.6 },
          { x: centerX + minionSize * 0.6, y: centerY - minionSize * 0.6 },
          { x: centerX - minionSize * 0.6, y: centerY + minionSize * 0.6 },
          { x: centerX + minionSize * 0.6, y: centerY + minionSize * 0.6 },
          { x: centerX, y: centerY - minionSize * 0.9 },
          { x: centerX, y: centerY + minionSize * 0.9 },
          { x: centerX - minionSize * 0.9, y: centerY },
          { x: centerX + minionSize * 0.9, y: centerY },
        ];
        
        positions.forEach(pos => {
          // Outer square
          ctx.fillStyle = color;
          ctx.fillRect(pos.x - minionSize / 2, pos.y - minionSize / 2, minionSize, minionSize);
          
          // Inner square with glow
          ctx.shadowColor = color;
          ctx.shadowBlur = 6;
          ctx.fillStyle = '#ffd633';
          ctx.fillRect(pos.x - minionSize / 2 + 1, pos.y - minionSize / 2 + 1, minionSize - 2, minionSize - 2);
          ctx.shadowBlur = 0;
          
          // Black dots for eyes (larger)
          const eyeSize = 2.5;
          ctx.fillStyle = '#000000';
          ctx.fillRect(pos.x - minionSize / 4 - eyeSize / 2, pos.y - minionSize / 4 - eyeSize / 2, eyeSize, eyeSize);
          ctx.fillRect(pos.x + minionSize / 4 - eyeSize / 2, pos.y - minionSize / 4 - eyeSize / 2, eyeSize, eyeSize);
        });
      } else {
        // Default: Circle for most mobs
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(
          entity.pos.x * TILE_SIZE + TILE_SIZE / 2,
          entity.pos.y * TILE_SIZE + TILE_SIZE / 2,
          size / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      
      // Restore context state (resets globalAlpha and shadow)
      ctx.restore();
      
      // Health bar (always fully opaque)
      ctx.fillStyle = '#ff0000';
      const barWidth = TILE_SIZE - 4;
      const barHeight = 3;
      ctx.fillRect(entity.pos.x * TILE_SIZE + 2, entity.pos.y * TILE_SIZE + 2, barWidth, barHeight);
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(entity.pos.x * TILE_SIZE + 2, entity.pos.y * TILE_SIZE + 2, (entity.hp / entity.maxHp) * barWidth, barHeight);
    });

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
      const time = Date.now() * 0.003; // Slow animation
      
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
        if (!levelRef.current.particles) {
          levelRef.current.particles = [];
        }
        // Add new particles occasionally
        if (Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.5 + Math.random() * 0.5;
          const particle = {
            id: `portal-particle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            pos: {
              x: centerX + Math.cos(angle) * (portalSize / 2 - 5),
              y: centerY + Math.sin(angle) * (portalSize / 2 - 5),
            },
            createdAt: Date.now(),
            lifetime: 1000 + Math.random() * 500, // 1-1.5 seconds
            velocity: {
              x: Math.cos(angle) * speed,
              y: Math.sin(angle) * speed,
            },
          };
          levelRef.current.particles.push(particle as any);
        }
        
        // Draw existing particles
        if (levelRef.current.particles) {
          const now = Date.now();
          levelRef.current.particles = levelRef.current.particles.filter((p: any) => {
          if (p.id && p.id.startsWith('portal-particle-')) {
            const age = now - p.createdAt;
            if (age > p.lifetime) return false;
            
            // Update particle position
            if (p.velocity) {
              p.pos.x += p.velocity.x;
              p.pos.y += p.velocity.y;
            }
            
            // Draw particle (bright, fading)
            const alpha = 1 - (age / p.lifetime);
            ctx.fillStyle = `rgba(255, 200, 255, ${alpha})`;
            ctx.shadowColor = 'rgba(255, 200, 255, 0.8)';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            return true;
          }
          return true;
        });
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

    ctx.restore();

    // Spotlight + Fog - use effective stats including item bonuses
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const modifiers = getModifiers();
    const effectiveStats = getEffectiveStats(statsRef.current, loadoutRef.current);
    // Apply vision debuff if active (stacks up to complete blindness)
    let visionMultiplier = modifiers.visionMult;
    if (visionDebuffLevelRef.current > 0) {
      // Debuff level 0 = no reduction, 1.0 = complete blindness (0 radius)
      visionMultiplier *= (1.0 - visionDebuffLevelRef.current);
    }
    // Apply temporary vision boost from Potion of Light
    let visionBoost = 0;
    if (temporaryVisionBoostRef.current) {
      const now = Date.now();
      if (now < temporaryVisionBoostRef.current.endTime) {
        visionBoost = temporaryVisionBoostRef.current.amount;
        // For Legendary (full maze reveal), use a very large radius
        if (visionBoost >= 9999) {
          visionBoost = Math.max(canvas.width, canvas.height) * 2; // Large enough to reveal entire maze
        }
      }
    }
    // Apply lightswitch full reveal effect
    const now = Date.now();
    if (lightswitchRevealEndTimeRef.current && now < lightswitchRevealEndTimeRef.current) {
      // Full maze reveal (very large radius)
      visionBoost = Math.max(canvas.width, canvas.height) * 2;
    }
    const radius = (effectiveStats.visionRadius + visionBoost) * visionMultiplier * TILE_SIZE;

    // Create radial gradient for smooth fade effect
    const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)'); // Transparent in center
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.1)'); // Very subtle fade starts
    gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.3)'); // Gentle fade
    gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.6)'); // Moderate fade
    gradient.addColorStop(0.95, 'rgba(0, 0, 0, 0.9)'); // Near opaque
    gradient.addColorStop(1, 'rgba(0, 0, 0, 1)'); // Fully opaque at edges

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Scroll Sense Effects (above spotlight overlay)
    // Threat-sense: Show all enemies, Loot-sense: Show all items
    if (levelRef.current && (activeScrollEffectsRef.current.threatSense || activeScrollEffectsRef.current.lootSense)) {
      ctx.save();
      
      // Calculate player screen position
      const playerScreenX = canvas.width / 2;
      const playerScreenY = canvas.height / 2;
      const effectiveStats = getEffectiveStats(statsRef.current, loadoutRef.current);
      let visionMultiplier = modifiers.visionMult;
      if (visionDebuffLevelRef.current > 0) {
        visionMultiplier *= (1.0 - visionDebuffLevelRef.current);
      }
      let visionBoost = 0;
      if (temporaryVisionBoostRef.current) {
        if (now < temporaryVisionBoostRef.current.endTime) {
          visionBoost = temporaryVisionBoostRef.current.amount;
          if (visionBoost >= 9999) {
            visionBoost = Math.max(canvas.width, canvas.height) * 2;
          }
        }
      }
      if (lightswitchRevealEndTimeRef.current && now < lightswitchRevealEndTimeRef.current) {
        visionBoost = Math.max(canvas.width, canvas.height) * 2;
      }
      const visionRadius = (effectiveStats.visionRadius + visionBoost) * visionMultiplier * TILE_SIZE;
      
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
            
            // Check if entity is outside visible range
            const isOutsideRange = distFromPlayer > visionRadius;
            
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
              if (levelRef.current && !levelRef.current.particles) {
                levelRef.current.particles = [];
              }
              if (Math.random() < 0.1 && levelRef.current) {
                const angle = Math.random() * Math.PI * 2;
                const sparkle = {
                  id: `threatsense-sparkle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  pos: {
                    x: entityScreenX + Math.cos(angle) * (size / 2),
                    y: entityScreenY + Math.sin(angle) * (size / 2),
                  },
                  createdAt: Date.now(),
                  lifetime: 500 + Math.random() * 300,
                };
                levelRef.current.particles.push(sparkle as any);
              }
            } else {
              // Entity is in range - ensure it's fully visible with no blur, no particles, no rarity color effects
              ctx.save();
              ctx.filter = 'none'; // Explicitly clear blur
              ctx.globalAlpha = 1.0; // Full opacity
              ctx.shadowBlur = 0; // Clear any shadow effects
              ctx.shadowColor = 'transparent'; // Clear shadow color
              
              const size = TILE_SIZE * 0.6;
              ctx.fillStyle = '#ff4444';
              ctx.beginPath();
              ctx.arc(entityScreenX, entityScreenY, size / 2, 0, Math.PI * 2);
              ctx.fill();
              
              ctx.restore();
              
              // Track this entity's position to remove nearby particles
              entitiesInRange.push({ x: entityScreenX, y: entityScreenY });
            }
          }
        });
        
        // Remove particles near entities that are now in range
        if (levelRef.current && levelRef.current.particles && entitiesInRange.length > 0) {
          levelRef.current.particles = levelRef.current.particles.filter((p: any) => {
            if (p.id && p.id.startsWith('threatsense-sparkle-')) {
              // Check if this particle is near any entity that's in range
              for (const entityPos of entitiesInRange) {
                const dist = Math.sqrt(
                  Math.pow(p.pos.x - entityPos.x, 2) + Math.pow(p.pos.y - entityPos.y, 2)
                );
                if (dist < TILE_SIZE * 1.5) {
                  return false; // Remove particle
                }
              }
            }
            return true;
          });
        }
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
            if (levelRef.current && !levelRef.current.particles) {
              levelRef.current.particles = [];
            }
            if (Math.random() < 0.1 && levelRef.current) {
              const angle = Math.random() * Math.PI * 2;
              const sparkle = {
                id: `lootsense-sparkle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                pos: {
                  x: itemScreenX + Math.cos(angle) * (itemSize / 2),
                  y: itemScreenY + Math.sin(angle) * (itemSize / 2),
                },
                createdAt: Date.now(),
                lifetime: 500 + Math.random() * 300,
              };
              levelRef.current.particles.push(sparkle as any);
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
          levelRef.current.particles = levelRef.current.particles.filter((p: any) => {
            if (p.id && p.id.startsWith('lootsense-sparkle-')) {
              // Check if this particle is near any item that's in range
              for (const itemPos of itemsInRange) {
                const dist = Math.sqrt(
                  Math.pow(p.pos.x - itemPos.x, 2) + Math.pow(p.pos.y - itemPos.y, 2)
                );
                if (dist < TILE_SIZE * 1.5) {
                  return false; // Remove particle
                }
              }
            }
            return true;
          });
        }
      }
      
      // Draw sparkling particles for sense effects
      if (levelRef.current && levelRef.current.particles) {
        const particleNow = Date.now();
        levelRef.current.particles = levelRef.current.particles.filter((p: any) => {
          if (p.id && (p.id.startsWith('threatsense-sparkle-') || p.id.startsWith('lootsense-sparkle-'))) {
            const age = particleNow - p.createdAt;
            if (age > p.lifetime) return false;
            
            // Draw sparkling particle
            const alpha = 1 - (age / p.lifetime);
            ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
            ctx.shadowColor = 'rgba(255, 255, 200, 0.8)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            return true;
          }
          return true;
        });
      }
      
      ctx.restore();
    }

    // Draw mobile time progress bar at the bottom
    // Check window width directly for immediate detection (mobile breakpoint is 768px)
    const isMobileWidth = window.innerWidth < 768;
    if (isMobileWidth && levelRef.current && !levelRef.current.isShop && !levelRef.current.isBoss && !showBonusSelection) {
      const modifiers = getModifiers();
      const timeLimit = LEVEL_TIME_LIMIT * modifiers.timerMult * 1000; // ms
      const elapsed = Date.now() - levelStartTimeRef.current;
      const remaining = Math.max(0, timeLimit - elapsed);
      const progress = Math.min(1, remaining / timeLimit);
      
      // Minimal progress bar at the very bottom
      const barHeight = 3; // Thin bar
      const barY = canvas.height - barHeight;
      const barWidth = canvas.width;
      
      // Background (dark)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, barY, barWidth, barHeight);
      
      // Progress fill (cyan to match game theme)
      const progressWidth = barWidth * progress;
      if (progress > 0.3) {
        ctx.fillStyle = COLORS.player; // Cyan
      } else {
        // Red when time is running low
        ctx.fillStyle = '#ff2a6d'; // Red
      }
      ctx.fillRect(0, barY, progressWidth, barHeight);
    }

    // CRT Scanlines overlay is now handled by GameOverlay component
    // to ensure consistent application across canvas and React UI elements
    } catch (error) {
      // If draw fails, log error but don't block the game loop
      console.error('Error in draw function:', error);
    }
  };

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
        width={canvasSizeRef.current.width} 
        height={canvasSizeRef.current.height}
        className="block touch-none"
        style={{ position: 'relative', zIndex: 0 }}
      />
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
