export const TILE_SIZE = 32; // Pixels
export const VIEWPORT_WIDTH = 11;
export const VIEWPORT_HEIGHT = 15;

export const COLORS = {
  wall: '#1a1a2e',
  floor: '#16213e',
  player: '#00fff5',
  enemy: '#ff2a6d',
  boss: '#ffd700',
  item: '#ffd700',
  fog: '#000000',
  spotlight: 'rgba(0, 255, 245, 0.1)',
  exit: '#05d9e8',
  // Mob type colors (cyberpunk Greek/Roman theme)
  mob_drone: '#ff2a6d',      // Pink - Basic Hermes drone
  mob_sniper: '#ff6b35',     // Orange - Apollo sniper
  mob_phase: '#9d4edd',      // Purple - Hades phase
  mob_charger: '#ef233c',    // Red - Ares charger
  mob_turret: '#06a77d',     // Teal - Hephaestus turret
  mob_swarm: '#ffb703',      // Yellow - Minion swarm
  mob_guardian: '#023e8a',   // Blue - Athena guardian
  projectile: '#ff006e',     // Magenta - Projectile color
  // Boss-specific colors
  boss_zeus: '#00ffff',      // Electric cyan - Zeus Mainframe
  boss_hades: '#9d4edd',     // Purple - Hades Core
  boss_ares: '#ef233c',      // Red - Ares Protocol
};

// Item rarity colors
export const RARITY_COLORS = {
  common: '#9e9e9e',      // Gray
  rare: '#2196f3',        // Blue
  epic: '#9c27b0',        // Purple
  legendary: '#ffd700',   // Gold
};

export const INITIAL_STATS = {
  hp: 100,
  maxHp: 100,
  coins: 0,
  damage: 10,
  speed: 1,
  visionRadius: 3.5,
};

export const MODS = [
  { id: 'zeus_mainframe', name: 'Zeus Mainframe', description: 'Enemies are 20% stronger. +50% coin drops.', modifiers: { enemyHp: 1.2, coinMult: 1.5 } },
  { id: 'hades_subnet', name: 'Hades Subnet', description: 'Enemies explode on death (damage nearby). Timer is 20% shorter.', modifiers: { timerMult: 0.8, explosiveDeaths: true } },
  { id: 'artemis_drone', name: 'Artemis Drone', description: 'Reveal fog periodically. Vision radius reduced by 30%.', modifiers: { visionMult: 0.7, autoReveal: true } },
];

// Level Configuration
export const LEVEL_TIME_LIMIT = 120; // Seconds per normal level
export const SHOP_INTERVAL = 4; // Every 4 levels
export const BOSS_INTERVAL = 8; // Every 8 levels
// Mob type definitions with cyberpunk Greek/Roman mythology theme
export interface MobTypeDef {
  subtype: string;
  name: string;
  baseHp: number;
  hpPerLevel: number;
  baseDamage: number;
  damagePerLevel: number;
  moveSpeed: number;
  attackCooldown: number; // ms
  coinReward: number;
  canPhase: boolean;
  isRanged: boolean;
  range: number;
  isStationary: boolean;
  minLevel: number; // Minimum level to appear
  spawnWeight: number; // Higher = more common (relative to other mobs)
}

export const MOB_TYPES: MobTypeDef[] = [
  {
    subtype: 'drone',
    name: 'Hermes Drone',
    baseHp: 20,
    hpPerLevel: 5,
    baseDamage: 5,
    damagePerLevel: 1,
    moveSpeed: 1.0,
    attackCooldown: 500,
    coinReward: 10,
    canPhase: false,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 1,
    spawnWeight: 30, // Most common
  },
  {
    subtype: 'sniper',
    name: 'Apollo Sniper',
    baseHp: 15,
    hpPerLevel: 3,
    baseDamage: 12,
    damagePerLevel: 2,
    moveSpeed: 0.5, // Slow movement
    attackCooldown: 2000, // 2 second cooldown
    coinReward: 15,
    canPhase: false,
    isRanged: true,
    range: 5,
    isStationary: false,
    minLevel: 3,
    spawnWeight: 15,
  },
  {
    subtype: 'phase',
    name: 'Hades Phase',
    baseHp: 25,
    hpPerLevel: 4,
    baseDamage: 3,
    damagePerLevel: 0.5,
    moveSpeed: 0.8,
    attackCooldown: 400,
    coinReward: 12,
    canPhase: true,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 2,
    spawnWeight: 20,
  },
  {
    subtype: 'charger',
    name: 'Ares Charger',
    baseHp: 18,
    hpPerLevel: 4,
    baseDamage: 8,
    damagePerLevel: 1.5,
    moveSpeed: 1.8, // Fast
    attackCooldown: 600,
    coinReward: 12,
    canPhase: false,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 4,
    spawnWeight: 12,
  },
  {
    subtype: 'turret',
    name: 'Hephaestus Turret',
    baseHp: 30,
    hpPerLevel: 6,
    baseDamage: 10,
    damagePerLevel: 1.5,
    moveSpeed: 0,
    attackCooldown: 1500,
    coinReward: 18,
    canPhase: false,
    isRanged: true,
    range: 6,
    isStationary: true,
    minLevel: 5,
    spawnWeight: 8,
  },
  {
    subtype: 'swarm',
    name: 'Minion Swarm',
    baseHp: 8,
    hpPerLevel: 2,
    baseDamage: 3,
    damagePerLevel: 0.5,
    moveSpeed: 1.2,
    attackCooldown: 300,
    coinReward: 5,
    canPhase: false,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 1,
    spawnWeight: 25,
  },
  {
    subtype: 'guardian',
    name: 'Athena Guardian',
    baseHp: 50,
    hpPerLevel: 8,
    baseDamage: 6,
    damagePerLevel: 1,
    moveSpeed: 0.6, // Slow
    attackCooldown: 800,
    coinReward: 20,
    canPhase: false,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 6,
    spawnWeight: 5,
  },
];

