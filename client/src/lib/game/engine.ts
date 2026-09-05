import { Level, TileType, Position, Entity, Item, MobSubtype, PlayerStats, GameState } from './types';
import { SHOP_INTERVAL, BOSS_INTERVAL, MOB_TYPES, SWARM_SPAWN_COUNT } from './constants';
import { getAvailableMobs, scaledAttackCooldown, scaledMoveSpeed } from './mobBalance';
import { generateItem } from './items';
import { calculateScaling, calculatePlayerPower } from './scaling';
import { recordItemOffer } from './itemEconomy';
import { generateBossArena, type ArenaBoss } from './arena';
import { ENTITY_CAP, selectionCost, threatBudget } from './ai/encounterBudget';

export const generateLevel = (
  levelNum: number,
  width: number,
  height: number,
  playerStats?: PlayerStats,
  loadout?: GameState['loadout']
): Level => {
  // Determine level type
  const isBoss = levelNum % BOSS_INTERVAL === 0 && levelNum > 0;
  const isShop = levelNum % SHOP_INTERVAL === 0 && !isBoss;

  // Which boss this sector holds. Needed up front now: the arena is shaped for
  // the boss, so the choice cannot wait until entities are placed.
  const BOSS_CYCLE: MobSubtype[] = ['boss_zeus', 'boss_hades', 'boss_ares'];
  const bossType = isBoss
    ? (BOSS_CYCLE[(Math.floor(levelNum / BOSS_INTERVAL) - 1 + BOSS_CYCLE.length) % BOSS_CYCLE.length] as ArenaBoss)
    : null;

  // Boss sectors get a purpose-built arena instead of the maze. A maze is a
  // one-way advantage for a boss that phases through it, and it cancels the
  // charge of one that cannot. Only the topology changes — items, portals,
  // lightswitches, the boss itself and the exit-on-death behaviour all run
  // through the same code below as before.
  const arena = isBoss && bossType ? generateBossArena(width, height, bossType) : null;

  // Initialize grid with walls
  const tiles: TileType[][] = arena
    ? arena.tiles
    : Array(height).fill(null).map(() => Array(width).fill('wall'));
  
  // Simple Recursive Backtracker for Maze Generation
  const visited: boolean[][] = Array(height).fill(false).map(() => Array(width).fill(false));
  const stack: Position[] = [];
  
  let startPos: Position = arena ? arena.startPos : { x: 1, y: 1 };
  stack.push(arena ? { x: 1, y: 1 } : startPos);
  visited[startPos.y][startPos.x] = true;
  tiles[startPos.y][startPos.x] = 'floor';
  
  const directions = [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
    { x: -2, y: 0 },
    { x: 2, y: 0 }
  ];
  
  while (!arena && stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = [];
    
    for (const dir of directions) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      
      if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && !visited[ny][nx]) {
        neighbors.push({ x: nx, y: ny, dx: dir.x / 2, dy: dir.y / 2 });
      }
    }
    
    if (neighbors.length > 0) {
      const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
      tiles[current.y + chosen.dy][current.x + chosen.dx] = 'floor';
      tiles[chosen.y][chosen.x] = 'floor';
      visited[chosen.y][chosen.x] = true;
      stack.push({ x: chosen.x, y: chosen.y });
    } else {
      stack.pop();
    }
  }
  
  // Place Exit - ensure it's on a floor tile and reachable
  // Use BFS to find the farthest reachable floor tile from start
  const findFarthestReachableTile = (start: Position): Position | null => {
    const queue: Position[] = [start];
    const visited: boolean[][] = Array(height).fill(false).map(() => Array(width).fill(false));
    visited[start.y][start.x] = true;
    let farthest: Position = start;
    let maxDistance = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const distance = Math.abs(current.x - start.x) + Math.abs(current.y - start.y);
      
      if (distance > maxDistance && tiles[current.y][current.x] === 'floor') {
        maxDistance = distance;
        farthest = current;
      }

      const neighbors = [
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 },
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
      ];

      for (const neighbor of neighbors) {
        if (neighbor.x >= 0 && neighbor.x < width && 
            neighbor.y >= 0 && neighbor.y < height &&
            !visited[neighbor.y][neighbor.x] &&
            tiles[neighbor.y][neighbor.x] !== 'wall') {
          visited[neighbor.y][neighbor.x] = true;
          queue.push(neighbor);
        }
      }
    }

    return farthest;
  };

  let exitPos = findFarthestReachableTile(startPos);
  
  // Fallback: find any floor tile if pathfinding fails
  if (!exitPos || tiles[exitPos.y][exitPos.x] !== 'floor') {
    // Find the first floor tile as fallback
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        if (tiles[y][x] === 'floor') {
          exitPos = { x, y };
          break;
        }
      }
      if (exitPos) break;
    }
  }
  
  // Set exit tile (skip for boss sectors - exit will spawn when boss is defeated)
  if (!isBoss) {
    if (exitPos && tiles[exitPos.y][exitPos.x] === 'floor') {
      tiles[exitPos.y][exitPos.x] = 'exit';
    } else {
      // Last resort: use default position
      exitPos = { x: width - 2, y: height - 2 };
      tiles[exitPos.y][exitPos.x] = 'exit';
    }
  } else {
    // For boss sectors, set a placeholder exitPos (will be updated when boss dies)
    if (!exitPos) {
      exitPos = { x: width - 2, y: height - 2 };
    }
  }

  // Add random loops. Skipped in an arena: carving at random would punch holes
  // through the pillars and break the two-tile separation that keeps every gap
  // walkable and every pillar circumnavigable.
  for (let i = 0; !arena && i < width * height * 0.05; i++) {
    const rx = Math.floor(Math.random() * (width - 2)) + 1;
    const ry = Math.floor(Math.random() * (height - 2)) + 1;
    if (tiles[ry][rx] === 'wall') {
      let floors = 0;
      if (tiles[ry+1]?.[rx] === 'floor') floors++;
      if (tiles[ry-1]?.[rx] === 'floor') floors++;
      if (tiles[ry]?.[rx+1] === 'floor') floors++;
      if (tiles[ry]?.[rx-1] === 'floor') floors++;
      if (floors >= 2) tiles[ry][rx] = 'floor';
    }
  }
  
  // Spawn Entities
  const entities: Entity[] = [];
  
  // Helper function to find a valid floor tile
  const findValidFloorTile = (preferredX?: number, preferredY?: number, minDistanceFromStart = 5): Position | null => {
    // First, try preferred position if provided
    if (preferredX !== undefined && preferredY !== undefined) {
      const px = Math.floor(preferredX);
      const py = Math.floor(preferredY);
      if (px >= 0 && px < width && py >= 0 && py < height && 
          tiles[py][px] === 'floor' &&
          (px !== exitPos.x || py !== exitPos.y) &&
          (Math.abs(px - startPos.x) >= minDistanceFromStart || Math.abs(py - startPos.y) >= minDistanceFromStart)) {
        return { x: px, y: py };
      }
    }
    
    // Collect all valid floor positions (excluding exit)
    const validPositions: Position[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x] === 'floor' &&
            (x !== exitPos.x || y !== exitPos.y) &&
            (Math.abs(x - startPos.x) >= minDistanceFromStart || Math.abs(y - startPos.y) >= minDistanceFromStart)) {
          validPositions.push({ x, y });
        }
      }
    }
    
    if (validPositions.length === 0) {
      // Fallback: any floor tile if no valid positions found (still excluding exit)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (tiles[y][x] === 'floor' && (x !== exitPos.x || y !== exitPos.y)) {
            return { x, y };
          }
        }
      }
      return null;
    }
    
    return validPositions[Math.floor(Math.random() * validPositions.length)];
  };
  
  // Helper function to select mob type based on level and weights
  const selectMobType = (levelNum: number, isBoss: boolean, isShop: boolean): typeof MOB_TYPES[0] | null => {
    // Progressive introduction, one new mob roughly every 4 normal levels, in
    // difficulty order: swarm/drone -> phase -> moth -> sniper -> charger ->
    // tracker -> turret -> guardian. `MobTypeDef.minLevel` is the whole rule; a
    // hardcoded ladder here used to mirror it, giving two sources of truth.
    const availableMobs = getAvailableMobs(levelNum);
    if (availableMobs.length === 0) return null;
    
    // Calculate total weight
    const totalWeight = availableMobs.reduce((sum: number, mob: typeof MOB_TYPES[0]) => sum + mob.spawnWeight, 0);
    if (totalWeight === 0) return null;
    
    // Weighted random selection
    let random = Math.random() * totalWeight;
    for (const mob of availableMobs) {
      random -= mob.spawnWeight;
      if (random <= 0) return mob;
    }
    
    return availableMobs[0]; // Fallback
  };

  if (isBoss) {
    // Single boss - find valid floor tile near center
    const bossPos = findValidFloorTile(width / 2, height / 2, 5);
    if (bossPos) {
      // Select boss type based on level (cycle through boss types)
      const bossTypes: MobSubtype[] = ['boss_zeus', 'boss_hades', 'boss_ares'];
      const bossType = bossTypes[(Math.floor(levelNum / BOSS_INTERVAL) - 1) % bossTypes.length];
      
      // Calculate boss scaling
      const bossScaling = calculateScaling({
        level: levelNum,
        sectorType: 'boss',
        mobArchetype: 'boss',
        playerPower: playerStats && loadout ? calculatePlayerPower(playerStats, loadout) : undefined,
        useAdaptive: !!(playerStats && loadout),
        loadout: loadout,
        useEconomyIndex: !!(playerStats && loadout)
      });
      
      const baseHp = 150 + levelNum * 15;
      const baseDamage = 20 + levelNum * 2;
      
      entities.push({
        id: 'boss-1',
        type: 'boss_enemy',
        pos: bossPos,
        hp: Math.floor(baseHp * bossScaling.hpMultiplier),
        maxHp: Math.floor(baseHp * bossScaling.hpMultiplier),
        damage: Math.floor(baseDamage * bossScaling.dmgMultiplier),
        isBoss: true,
        mobSubtype: bossType,
        moveSpeed: 0.8,
        attackCooldown: 1000,
        lastAttackTime: 0,
        canPhase: bossType === 'boss_hades',
        isRanged: bossType === 'boss_zeus',
        range: bossType === 'boss_zeus' ? 6 : 1,
        isStationary: false,
        chargeDirection: bossType === 'boss_ares' ? null : undefined, // Initialize for Ares boss
      });
    }
    
    // No adds at generation time. Every boss used to arrive with a random 2–4
    // Cerberus, which made a first encounter's difficulty an RNG roll and
    // buried the boss's own mechanic under add pressure. Adds are now driven by
    // the boss's remaining HP at runtime — see ai/bossAdds.ts — so they arrive
    // as an escalation the player causes rather than a hand they were dealt.
  } else if (!isShop) {
    // Normal enemies - prevent infinite loop with max attempts
    // Number of enemies scales with level, with more variety at higher levels.
    // The cap counts *entities*: a swarm selection spawns 2-3 mobs, so counting
    // selections used to overshoot the cap by ~30% at high sectors.
    // Population comes from a threat budget, not a headcount. Counting heads let
    // a stronger archetype be added on top of the previous population at the
    // same price — unlocking the sniper at 13 dropped a 35%-of-bar attacker into
    // an already-full sector, which the M6.6 harness measured as a 2.4x jump in
    // peak pressure across one boundary. Weights still choose *what* appears, so
    // the unlock sequence and the character of each tier are unchanged; the
    // budget decides *how many*.
    const budget = threatBudget(levelNum);
    let spentThreat = 0;
    // The entity cap survives as what it always should have been: a performance
    // limit, not the difficulty model.
    const numEnemies = ENTITY_CAP;
    const maxAttempts = 1000; // Safety limit
    let attempts = 0;
    let enemyCounter = 0;
    let spawned = 0;
    
    while (spentThreat < budget && spawned < numEnemies && attempts < maxAttempts) {
      const mobType = selectMobType(levelNum, isBoss, isShop);
      if (!mobType) break; // No valid mob types available

      // Priced per selection, so a swarm pack costs what a pack costs. A
      // selection that would overrun the budget is skipped rather than
      // truncated: an expensive mob never appears at a discount.
      const cost = selectionCost(mobType.subtype);
      if (spentThreat + cost > budget) {
        attempts++;
        continue;
      }
      spentThreat += cost;

      // For swarm mobs, spawn a small pack at once
      const [swarmMin, swarmMax] = SWARM_SPAWN_COUNT;
      const spawnCount = mobType.subtype === 'swarm'
        ? Math.floor(Math.random() * (swarmMax - swarmMin + 1)) + swarmMin
        : 1;
      
      for (let j = 0; j < spawnCount && attempts < maxAttempts && spawned < numEnemies; j++) {
        // For stationary turrets, prefer positions with good sightlines
        let enemyPos: Position | null;
        if (mobType.isStationary) {
          // Try to place turrets in more open areas
          enemyPos = findValidFloorTile(undefined, undefined, 5);
        } else {
          enemyPos = findValidFloorTile(undefined, undefined, 5);
        }
        
        if (enemyPos) {
          // Calculate scaling for this mob
          const scaling = calculateScaling({
            level: levelNum,
            sectorType: 'normal',
            mobArchetype: mobType.subtype,
            playerPower: playerStats && loadout ? calculatePlayerPower(playerStats, loadout) : undefined,
            useAdaptive: !!(playerStats && loadout),
            loadout: loadout,
            useEconomyIndex: !!(playerStats && loadout)
          });
          
          const modifiers = { enemyHp: 1 }; // Will be applied by mods in game loop
          const baseHp = mobType.baseHp + levelNum * mobType.hpPerLevel;
          const baseDamage = mobType.baseDamage + levelNum * mobType.damagePerLevel;
          const hp = Math.floor(baseHp * scaling.hpMultiplier * modifiers.enemyHp);
          const damage = Math.floor(baseDamage * scaling.dmgMultiplier);
          
          const entity: Entity = {
            id: `enemy-${enemyCounter++}`,
            type: 'enemy',
            pos: enemyPos,
            hp: hp,
            maxHp: hp,
            damage: damage,
            mobSubtype: mobType.subtype as MobSubtype,
            moveSpeed: scaledMoveSpeed(mobType, levelNum),
            attackCooldown: scaledAttackCooldown(mobType, levelNum),
            lastAttackTime: 0,
            canPhase: mobType.canPhase,
            isRanged: mobType.isRanged,
            range: mobType.range,
            isStationary: mobType.isStationary,
            chargeDirection: null,
          };
          
          // Initialize roaming properties for all non-stationary mobs
          if (!mobType.isStationary) {
            entity.roamDirection = null;
            entity.lastRoamChange = 0;
          }
          
          // Initialize tracker stalking properties
          if (mobType.subtype === 'tracker') {
            entity.isStalking = true;
            entity.pounceDirection = null;
          }
          
          // Initialize moth orbiting properties
          if (mobType.subtype === 'moth') {
            entity.orbitAngle = 0; // Will be set by behavior code based on position
            entity.blinkCooldown = 0;
            entity.nextBlinkAt = 0;
          }
          
          entities.push(entity);
          spawned++;
        }
        attempts++;
      }
    }
  }

  // Spawn Items (only in normal combat levels, not shops or boss levels)
  const items: { pos: Position; item: Item }[] = [];
  if (!isShop && !isBoss) {
    // Number of items scales with level (1-3 items per level, more at higher levels)
    const numItems = Math.min(Math.floor(levelNum / 3) + 1, 5);
    const usedPositions = new Set<string>();
    
    // Collect all valid floor positions (excluding start and exit)
    const validItemPositions: Position[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x] === 'floor' &&
            (x !== startPos.x || y !== startPos.y) &&
            (x !== exitPos.x || y !== exitPos.y) &&
            (Math.abs(x - startPos.x) >= 2 || Math.abs(y - startPos.y) >= 2)) {
          validItemPositions.push({ x, y });
        }
      }
    }
    
    // Shuffle and take positions
    const shuffled = [...validItemPositions].sort(() => Math.random() - 0.5);
    const positionsToUse = shuffled.slice(0, Math.min(numItems, shuffled.length));
    
    for (const itemPos of positionsToUse) {
      const item = generateItem(levelNum);
      items.push({ pos: itemPos, item });
      
      // Record offer (item is available to player)
      recordItemOffer(
        item,
        levelNum,
        'drop',
        playerStats?.coins || 0,
        false // Not purchased yet
      );
    }
  }

  // Generate Portals (50% chance, only in normal combat levels, not shops or bosses)
  const portals: import('./types').Portal[] = [];
  if (!isShop && !isBoss && Math.random() < 0.5) {
    // Find valid floor positions for portal entrance (excluding start, exit, and item positions)
    const validPortalPositions: Position[] = [];
    const itemPosSet = new Set(items.map(item => `${item.pos.x},${item.pos.y}`));
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x] === 'floor' &&
            (x !== startPos.x || y !== startPos.y) &&
            (x !== exitPos.x || y !== exitPos.y) &&
            !itemPosSet.has(`${x},${y}`) &&
            (Math.abs(x - startPos.x) >= 2 || Math.abs(y - startPos.y) >= 2)) {
          validPortalPositions.push({ x, y });
        }
      }
    }
    
    if (validPortalPositions.length > 0) {
      // Select random portal entrance position
      const portalPos = validPortalPositions[Math.floor(Math.random() * validPortalPositions.length)];
      
      const portalExitPos = rollPortalDestination({
        tiles,
        width,
        height,
        exitPos,
        itemPositions: items.map((item) => item.pos),
        candidates: validPortalPositions,
        portalPos,
      });

      portals.push({
        id: `portal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        pos: portalPos,
        exitPos: portalExitPos,
      });
    }
  }

  // Generate Lightswitches
  // 50% chance in non-vendor/non-boss sectors, 70% chance in non-vendor sectors (includes bosses)
  // Max 4 per maze
  const lightswitches: import('./types').Lightswitch[] = [];
  if (!isShop) {
    const spawnChance = isBoss ? 0.7 : 0.5;
    if (Math.random() < spawnChance) {
      // Find valid floor positions for lightswitches (excluding start, exit, item positions, and portal positions)
      const validLightswitchPositions: Position[] = [];
      const itemPosSet = new Set(items.map(item => `${item.pos.x},${item.pos.y}`));
      const portalPosSet = new Set(portals.map(portal => `${portal.pos.x},${portal.pos.y}`));
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (tiles[y][x] === 'floor' &&
              (x !== startPos.x || y !== startPos.y) &&
              (x !== exitPos.x || y !== exitPos.y) &&
              !itemPosSet.has(`${x},${y}`) &&
              !portalPosSet.has(`${x},${y}`) &&
              (Math.abs(x - startPos.x) >= 2 || Math.abs(y - startPos.y) >= 2)) {
            validLightswitchPositions.push({ x, y });
          }
        }
      }
      
      // Spawn up to 4 lightswitches, ensuring they're not too close together
      const numLightswitches = Math.min(4, validLightswitchPositions.length);
      const shuffled = [...validLightswitchPositions].sort(() => Math.random() - 0.5);
      const positionsToUse: Position[] = [];
      const MIN_DISTANCE = 5; // Minimum Manhattan distance between lightswitches
      
      for (const pos of shuffled) {
        // Check if this position is far enough from all already placed lightswitches
        const tooClose = positionsToUse.some(placed => {
          const distance = Math.abs(pos.x - placed.x) + Math.abs(pos.y - placed.y);
          return distance < MIN_DISTANCE;
        });
        
        if (!tooClose) {
          positionsToUse.push(pos);
          if (positionsToUse.length >= numLightswitches) break;
        }
      }
      
      for (const pos of positionsToUse) {
        lightswitches.push({
          id: `lightswitch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          pos,
          activated: false,
        });
      }
    }
  }

  return {
    width,
    height,
    tiles,
    entities,
    projectiles: [], // Initialize empty projectiles array
    afterimages: [], // Initialize empty afterimages array
    particles: [], // Initialize empty particles array
    footprints: [], // Initialize empty footprints array
    items,
    portals,
    lightswitches,
    exitPos,
    startPos,
    levelNumber: levelNum,
    isBoss,
    isShop,
  };
};

