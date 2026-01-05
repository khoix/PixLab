/**
 * Color theme system for maze generation
 * Generates random dungeon/cyberpunk color palettes that change every 4 sectors
 */

export interface ColorPalette {
  wall: string;
  floor: string;
}

/**
 * Simple seeded random number generator
 * Uses a linear congruential generator for deterministic randomness
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

/**
 * Generate a random color palette based on a seed
 * Creates dungeon/cyberpunk themed color combinations
 */
export function generateColorPalette(seed: number): ColorPalette {
  const rng = new SeededRandom(seed);

  // Define color theme categories
  const themes = [
    // Cyberpunk themes - dark blues and purples
    {
      name: 'cyberpunk_blue',
      walls: ['#0a0e27', '#1a1f3a', '#0f1626', '#1a1f3d', '#0d1220'],
      floors: ['#16213e', '#1e2a4a', '#1a2540', '#1f2d4e', '#18223a'],
    },
    {
      name: 'cyberpunk_purple',
      walls: ['#1a0d2e', '#2d1b3d', '#1f0f35', '#2a1a3f', '#1e0f2f'],
      floors: ['#2d1b3d', '#3a2549', '#2f1f42', '#3d274f', '#2a1d3a'],
    },
    // Dungeon themes - browns and grays
    {
      name: 'dungeon_stone',
      walls: ['#2d1b1b', '#3d2b2b', '#2a1a1a', '#3a2828', '#2f1f1f'],
      floors: ['#3d2b2b', '#4a3535', '#3f2d2d', '#4d3737', '#3a2828'],
    },
    {
      name: 'dungeon_gray',
      walls: ['#1a1a1a', '#2a2a2a', '#1f1f1f', '#252525', '#1d1d1d'],
      floors: ['#2a2a2a', '#353535', '#2f2f2f', '#3a3a3a', '#2d2d2d'],
    },
    // Toxic/industrial themes
    {
      name: 'toxic_green',
      walls: ['#0d1a0d', '#1a2a1a', '#0f1f0f', '#1d2d1d', '#122012'],
      floors: ['#1a2a1a', '#253525', '#1f2f1f', '#2a3a2a', '#1d2d1d'],
    },
    {
      name: 'industrial_rust',
      walls: ['#2a1a0d', '#3a2515', '#2f1f10', '#3d2818', '#2a1d12'],
      floors: ['#3a2515', '#4a3525', '#3f2d1d', '#4d3828', '#3a2a1d'],
    },
    // Deep purple/void themes
    {
      name: 'void_purple',
      walls: ['#0f0a1a', '#1a0f2a', '#120d1f', '#1d122f', '#0f0a1d'],
      floors: ['#1a0f2a', '#251a3a', '#1f152f', '#2a1f3f', '#1d122a'],
    },
    // Dark red/danger themes
    {
      name: 'danger_red',
      walls: ['#1a0a0a', '#2a1515', '#1f0f0f', '#2d1818', '#1a0d0d'],
      floors: ['#2a1515', '#352020', '#2f1a1a', '#3d2525', '#2a1818'],
    },
  ];

  // Select a random theme
  const themeIndex = rng.nextInt(0, themes.length - 1);
  const theme = themes[themeIndex];

  // Select random colors from the theme's color arrays
  const wallIndex = rng.nextInt(0, theme.walls.length - 1);
  const floorIndex = rng.nextInt(0, theme.floors.length - 1);

  // Ensure floor is lighter than wall for visibility
  let wallColor = theme.walls[wallIndex];
  let floorColor = theme.floors[floorIndex];

  // Add slight variation to colors for more uniqueness
  const variation = () => Math.floor(rng.next() * 10) - 5; // -5 to +5

  // Apply subtle random variation to RGB values
  const adjustColor = (color: string, variation: number): string => {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + variation));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + variation));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + variation));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  wallColor = adjustColor(wallColor, variation());
  floorColor = adjustColor(floorColor, variation());

  // Ensure floor is always lighter than wall
  const getBrightness = (color: string): number => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  const wallBrightness = getBrightness(wallColor);
  const floorBrightness = getBrightness(floorColor);

  // If floor is darker than wall, swap or adjust
  if (floorBrightness < wallBrightness) {
    // Make floor slightly lighter
    const hex = floorColor.replace('#', '');
    const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + 10);
    const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + 10);
    const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + 10);
    floorColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  return {
    wall: wallColor,
    floor: floorColor,
  };
}

/**
 * Get the color theme for a specific level
 * Themes change every 4 sectors (levels 1-4, 5-8, 9-12, etc.)
 */
export function getThemeForLevel(level: number): ColorPalette {
  // Calculate which 4-sector group this level belongs to
  // Levels 1-4 = group 0, 5-8 = group 1, 9-12 = group 2, etc.
  const themeGroup = Math.floor((level - 1) / 4);
  
  // Use themeGroup as seed for consistent theme per 4-sector group
  return generateColorPalette(themeGroup);
}

