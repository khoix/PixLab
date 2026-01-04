import { Item } from './types';

// Base item templates
interface ItemTemplate {
  name: string;
  type: Item['type'];
  baseStats: {
    damage?: number;
    defense?: number;
    speed?: number;
    vision?: number;
    heal?: number;
  };
  description: string;
}

const WEAPON_TEMPLATES: ItemTemplate[] = [
  { name: 'Sword', type: 'weapon', baseStats: { damage: 9 }, description: 'A sharp blade' },
  { name: 'Axe', type: 'weapon', baseStats: { damage: 7 }, description: 'Heavy and powerful' },
  { name: 'Dagger', type: 'weapon', baseStats: { damage: 4, speed: 0.2 }, description: 'Quick and light' },
  { name: 'Mace', type: 'weapon', baseStats: { damage: 8 }, description: 'Crushing force' },
  { name: 'Spear', type: 'weapon', baseStats: { damage: 6, vision: 0.5 }, description: 'Long reach' },
];

const ARMOR_TEMPLATES: ItemTemplate[] = [
  { name: 'Armor', type: 'armor', baseStats: { defense: 5 }, description: 'Protective plating' },
  { name: 'Shield', type: 'armor', baseStats: { defense: 8 }, description: 'Defensive barrier' },
  { name: 'Helmet', type: 'armor', baseStats: { defense: 3, vision: 0.3 }, description: 'Head protection' },
  { name: 'Boots', type: 'armor', baseStats: { defense: 2, speed: 0.3 }, description: 'Swift movement' },
  { name: 'Gauntlets', type: 'armor', baseStats: { defense: 4, damage: 2 }, description: 'Reinforced fists' },
];

const UTILITY_TEMPLATES: ItemTemplate[] = [
  { name: 'Scope', type: 'utility', baseStats: { vision: 1.5 }, description: 'Enhanced vision' },
  { name: 'Thruster', type: 'utility', baseStats: { speed: 0.8 }, description: 'Speed boost' },
  { name: 'Scanner', type: 'utility', baseStats: { vision: 1.0, damage: 2 }, description: 'Multi-purpose tool' },
  { name: 'Amplifier', type: 'utility', baseStats: { damage: 3, vision: 0.5 }, description: 'Power enhancement' },
];

const CONSUMABLE_TEMPLATES: ItemTemplate[] = [
  { name: 'Potion', type: 'consumable', baseStats: { heal: 50 }, description: 'Restores health' },
  { name: 'Elixir', type: 'consumable', baseStats: { heal: 100 }, description: 'Major healing' },
  { name: 'Stim', type: 'consumable', baseStats: { speed: 1.0 }, description: 'Temporary speed boost' },
];

// Rarity multipliers
const RARITY_MULTIPLIERS = {
  common: 1.0,
  rare: 1.5,
  epic: 2.0,
  legendary: 3.0,
};

// Calculate sell value for an item
// Sell value is 60% of purchase price, or calculated from stats if price is 0 (boss drops)
export function calculateSellValue(item: Item): number {
  // If item has a price, use 60% of it
  if (item.price > 0) {
    return Math.floor(item.price * 0.6);
  }
  
  // For items without price (like boss drops), calculate from stats and rarity
  if (!item.stats) return 0;
  
  const statValue = Object.values(item.stats).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
  const multiplier = RARITY_MULTIPLIERS[item.rarity];
  // Base calculation: statValue * 1.2 * rarity multiplier, then 60% of that
  const baseValue = Math.floor(statValue * 1.2 * multiplier);
  return Math.floor(baseValue * 0.6);
}

// Rarity probability thresholds (cumulative)
// These scale with level - higher levels have better chances
function getRarityProbabilities(level: number): { [key: string]: number } {
  const baseCommon = 0.6;
  const baseRare = 0.25;
  const baseEpic = 0.1;
  const baseLegendary = 0.05;
  
  // Scale probabilities - higher levels shift toward better rarities
  const levelFactor = Math.min(level / 20, 0.5); // Max 50% shift at level 20+
  
  return {
    common: baseCommon - levelFactor * 0.3,      // 60% -> 30% at high levels
    rare: baseRare + levelFactor * 0.15,          // 25% -> 40%
    epic: baseEpic + levelFactor * 0.1,          // 10% -> 20%
    legendary: baseLegendary + levelFactor * 0.05, // 5% -> 10%
  };
}

