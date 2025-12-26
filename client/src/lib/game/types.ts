export type Position = { x: number; y: number };

export type TileType = 'wall' | 'floor' | 'exit' | 'start';

export type EntityType = 'player' | 'enemy' | 'boss_enemy' | 'item';

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
  isBoss?: boolean;
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
  isBoss: boolean;
  isShop: boolean;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  coins: number;
  damage: number;
  speed: number;
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
  bossDrops: Item[]; // Persistent legendary items
  settings: {
    musicVolume: number;
    sfxVolume: number;
    joystickPosition: 'left' | 'right';
  };
}
