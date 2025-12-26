import { Level, TileType, Position, Entity } from './types';
import { SHOP_INTERVAL, BOSS_INTERVAL } from './constants';

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
  
  // Place Exit
  let exitPos = { x: width - 2, y: height - 2 };
  while (tiles[exitPos.y][exitPos.x] === 'wall') {
    exitPos.x--;
    if (exitPos.x < 1) { exitPos.x = width - 2; exitPos.y--; }
  }
  tiles[exitPos.y][exitPos.x] = 'exit';

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
  
  if (isBoss) {
    // Single boss
    entities.push({
      id: 'boss-1',
      type: 'boss_enemy',
      pos: { x: width / 2, y: height / 2 },
      hp: 100 + levelNum * 10,
      maxHp: 100 + levelNum * 10,
      damage: 15 + levelNum,
      isBoss: true,
    });
  } else if (!isShop) {
    // Normal enemies
    const numEnemies = Math.floor(levelNum * 1.5) + 3;
    for (let i = 0; i < numEnemies; i++) {
      let ex, ey;
      do {
        ex = Math.floor(Math.random() * width);
        ey = Math.floor(Math.random() * height);
      } while (tiles[ey][ex] !== 'floor' || (Math.abs(ex - startPos.x) < 5 && Math.abs(ey - startPos.y) < 5));
      
      entities.push({
        id: `enemy-${i}`,
        type: 'enemy',
        pos: { x: ex, y: ey },
        hp: 20 + levelNum * 5,
        maxHp: 20 + levelNum * 5,
        damage: 5 + levelNum,
      });
    }
  }

  return {
    width,
    height,
    tiles,
    entities,
    items: [],
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
