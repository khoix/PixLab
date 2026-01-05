import { Level, TileType, Position, Entity, Item, MobSubtype, PlayerStats, GameState } from './types';
import { SHOP_INTERVAL, BOSS_INTERVAL, MOB_TYPES } from './constants';
import { generateItem } from './items';
import { calculateScaling, calculatePlayerPower } from './scaling';

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

  // Initialize grid with walls
  const tiles: TileType[][] = Array(height).fill(null).map(() => Array(width).fill('wall'));
  
  // Simple Recursive Backtracker for Maze Generation
  const visited: boolean[][] = Array(height).fill(false).map(() => Array(width).fill(false));
  const stack: Position[] = [];
  
  const startPos = { x: 1, y: 1 };
  stack.push(startPos);
  visited[startPos.y][startPos.x] = true;
  tiles[startPos.y][startPos.x] = 'floor';
  
  const directions = [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
    { x: -2, y: 0 },
    { x: 2, y: 0 }
  ];
  
  while (stack.length > 0) {
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

  // Add random loops
  for (let i = 0; i < width * height * 0.05; i++) {
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
  
  // Helper function to get available mobs based on progressive introduction
  // Introduces one new mob every 4 normal levels (excluding shops and bosses)
  // Mobs introduced in difficulty order: swarm/drone → phase → moth → sniper → charger → tracker → turret → guardian
  function getAvailableMobsForLevel(levelNum: number, isBoss: boolean, isShop: boolean): typeof MOB_TYPES[0][] {
    // Cerberus is boss-only, exclude from normal progression
    const normalMobs = MOB_TYPES.filter(mob => mob.subtype !== 'cerberus');
    
    // Count only normal combat levels (exclude shops and bosses)
    let normalLevelCount = 0;
    for (let i = 1; i <= levelNum; i++) {
      const isBossLevel = i % BOSS_INTERVAL === 0 && i > 0;
      const isShopLevel = i % SHOP_INTERVAL === 0 && !isBossLevel;
      if (!isBossLevel && !isShopLevel) {
        normalLevelCount++;
      }
    }
    
    // Determine which mobs should be available based on progression
    // Level 1: swarm, drone (starter mobs)
    // Every 4 normal levels introduces a new mob in difficulty order
    const availableMobs: typeof MOB_TYPES[0][] = [];
    
    // Always available from start
    if (normalLevelCount >= 1) {
      availableMobs.push(...normalMobs.filter(m => m.subtype === 'swarm' || m.subtype === 'drone'));
    }
    
    // Progressive introduction every 4 normal levels
    // Level 5 (normal level 4): phase
    if (normalLevelCount >= 4) {
      availableMobs.push(...normalMobs.filter(m => m.subtype === 'phase'));
    }
    // Level 9 (normal level 7): moth
    if (normalLevelCount >= 7) {
      availableMobs.push(...normalMobs.filter(m => m.subtype === 'moth'));
    }
    // Level 13 (normal level 10): sniper
    if (normalLevelCount >= 10) {
      availableMobs.push(...normalMobs.filter(m => m.subtype === 'sniper'));
    }
    // Level 17 (normal level 13): charger
    if (normalLevelCount >= 13) {
      availableMobs.push(...normalMobs.filter(m => m.subtype === 'charger'));
    }
    // Level 21 (normal level 16): tracker
    if (normalLevelCount >= 16) {
      availableMobs.push(...normalMobs.filter(m => m.subtype === 'tracker'));
    }
    // Level 25 (normal level 19): turret
    if (normalLevelCount >= 19) {
      availableMobs.push(...normalMobs.filter(m => m.subtype === 'turret'));
    }
    // Level 29 (normal level 22): guardian
    if (normalLevelCount >= 22) {
      availableMobs.push(...normalMobs.filter(m => m.subtype === 'guardian'));
    }
    
    // Remove duplicates
    const uniqueMobs = Array.from(new Map(availableMobs.map(m => [m.subtype, m])).values());
    
    return uniqueMobs;
  }
  
  // Helper function to select mob type based on level and weights
  const selectMobType = (levelNum: number, isBoss: boolean, isShop: boolean): typeof MOB_TYPES[0] | null => {
    // Get available mobs based on progressive introduction
    const availableMobs = getAvailableMobsForLevel(levelNum, isBoss, isShop);
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
        useAdaptive: !!(playerStats && loadout)
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
    
    // Spawn Cerberus alongside boss (2-4 entities) at levels 8+
    if (levelNum >= 8) {
      const cerberusMob = MOB_TYPES.find(m => m.subtype === 'cerberus');
      if (cerberusMob) {
        const numCerberus = Math.floor(Math.random() * 3) + 2; // 2-4 Cerberus
        let cerberusCounter = 0;
        
        for (let i = 0; i < numCerberus; i++) {
          // Find position near boss but not too close
          const cerberusPos = findValidFloorTile(width / 2, height / 2, 8);
          if (cerberusPos) {
            // Calculate Cerberus scaling (boss sector, cerberus archetype)
            const cerberusScaling = calculateScaling({
              level: levelNum,
              sectorType: 'boss',
              mobArchetype: 'cerberus',
              playerPower: playerStats && loadout ? calculatePlayerPower(playerStats, loadout) : undefined,
              useAdaptive: !!(playerStats && loadout)
            });
            
            const modifiers = { enemyHp: 1 }; // Will be applied by mods in game loop
            const baseHp = cerberusMob.baseHp + levelNum * cerberusMob.hpPerLevel;
            const baseDamage = cerberusMob.baseDamage + levelNum * cerberusMob.damagePerLevel;
            const hp = Math.floor(baseHp * cerberusScaling.hpMultiplier * modifiers.enemyHp);
            const damage = Math.floor(baseDamage * cerberusScaling.dmgMultiplier);
            
            // Scale speed: 1.05 + 0.02/level
            const moveSpeed = 1.05 + (levelNum * 0.02);
            // Scale attack cooldown: 2.2s - 0.02s/level (min 1.4s) = 2200ms - 20ms/level (min 1400ms)
            const attackCooldown = Math.max(1400, 2200 - (levelNum * 20));
            
            const cerberusEntity: Entity = {
              id: `cerberus-${cerberusCounter++}`,
              type: 'enemy',
              pos: cerberusPos,
              hp: hp,
              maxHp: hp,
              damage: damage,
              mobSubtype: 'cerberus',
              moveSpeed: moveSpeed,
              attackCooldown: attackCooldown,
              lastAttackTime: 0,
              canPhase: false,
              isRanged: false,
              range: 1,
              isStationary: false,
              biteComboCount: 0,
              lastBiteTime: 0,
            };
            
            entities.push(cerberusEntity);
          }
        }
      }
    }
  } else if (!isShop) {
    // Normal enemies - prevent infinite loop with max attempts
    // Number of enemies scales with level, with more variety at higher levels
    // Cap at 50 enemies to prevent performance issues and overwhelming gameplay
    const numEnemies = Math.min(Math.floor(levelNum * 1.5) + 3, 50);
    const maxAttempts = 1000; // Safety limit
    let attempts = 0;
    let enemyCounter = 0;
    
    for (let i = 0; i < numEnemies && attempts < maxAttempts; i++) {
      const mobType = selectMobType(levelNum, isBoss, isShop);
      if (!mobType) break; // No valid mob types available
      
      // For swarm mobs, spawn 2-3 at once
      const spawnCount = mobType.subtype === 'swarm' ? Math.floor(Math.random() * 2) + 2 : 1;
      
      for (let j = 0; j < spawnCount && attempts < maxAttempts; j++) {
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
            useAdaptive: !!(playerStats && loadout)
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
            moveSpeed: mobType.moveSpeed,
            attackCooldown: mobType.attackCooldown,
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
            // Scale speed: 1.55 + 0.04/level
            entity.moveSpeed = 1.55 + (levelNum * 0.04);
            // Scale attack cooldown: 1.6s - 0.015s/level (min 1.05s) = 1600ms - 15ms/level (min 1050ms)
            entity.attackCooldown = Math.max(1050, 1600 - (levelNum * 15));
          }
          
          // Initialize moth orbiting properties
          if (mobType.subtype === 'moth') {
            entity.orbitAngle = 0; // Will be set by behavior code based on position
            entity.blinkCooldown = 0;
            // Scale speed: 1.35 + 0.03/level
            entity.moveSpeed = 1.35 + (levelNum * 0.03);
            // Scale attack cooldown: 1.25s - 0.01s/level (min 0.85s) = 1250ms - 10ms/level (min 850ms)
            entity.attackCooldown = Math.max(850, 1250 - (levelNum * 10));
          }
          
          entities.push(entity);
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
      
      // Determine portal exit position based on probabilities
      let portalExitPos: Position;
      const exitRoll = Math.random();
      
      if (exitRoll < 0.30 && items.length > 0) {
        // 30% chance: near an item (2-3 tiles away, not on item tile)
        const targetItem = items[Math.floor(Math.random() * items.length)];
        const nearbyPositions: Position[] = [];
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist >= 2 && dist <= 3) {
              const x = targetItem.pos.x + dx;
              const y = targetItem.pos.y + dy;
              if (x >= 0 && x < width && y >= 0 && y < height && 
                  tiles[y][x] === 'floor' &&
                  (x !== targetItem.pos.x || y !== targetItem.pos.y) &&
                  (x !== portalPos.x || y !== portalPos.y)) {
                nearbyPositions.push({ x, y });
              }
            }
          }
        }
        portalExitPos = nearbyPositions.length > 0 
          ? nearbyPositions[Math.floor(Math.random() * nearbyPositions.length)]
          : validPortalPositions[Math.floor(Math.random() * validPortalPositions.length)];
      } else if (exitRoll < 0.35) {
        // 5% chance: near the level exit (2-3 tiles away, not on exit tile)
        const nearbyPositions: Position[] = [];
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist >= 2 && dist <= 3) {
              const x = exitPos.x + dx;
              const y = exitPos.y + dy;
              if (x >= 0 && x < width && y >= 0 && y < height && 
                  tiles[y][x] === 'floor' &&
                  (x !== exitPos.x || y !== exitPos.y) &&
                  (x !== portalPos.x || y !== portalPos.y)) {
                nearbyPositions.push({ x, y });
              }
            }
          }
        }
        portalExitPos = nearbyPositions.length > 0 
          ? nearbyPositions[Math.floor(Math.random() * nearbyPositions.length)]
          : validPortalPositions[Math.floor(Math.random() * validPortalPositions.length)];
      } else {
        // 65% chance: random floor position
        const randomPositions = validPortalPositions.filter(
          pos => pos.x !== portalPos.x || pos.y !== portalPos.y
        );
        portalExitPos = randomPositions.length > 0
          ? randomPositions[Math.floor(Math.random() * randomPositions.length)]
          : validPortalPositions[Math.floor(Math.random() * validPortalPositions.length)];
      }
      
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