/** Everything rollPortalDestination needs, from a generating or a live level. */
export interface PortalDestinationContext {
  tiles: TileType[][];
  width: number;
  height: number;
  exitPos: Position;
  /** Item tiles still on the floor. Shrinks as the player collects them. */
  itemPositions: Position[];
  /** Floor tiles legal for a portal endpoint. */
  candidates: Position[];
  /** The portal's own tile — never a valid destination. */
  portalPos: Position;
}

/** Floor tiles 2-3 tiles (Manhattan) from `around`, excluding it and the portal. */
function tilesNear(ctx: PortalDestinationContext, around: Position): Position[] {
  const out: Position[] = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < 2 || dist > 3) continue;
      const x = around.x + dx;
      const y = around.y + dy;
      if (x < 0 || x >= ctx.width || y < 0 || y >= ctx.height) continue;
      if (ctx.tiles[y]?.[x] !== 'floor') continue;
      if (x === around.x && y === around.y) continue;
      if (x === ctx.portalPos.x && y === ctx.portalPos.y) continue;
      out.push({ x, y });
    }
  }
  return out;
}

function pickRandom<T>(list: T[]): T | null {
  return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : null;
}

/**
 * Where a portal drops the player.
 *
 * Rolled fresh on every entry (M6.3), not once at generation, so the same portal
 * can send you somewhere different the second time — which is what makes opt-in
 * entry a gamble rather than a known shortcut. Because it runs mid-run it reads
 * the *live* item list, so the no-items case is reachable once the floor is
 * cleared.
 *
 * Odds: 30% near an item, 5% near the exit, 65% random. With no items left the
 * item share goes to random (5/95) — the near-exit chance stays at 5%. Before
 * M6.3 a sub-0.30 roll fell through into the near-exit branch whenever the level
 * had no items, silently turning that 5% into 35%.
 */