// Select rarity based on probabilities
function selectRarity(level: number): Item['rarity'] {
  const probs = getRarityProbabilities(level);
  const rand = Math.random();
  
  if (rand < probs.common) return 'common';
  if (rand < probs.common + probs.rare) return 'rare';
  if (rand < probs.common + probs.rare + probs.epic) return 'epic';
  return 'legendary';
}

// Stat-based name modifiers
const STAT_MODIFIERS = {
  damage: ['of Power', 'of Destruction', 'of Wrath', 'of Fury', 'of Might'],
  defense: ['of Protection', 'of Warding', 'of Fortitude', 'of Resilience', 'of Guarding'],
  speed: ['of Swiftness', 'of Haste', 'of Agility', 'of Quickness', 'of Velocity'],
  vision: ['of Sight', 'of Clarity', 'of Perception', 'of Awareness', 'of Insight'],
  heal: ['of Restoration', 'of Healing', 'of Renewal', 'of Rejuvenation', 'of Vitality'],
};

// Dual-stat combinations
const DUAL_STAT_MODIFIERS: { [key: string]: string[] } = {
  'damage+vision': ['of the Seer', 'of Foresight', 'of Precise Strike'],
  'damage+speed': ['of the Wind', 'of Lightning', 'of the Storm'],
  'damage+defense': ['of the Guardian', 'of Battle', 'of War'],
  'defense+speed': ['of the Fleet', 'of Mobility', 'of the Nimble'],
  'defense+vision': ['of Vigilance', 'of Watchfulness', 'of the Sentinel'],
  'speed+vision': ['of the Scout', 'of Awareness', 'of the Ranger'],
  'vision+heal': ['of Clarity', 'of Insight', 'of Understanding'],
  'speed+heal': ['of Recovery', 'of Renewal', 'of Restoration'],
};

// Generate unique item name based on stats
function generateItemName(baseName: string, stats: Item['stats'], rarity: Item['rarity']): string {
  if (!stats) return baseName;
  
  const statKeys = Object.keys(stats).filter(key => stats[key as keyof typeof stats] !== undefined && stats[key as keyof typeof stats] !== 0) as Array<keyof typeof stats>;
  
  if (statKeys.length === 0) return baseName;
  
  // For single stat items
  if (statKeys.length === 1) {
    const stat = statKeys[0];
    const statMods = STAT_MODIFIERS[stat as keyof typeof STAT_MODIFIERS];
    if (statMods && statMods.length > 0) {
      const modifier = statMods[Math.floor(Math.random() * statMods.length)];
      return `${baseName} ${modifier}`;
    }
  }
  
  // For dual stat items
  if (statKeys.length === 2) {
    const key1 = statKeys[0];
    const key2 = statKeys[1];
    const comboKey1 = `${key1}+${key2}`;
    const comboKey2 = `${key2}+${key1}`;
    
    const dualMods = DUAL_STAT_MODIFIERS[comboKey1] || DUAL_STAT_MODIFIERS[comboKey2];
    if (dualMods && dualMods.length > 0) {
      const modifier = dualMods[Math.floor(Math.random() * dualMods.length)];
      return `${baseName} ${modifier}`;
    }
    
    // Fallback: use primary stat modifier
    const primaryStat = statKeys[0];
    const primaryMods = STAT_MODIFIERS[primaryStat as keyof typeof STAT_MODIFIERS];
    if (primaryMods && primaryMods.length > 0) {
      const modifier = primaryMods[Math.floor(Math.random() * primaryMods.length)];
      return `${baseName} ${modifier}`;
    }
  }
  
  // For items with 3+ stats, use the highest stat
  if (statKeys.length >= 3) {
    let maxStat: keyof typeof stats | null = null;
    let maxValue = 0;
    
    statKeys.forEach(key => {
      const value = stats[key];
      if (value && typeof value === 'number' && value > maxValue) {
        maxValue = value;
        maxStat = key;
      }
    });
    
    if (maxStat) {
      const maxStatMods = STAT_MODIFIERS[maxStat as keyof typeof STAT_MODIFIERS];
      if (maxStatMods && maxStatMods.length > 0) {
        const modifier = maxStatMods[Math.floor(Math.random() * maxStatMods.length)];
        return `${baseName} ${modifier}`;
      }
    }
  }
  
  // Rarity prefix as fallback
  const rarityPrefix = {
    common: '',
    rare: 'Enhanced ',
    epic: 'Masterwork ',
    legendary: 'Legendary ',
  }[rarity];
  
  return `${rarityPrefix}${baseName}`;
}

