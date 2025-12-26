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