export const rollPortalDestination = (ctx: PortalDestinationContext): Position => {
  const hasItems = ctx.itemPositions.length > 0;
  const roll = Math.random();
  const nearExitCeiling = hasItems ? 0.35 : 0.05;

  const elsewhere = ctx.candidates.filter(
    (pos) => pos.x !== ctx.portalPos.x || pos.y !== ctx.portalPos.y,
  );
  const fallback = () => pickRandom(elsewhere) ?? pickRandom(ctx.candidates) ?? ctx.portalPos;

  if (hasItems && roll < 0.3) {
    const target = pickRandom(ctx.itemPositions);
    return (target ? pickRandom(tilesNear(ctx, target)) : null) ?? fallback();
  }
  if (roll < nearExitCeiling) {
    return pickRandom(tilesNear(ctx, ctx.exitPos)) ?? fallback();
  }
  return fallback();
};

export function initEngineApi(): void {
  if (typeof window === 'undefined') return;
  window.__PIXLAB_ENGINE__ = { rollPortalDestination, generateLevel, getAttackablePositions };
}

declare global {
  interface Window {
    __PIXLAB_ENGINE__?: {
      rollPortalDestination: typeof rollPortalDestination;
      generateLevel: typeof generateLevel;
      getAttackablePositions: typeof getAttackablePositions;
    };
  }
}

