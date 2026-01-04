import { Level, TileType, Position, Entity, Item, MobSubtype } from './types';
import { SHOP_INTERVAL, BOSS_INTERVAL, MOB_TYPES } from './constants';
import { generateItem } from './items';

export const generateLevel = (levelNum: number, width: number, height: number): Level => {
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
  
  // Set exit tile
  if (exitPos && tiles[exitPos.y][exitPos.x] === 'floor') {
    tiles[exitPos.y][exitPos.x] = 'exit';
  } else {
    // Last resort: use default position
    exitPos = { x: width - 2, y: height - 2 };
    tiles[exitPos.y][exitPos.x] = 'exit';
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
          (Math.abs(px - startPos.x) >= minDistanceFromStart || Math.abs(py - startPos.y) >= minDistanceFromStart)) {
        return { x: px, y: py };
      }
    }
    
    // Collect all valid floor positions
    const validPositions: Position[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x] === 'floor' &&
            (Math.abs(x - startPos.x) >= minDistanceFromStart || Math.abs(y - startPos.y) >= minDistanceFromStart)) {
          validPositions.push({ x, y });
        }
      }
    }
    
    if (validPositions.length === 0) {
      // Fallback: any floor tile if no valid positions found
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (tiles[y][x] === 'floor') {
            return { x, y };
          }
        }
      }
      return null;
    }
    
    return validPositions[Math.floor(Math.random() * validPositions.length)];
  };
  
  // Helper function to select mob type based on level and weights
  const selectMobType = (levelNum: number): typeof MOB_TYPES[0] | null => {
    // Filter mobs that can spawn at this level
    const availableMobs = MOB_TYPES.filter((mob: typeof MOB_TYPES[0]) => levelNum >= mob.minLevel);
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
      
      entities.push({
        id: 'boss-1',
        type: 'boss_enemy',
        pos: bossPos,
        hp: 150 + levelNum * 15,
        maxHp: 150 + levelNum * 15,
        damage: 20 + levelNum * 2,
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
  } else if (!isShop) {
    // Normal enemies - prevent infinite loop with max attempts
    // Number of enemies scales with level, with more variety at higher levels
    const numEnemies = Math.floor(levelNum * 1.5) + 3;
    const maxAttempts = 1000; // Safety limit
    let attempts = 0;
    let enemyCounter = 0;
    
    for (let i = 0; i < numEnemies && attempts < maxAttempts; i++) {
      const mobType = selectMobType(levelNum);
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
          const modifiers = { enemyHp: 1 }; // Will be applied by mods in game loop
          const hp = Math.floor((mobType.baseHp + levelNum * mobType.hpPerLevel) * modifiers.enemyHp);
          const damage = Math.floor(mobType.baseDamage + levelNum * mobType.damagePerLevel);
          
          entities.push({
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
          });
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

  return {
    width,
    height,
    tiles,
    entities,
    projectiles: [], // Initialize empty projectiles array
    afterimages: [], // Initialize empty afterimages array
    items,
    exitPos,
    startPos,
    levelNumber: levelNum,
    isBoss,
    isShop,
  };
};

export const checkCollision = (pos: Position, level: Level): boolean => {
  if (pos.y < 0 || pos.y >= level.height || pos.x < 0 || pos.x >= level.width) return true;
  return level.tiles[pos.y][pos.x] === 'wall';
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
  } else {
    // Melee weapons (Sword, Axe, Dagger, Mace): adjacent tiles only
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
