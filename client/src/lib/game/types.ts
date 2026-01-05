export type Position = { x: number; y: number };

export type TileType = 'wall' | 'floor' | 'exit' | 'start';

export type EntityType = 'player' | 'enemy' | 'boss_enemy' | 'item';

// Mob subtypes with cyberpunk Greek/Roman mythology theme
export type MobSubtype = 
  | 'drone'           // Basic melee drone (Hermes)
  | 'sniper'          // Ranged, slow, high damage (Apollo)
  | 'phase'           // Wall-clipping, low damage (Hades)
  | 'charger'         // Fast charging melee (Ares)
  | 'turret'          // Stationary projectile (Hephaestus)
  | 'swarm'           // Weak but numerous (Minions)
  | 'guardian'        // Tanky, slow (Athena)
  | 'moth'            // Orbiting ranged debuffer (Nyx)
  | 'tracker'         // Stalking melee pouncer (Artemis)
  | 'cerberus'        // Boss-sector elite (Cerberus)
  | 'boss_zeus'       // Boss: Zeus Mainframe
  | 'boss_hades'      // Boss: Hades Core
  | 'boss_ares';      // Boss: Ares Protocol

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
  mobSubtype?: MobSubtype;  // Specific mob type
  moveSpeed?: number;        // Movement speed multiplier (default 1.0)
  attackCooldown?: number;   // Time between attacks (ms)
  lastAttackTime?: number;   // Last time this entity attacked
  canPhase?: boolean;        // Can move through walls
  isRanged?: boolean;        // Can attack from range
  range?: number;            // Attack range in tiles
  isStationary?: boolean;    // Doesn't move
  chargeDirection?: { x: number; y: number } | null; // For charger mobs
  // New mob-specific properties
  orbitAngle?: number;       // For moth orbiting
  blinkCooldown?: number;    // For moth blinking
  isStalking?: boolean;      // For tracker stalking state
  pounceDirection?: { x: number; y: number } | null; // For tracker pounce
  afterimageTrail?: Position[]; // For tracker afterimage
  biteComboCount?: number;   // For cerberus tri-bite
  lastBiteTime?: number;    // For cerberus combo timing
  roamDirection?: { x: number; y: number } | null; // For phase mob roaming
  lastRoamChange?: number; // Timestamp of last roam direction change
}

export interface Projectile {
  id: string;
  pos: Position;
  velocity: { x: number; y: number };
  damage: number;
  ownerId: string;
  lifetime: number; // ms
  createdAt: number;
  isShadowPulse?: boolean; // For moth shadow pulse attack
}

export interface Afterimage {
  id: string;
  pos: Position;
  createdAt: number;
  lifetime: number; // ms
  damage: number;
}

export interface Level {
  width: number;
  height: number;
  tiles: TileType[][];
  entities: Entity[];
  projectiles: Projectile[];
  afterimages: Afterimage[];
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
  visionDebuffEndTime?: number; // Timestamp when debuff expires
  visionDebuffMultiplier?: number; // Current vision reduction (e.g., 0.5 for 50% reduction)
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
  compendium: MobSubtype[]; // Unlocked mob cards (stored as array for serialization)
  settings: {
    musicVolume: number;
    sfxVolume: number;
    joystickPosition: 'left' | 'right';
    mobileControlType?: 'joystick' | 'dpad' | 'touchpad';
  };
}