export const checkCollision = (pos: Position, level: Level): boolean => {
  // Convert floating point position to integer tile coordinates
  const tileX = Math.floor(pos.x);
  const tileY = Math.floor(pos.y);
  
  if (tileY < 0 || tileY >= level.height || tileX < 0 || tileX >= level.width) return true;
  // Safety check: ensure the row exists before accessing column
  if (!level.tiles || !level.tiles[tileY]) return true;
  return level.tiles[tileY][tileX] === 'wall';
};

export const getEntitiesInRadius = (pos: Position, radius: number, entities: Entity[]): Entity[] => {
  return entities.filter(e => {
    const dx = e.pos.x - pos.x;
    const dy = e.pos.y - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= radius;
  });
};

export const hasLineOfSight = (from: Position, to: Position, level: Level): boolean => {
  // Use Bresenham's line algorithm to check if there's a clear path
  const x0 = Math.floor(from.x);
  const y0 = Math.floor(from.y);
  const x1 = Math.floor(to.x);
  const y1 = Math.floor(to.y);
  
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  
  let x = x0;
  let y = y0;
  
  while (true) {
    // Check if current tile is a wall
    if (x < 0 || x >= level.width || y < 0 || y >= level.height) {
      return false;
    }
    if (level.tiles[y][x] === 'wall') {
      return false;
    }
    
    // Reached destination
    if (x === x1 && y === y1) {
      return true;
    }
    
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
};

type Offset = readonly [number, number];

const cardinalReach = (n: number): Offset[] => {
  const out: Offset[] = [];
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    for (let i = 1; i <= n; i++) out.push([dx * i, dy * i]);
  }
  return out;
};

