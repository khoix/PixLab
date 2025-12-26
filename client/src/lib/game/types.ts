export type Position = { x: number; y: number };

export type TileType = 'wall' | 'floor' | 'exit' | 'start' | 'shop' | 'boss';

export type EntityType = 'player' | 'enemy' | 'item' | 'boss_enemy';

export interface Item {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'utility' | 'consumable';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  stats?: {
    damage?: number;
    defense?: number;
    speed?: number;
    vision?: number;
    heal?: number;
  };
  price: number;
  description: string;
}

export interface Entity {
  id: string;
  type: EntityType;
  pos: Position;
  hp: number;
  maxHp: number;
  damage: number;
  sprite?: string; // Color or sprite key
}

export interface Level {
  width: number;
  height: number;
  tiles: TileType[][];
  entities: Entity[];
  items: { pos: Position; item: Item }[];
  exitPos: Position;
  startPos: Position;
  levelNumber: number;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  coins: number;
  damage: number;
  speed: number; // tiles per second or movement delay
  visionRadius: number;
}

export interface GameState {
  uid: string;
  screen: 'title' | 'lobby' | 'run' | 'shop' | 'boss' | 'gameover' | 'victory';
  currentLevel: number;
  stats: PlayerStats;
  inventory: Item[];
  loadout: {
    weapon: Item | null;
    armor: Item | null;
    utility: Item | null;
  };
  activeMods: string[];
  settings: {
    musicVolume: number;
    sfxVolume: number;
    joystickPosition: 'left' | 'right';
  };
}