// Generate a random item
export function generateItem(level: number, rarity?: Item['rarity']): Item {
  const selectedRarity = rarity || selectRarity(level);
  const multiplier = RARITY_MULTIPLIERS[selectedRarity];
  
  // Select item type (weighted)
  const typeRoll = Math.random();
  let template: ItemTemplate;
  let templates: ItemTemplate[];
  
  if (typeRoll < 0.35) {
    templates = WEAPON_TEMPLATES;
  } else if (typeRoll < 0.65) {
    templates = ARMOR_TEMPLATES;
  } else if (typeRoll < 0.85) {
    templates = UTILITY_TEMPLATES;
  } else {
    templates = CONSUMABLE_TEMPLATES;
  }
  
  template = templates[Math.floor(Math.random() * templates.length)];
  
  // Scale base stats with level and rarity
  const levelMultiplier = 1 + (level - 1) * 0.1; // 10% per level
  const stats: Item['stats'] = {};
  
  if (template.baseStats.damage) {
    stats.damage = Math.floor(template.baseStats.damage * multiplier * levelMultiplier);
  }
  if (template.baseStats.defense) {
    stats.defense = Math.floor(template.baseStats.defense * multiplier * levelMultiplier);
  }
  if (template.baseStats.speed) {
    stats.speed = Math.round((template.baseStats.speed * multiplier * levelMultiplier) * 10) / 10;
  }
  if (template.baseStats.vision) {
    stats.vision = Math.round((template.baseStats.vision * multiplier * levelMultiplier) * 10) / 10;
  }
  if (template.baseStats.heal) {
    stats.heal = Math.floor(template.baseStats.heal * multiplier * levelMultiplier);
  }
  
  // Generate unique name based on stats
  const itemName = generateItemName(template.name, stats, selectedRarity);
  
  // Generate ID
  const id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Calculate price based on stats and rarity
  const statValue = Object.values(stats).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
  const price = Math.floor(statValue * 2 * multiplier);
  
  return {
    id,
    name: itemName,
    type: template.type,
    rarity: selectedRarity,
    stats,
    price,
    description: template.description,
  };
}