const ring = (radius: number): Offset[] => {
  const out: Offset[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      out.push([dx, dy]);
    }
  }
  return out;
};

const star = (n: number): Offset[] => {
  const out: Offset[] = [];
  for (const [dx, dy] of [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ] as const) {
    for (let i = 1; i <= n; i++) out.push([dx * i, dy * i]);
  }
  return out;
};

/**
 * Attack shapes for the five boss drops, each echoing the fight it came from.
 * Reach is traded against base damage: Oblivion Blade covers the most ground
 * and hits softest of the five, Stormbreaker the reverse.
 */
export const BOSS_WEAPON_PATTERNS: Record<string, Offset[]> = {
  // Zeus: a bolt down a lane. Long and thin, three tiles each way.
  stormbreaker: cardinalReach(3),
  // Hades: reaches around cover, two tiles in all eight directions.
  'void reaver': star(2),
  // A heavy close sweep: everything adjacent, plus a second tile each cardinal.
  bloodthirster: [...ring(1), ...cardinalReach(2)],
  // Ares: a slam. The full block around the player, nothing beyond it.
  "titan's gauntlet": ring(1),
  // The widest arc in the game, and the softest of the five at 50 base.
  'oblivion blade': ring(2),
};

export const getAttackablePositions = (pos: Position, weaponBaseName: string | null, level: Level): Position[] => {
  const positions: Position[] = [];
  const baseX = Math.floor(pos.x);
  const baseY = Math.floor(pos.y);
  
  if (!weaponBaseName) {
    // Default: adjacent tiles only
    const adjacent = [
      { x: baseX, y: baseY - 1 },
      { x: baseX, y: baseY + 1 },
      { x: baseX - 1, y: baseY },
      { x: baseX + 1, y: baseY },
    ];
    
    for (const adj of adjacent) {
      if (adj.x >= 0 && adj.x < level.width && adj.y >= 0 && adj.y < level.height) {
        positions.push({ x: adj.x, y: adj.y });
      }
    }
    return positions;
  }
  
  const weaponName = weaponBaseName.toLowerCase();

  // The five boss legendaries had no attack mechanics: none of their names
  // matched a case below, so all five fell through to the plain four-cardinal
  // pattern despite 50–70 base damage against a common weapon's 4–9. Beating a
  // boss should change how the player fights, not just how hard they hit.
  //
  // Each drop keeps the shape of the fight it came from, and the widest
  // patterns sit on the lowest base damage, so reach is a trade rather than a
  // strict upgrade.
  const bossPattern = BOSS_WEAPON_PATTERNS[weaponName];
  if (bossPattern) {
    for (const [ox, oy] of bossPattern) {
      const x = baseX + ox;
      const y = baseY + oy;
      if (x >= 0 && x < level.width && y >= 0 && y < level.height) {
        positions.push({ x, y });
      }
    }
    return positions;
  }

  if (weaponName === 'spear') {
    // Spear: 2 tiles in each cardinal direction
    const directions = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    
    for (const dir of directions) {
      for (let i = 1; i <= 2; i++) {
        const x = baseX + dir.x * i;
        const y = baseY + dir.y * i;
        if (x >= 0 && x < level.width && y >= 0 && y < level.height) {
          positions.push({ x, y });
        }
      }
    }
  } else if (weaponName === 'axe') {
    // Axe: adjacent tiles including diagonals
    const adjacent = [
      { x: baseX, y: baseY - 1 },      // North
      { x: baseX, y: baseY + 1 },      // South
      { x: baseX - 1, y: baseY },      // West
      { x: baseX + 1, y: baseY },      // East
      { x: baseX - 1, y: baseY - 1 }, // Northwest
      { x: baseX + 1, y: baseY - 1 }, // Northeast
      { x: baseX - 1, y: baseY + 1 }, // Southwest
      { x: baseX + 1, y: baseY + 1 }, // Southeast
    ];
    
    for (const adj of adjacent) {
      if (adj.x >= 0 && adj.x < level.width && adj.y >= 0 && adj.y < level.height) {
        positions.push({ x: adj.x, y: adj.y });
      }
    }
  } else {
    // Melee weapons (Sword, Dagger, Mace): adjacent tiles only (no diagonals)
    const adjacent = [
      { x: baseX, y: baseY - 1 },
      { x: baseX, y: baseY + 1 },
      { x: baseX - 1, y: baseY },
      { x: baseX + 1, y: baseY },
    ];
    
    for (const adj of adjacent) {
      if (adj.x >= 0 && adj.x < level.width && adj.y >= 0 && adj.y < level.height) {
        positions.push({ x: adj.x, y: adj.y });
      }
    }
  }
  
  return positions;
};
