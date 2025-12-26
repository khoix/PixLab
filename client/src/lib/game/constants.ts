export const TILE_SIZE = 32; // Pixels
export const VIEWPORT_WIDTH = 11; // Tiles visible horizontally (odd number for centering)
export const VIEWPORT_HEIGHT = 15; // Tiles visible vertically

export const COLORS = {
  wall: '#1a1a2e', // Dark blue/black
  floor: '#16213e', // Slightly lighter
  player: '#00fff5', // Neon Cyan
  enemy: '#ff2a6d', // Neon Pink
  item: '#ffd700', // Gold
  fog: '#000000',
  spotlight: 'rgba(0, 255, 245, 0.1)', // Faint cyan glow
  exit: '#05d9e8',
};

export const INITIAL_STATS = {
  hp: 100,
  maxHp: 100,
  coins: 0,
  damage: 10,
  speed: 1,
  visionRadius: 3.5, // Tiles
};

export const MODS = [
  { id: 'zeus_mainframe', name: 'Zeus Mainframe', description: 'Attacks chain to nearby enemies, but you take +10% dmg.' },
  { id: 'hades_subnet', name: 'Hades Subnet', description: 'Enemies explode on death, but healing is 50% less effective.' },
  { id: 'artemis_drone', name: 'Artemis Drone', description: 'Reveal map periodically, but vision radius is reduced.' },
];