// Fixed boss drop items - these are the most powerful items
const BOSS_DROP_POOL: Array<Omit<Item, 'id'>> = [
  {
    name: 'Oblivion Blade',
    type: 'weapon',
    rarity: 'legendary',
    stats: { damage: 50, speed: 0.5 },
    price: 0,
    description: 'A blade that cuts through reality itself',
  },
  {
    name: 'Aegis Plate',
    type: 'armor',
    rarity: 'legendary',
    stats: { defense: 50 },
    price: 0,
    description: 'Impervious armor forged in the void',
  },
  {
    name: 'Hermes Boots',
    type: 'armor',
    rarity: 'legendary',
    stats: { speed: 2.0, defense: 10 },
    price: 0,
    description: 'Boots that grant godlike speed',
  },
  {
    name: 'All-Seeing Eye',
    type: 'utility',
    rarity: 'legendary',
    stats: { vision: 5.0, damage: 15 },
    price: 0,
    description: 'See everything, know everything',
  },
  {
    name: 'Titan\'s Gauntlet',
    type: 'weapon',
    rarity: 'legendary',
    stats: { damage: 60, defense: 20 },
    price: 0,
    description: 'The power of the titans in your hands',
  },
  {
    name: 'Phoenix Elixir',
    type: 'consumable',
    rarity: 'legendary',
    stats: { heal: 250 },
    price: 0,
    description: 'Reborn from the ashes',
  },
  {
    name: 'Void Reaver',
    type: 'weapon',
    rarity: 'legendary',
    stats: { damage: 55, vision: 1.5 },
    price: 0,
    description: 'Strikes from the shadows',
  },
  {
    name: 'Dragon Scale Mail',
    type: 'armor',
    rarity: 'legendary',
    stats: { defense: 45, damage: 10 },
    price: 0,
    description: 'Armor forged from ancient dragon scales',
  },
  {
    name: 'Chronos Watch',
    type: 'utility',
    rarity: 'legendary',
    stats: { speed: 1.5, vision: 2.0 },
    price: 0,
    description: 'Time bends to your will',
  },
  {
    name: 'Stormbreaker',
    type: 'weapon',
    rarity: 'legendary',
    stats: { damage: 70, speed: 0.3 },
    price: 0,
    description: 'Wields the fury of the storm',
  },
  {
    name: 'Celestial Aegis',
    type: 'armor',
    rarity: 'legendary',
    stats: { defense: 60, vision: 1.0 },
    price: 0,
    description: 'Divine protection from the heavens',
  },
  {
    name: 'Shadow Step Boots',
    type: 'armor',
    rarity: 'legendary',
    stats: { speed: 2.5, vision: 0.5 },
    price: 0,
    description: 'Move like a shadow through the darkness',
  },
  {
    name: 'Omniscient Lens',
    type: 'utility',
    rarity: 'legendary',
    stats: { vision: 6.0, defense: 15 },
    price: 0,
    description: 'Perception beyond mortal limits',
  },
  {
    name: 'Bloodthirster',
    type: 'weapon',
    rarity: 'legendary',
    stats: { damage: 65, speed: 0.7 },
    price: 0,
    description: 'Feeds on the life force of your enemies',
  },
  {
    name: 'Fortress Plate',
    type: 'armor',
    rarity: 'legendary',
    stats: { defense: 75 },
    price: 0,
    description: 'Immovable defense, ultimate protection',
  },
  {
    name: 'Quantum Accelerator',
    type: 'utility',
    rarity: 'legendary',
    stats: { speed: 2.0, damage: 20 },
    price: 0,
    description: 'Break the laws of physics',
  },
  {
    name: 'Eternal Flame',
    type: 'weapon',
    rarity: 'legendary',
    stats: { damage: 45, vision: 2.5, speed: 0.4 },
    price: 0,
    description: 'Burns with an undying fire',
  },
  {
    name: 'Guardian\'s Bulwark',
    type: 'armor',
    rarity: 'legendary',
    stats: { defense: 55, vision: 1.5 },
    price: 0,
    description: 'The ultimate shield of protection',
  },
  {
    name: 'Ambrosia',
    type: 'consumable',
    rarity: 'legendary',
    stats: { heal: 300 },
    price: 0,
    description: 'Food of the gods',
  },
  {
    name: 'Reality Shard',
    type: 'utility',
    rarity: 'legendary',
    stats: { damage: 25, vision: 3.0, speed: 0.8 },
    price: 0,
    description: 'A fragment of pure possibility',
  },
  {
    name: 'Doomhammer',
    type: 'weapon',
    rarity: 'legendary',
    stats: { damage: 80, defense: 5 },
    price: 0,
    description: 'The end of all things',
  },
  {
    name: 'Necromancer\'s Mantle',
    type: 'armor',
    rarity: 'legendary',
    stats: { defense: 40, damage: 15, vision: 1.0 },
    price: 0,
    description: 'Cloaked in death itself',
  },
  {
    name: 'Genesis Elixir',
    type: 'consumable',
    rarity: 'legendary',
    stats: { heal: 200, speed: 1.0 },
    price: 0,
    description: 'The beginning of new life',
  },
  {
    name: 'Vortex Blade',
    type: 'weapon',
    rarity: 'legendary',
    stats: { damage: 50, speed: 1.0, vision: 1.0 },
    price: 0,
    description: 'A perfect balance of power',
  },
  {
    name: 'Aetherial Cloak',
    type: 'armor',
    rarity: 'legendary',
    stats: { defense: 35, speed: 1.8, vision: 2.0 },
    price: 0,
    description: 'Woven from the fabric of space',
  },
];

// Generate a boss drop from the fixed pool
export function generateBossDrop(level: number): Item {
  const template = BOSS_DROP_POOL[Math.floor(Math.random() * BOSS_DROP_POOL.length)];
  
  // Scale boss items slightly with level
  const levelMultiplier = 1 + (level - 1) * 0.05; // 5% per level for boss items
  
  const stats: Item['stats'] = {};
  if (template.stats) {
    Object.entries(template.stats).forEach(([key, value]) => {
      if (typeof value === 'number') {
        stats[key as keyof typeof stats] = Math.floor(value * levelMultiplier);
      }
    });
  }
  
  return {
    ...template,
    id: `boss_drop_${level}_${Date.now()}`,
    stats,
    name: `${template.name} Lv${level}`,
  };
}

