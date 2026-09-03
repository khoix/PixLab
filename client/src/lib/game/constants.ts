export const TILE_SIZE = 32; // Pixels
export const VIEWPORT_WIDTH = 11;
export const VIEWPORT_HEIGHT = 15;
// Where the player sits on screen as a fraction of the viewport. X is centred.
// On mobile, Y is lifted 7% above centre so more of the maze shows below the
// player and thumbs on the lower half of the screen have room to work; desktop
// stays dead-centre.
export const PLAYER_SCREEN_ANCHOR_X = 0.5;
export const PLAYER_SCREEN_ANCHOR_Y_DESKTOP = 0.5;
export const PLAYER_SCREEN_ANCHOR_Y_MOBILE = 0.43;

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
  mob_tracker: '#A3FF12',    // Lunar Neon - Artemis Tracker
  mob_moth: '#1B103A',       // Abyssal Indigo - Nyx Glitchmoth
  mob_cerberus: '#FF4D00',   // Brimstone Vermillion - Cerberus Firewall
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
/** +18% sector time on mobile viewports (M6). */
export const MOBILE_SECTOR_TIMER_MULT = 1.18;
/** +18% sector time when relaxed timer setting is enabled (M6). */
export const RELAXED_SECTOR_TIMER_MULT = 1.18;
/** Show exit path hint when remaining time falls below this threshold (seconds). */
export const LOW_TIME_ASSIST_SEC = 30;
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
  aggroRange?: number; // Distance at which mob starts chasing player (default: unlimited)
  // Per-level scaling for mobs whose speed/cadence ramps with sector depth.
  // Previously hardcoded in engine.ts; kept here so every mob's tuning lives
  // in one file.
  speedPerLevel?: number;    // Added to moveSpeed per sector level
  cooldownPerLevel?: number; // Subtracted from attackCooldown per sector level
  minCooldown?: number;      // Floor for the scaled attackCooldown (ms)
}

export const MOB_TYPES: MobTypeDef[] = [
  {
    subtype: 'drone',
    name: 'Hermes Drone',
    baseHp: 20,
    hpPerLevel: 5,
    baseDamage: 5,
    damagePerLevel: 0.7,
    moveSpeed: 1.0,
    attackCooldown: 500,
    coinReward: 10,
    canPhase: false,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 1,
    spawnWeight: 30, // Most common
    aggroRange: 7, // Basic mob, medium detection range
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
    minLevel: 13,
    spawnWeight: 15,
    aggroRange: 8, // Ranged attacker, should detect from far (aggro > attack range)
  },
  {
    subtype: 'phase',
    name: 'Hades Phase',
    baseHp: 25,
    hpPerLevel: 4,
    baseDamage: 3,
    damagePerLevel: 0.5,
    moveSpeed: 0.8,
    attackCooldown: 600,
    coinReward: 12,
    canPhase: true,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 5,
    spawnWeight: 20,
    aggroRange: 4, // Short: it phases through walls, so it needs no early warning
  },
  {
    subtype: 'charger',
    name: 'Ares Charger',
    baseHp: 18,
    hpPerLevel: 4,
    baseDamage: 8,
    damagePerLevel: 1.5,
    moveSpeed: 1.8, // Fast
    attackCooldown: 900,
    coinReward: 12,
    canPhase: false,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 17,
    spawnWeight: 12,
    aggroRange: 6, // Fast aggressive mob, detects before charging
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
    minLevel: 25,
    spawnWeight: 8,
    aggroRange: 6, // Stationary, aggro matches attack range
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
    // Selections, not entities: each swarm selection spawns SWARM_SPAWN_COUNT
    // mobs, so this weight is divided by that average to reach its real share.
    spawnWeight: 10,
    aggroRange: 5, // Weak mobs, shorter detection range
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
    minLevel: 29,
    spawnWeight: 5,
    aggroRange: 6, // Slow tank, medium detection range
  },
  {
    subtype: 'tracker',
    name: 'Artemis Tracker',
    baseHp: 14,
    hpPerLevel: 3,
    baseDamage: 9,
    damagePerLevel: 1.4,
    moveSpeed: 1.55,
    speedPerLevel: 0.02,
    attackCooldown: 1600,
    cooldownPerLevel: 12,
    minCooldown: 1100,
    coinReward: 4, // Base reward, may need scaling
    canPhase: false,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 21,
    spawnWeight: 8,
    aggroRange: 9, // Stalker, should have long detection (aggro >> attack range)
  },
  {
    subtype: 'moth',
    name: 'Nyx Glitchmoth',
    baseHp: 16,
    hpPerLevel: 3,
    baseDamage: 6,
    damagePerLevel: 1,
    moveSpeed: 1.35,
    speedPerLevel: 0.015,
    attackCooldown: 1250,
    cooldownPerLevel: 8,
    minCooldown: 950,
    coinReward: 3, // Base reward, may need scaling
    canPhase: false,
    isRanged: true,
    range: 4, // Shadow pulse range
    isStationary: false,
    minLevel: 9,
    spawnWeight: 10,
    aggroRange: 6, // Orbiter, detects before entering orbit range
  },
  {
    subtype: 'cerberus',
    name: 'Cerberus Firewall',
    baseHp: 40,
    hpPerLevel: 7,
    baseDamage: 6,
    damagePerLevel: 1.0,
    moveSpeed: 1.05,
    speedPerLevel: 0.02,
    attackCooldown: 2200,
    cooldownPerLevel: 15,
    minCooldown: 1500,
    coinReward: 10, // Base reward, may need scaling
    canPhase: false,
    isRanged: false,
    range: 1,
    isStationary: false,
    minLevel: 8,
    spawnWeight: 4, // Not used in normal spawn (spawned separately in boss sectors)
    aggroRange: 7, // Boss-like, medium-long detection range
  },
];

/** A swarm selection spawns this many mobs (inclusive range). */
export const SWARM_SPAWN_COUNT: readonly [number, number] = [2, 3];

export const MOB_TYPE_BY_SUBTYPE: ReadonlyMap<string, MobTypeDef> = new Map(
  MOB_TYPES.map((mob) => [mob.subtype, mob]),
);

// Longest attack reach of any mob or boss (Zeus boss and turret: 6). Drives the
// off-camera draw-cull margin so a telegraph line from an off-screen mob to the
// player is never clipped.
export const MAX_MOB_RANGE_TILES = Math.max(6, ...MOB_TYPES.map((mob) => mob.range));

// Nyx Glitchmoth tuning
export const MOTH_ORBIT_RAD_PER_TICK = 0.1;
export const MOTH_BLINK_RADIUS = 6;
export const MOTH_BLINK_MIN_MS = 3000;
export const MOTH_BLINK_MAX_MS = 5000;
export const rollMothBlinkDelay = (random: () => number = Math.random): number =>
  MOTH_BLINK_MIN_MS + random() * (MOTH_BLINK_MAX_MS - MOTH_BLINK_MIN_MS);


// Re-export color theme utilities
export { getThemeForLevel, generateColorPalette, type ColorPalette } from './colorThemes';