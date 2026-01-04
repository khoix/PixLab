import { Item } from './types';

// Extract base name from item (removes modifiers like "of Power", "Enhanced", etc.)
export function getItemBaseName(itemName: string): string {
  // Remove rarity prefixes
  const withoutRarity = itemName
    .replace(/^(Enhanced|Masterwork|Legendary)\s+/i, '')
    .trim();
  
  // Remove stat modifiers (everything after "of")
  const baseName = withoutRarity.split(/\s+of\s+/i)[0].trim();
  
  // Handle special boss drop names that might have "Lv" suffix
  const withoutLevel = baseName.replace(/\s+Lv\d+$/i, '').trim();
  
  return withoutLevel;
}

// Map base names to visual subtypes
const WEAPON_SUBTYPES: { [key: string]: string } = {
  'Sword': 'sword',
  'Axe': 'axe',
  'Dagger': 'dagger',
  'Mace': 'mace',
  'Spear': 'spear',
  // Boss drops that are weapons
  'Oblivion Blade': 'sword',
  "Titan's Gauntlet": 'mace',
  'Void Reaver': 'dagger',
  'Stormbreaker': 'axe',
  'Bloodthirster': 'sword',
  'Eternal Flame': 'sword',
  'Vortex Blade': 'sword',
  'Doomhammer': 'mace',
};

const ARMOR_SUBTYPES: { [key: string]: string } = {
  'Armor': 'armor',
  'Shield': 'shield',
  'Helmet': 'helmet',
  'Boots': 'boots',
  'Gauntlets': 'gauntlets',
  // Boss drops that are armor
  'Aegis Plate': 'armor',
  'Hermes Boots': 'boots',
  'Dragon Scale Mail': 'armor',
  'Celestial Aegis': 'shield',
  'Shadow Step Boots': 'boots',
  'Fortress Plate': 'armor',
  "Necromancer's Mantle": 'armor',
  'Aetherial Cloak': 'armor',
  "Guardian's Bulwark": 'shield',
};

const UTILITY_SUBTYPES: { [key: string]: string } = {
  'Scope': 'scope',
  'Thruster': 'thruster',
  'Scanner': 'scanner',
  'Amplifier': 'amplifier',
  // Boss drops that are utility
  'All-Seeing Eye': 'scope',
  'Chronos Watch': 'thruster',
  'Omniscient Lens': 'scope',
  'Quantum Accelerator': 'thruster',
  'Reality Shard': 'amplifier',
};

// Get gear subtype from item
export function getWeaponSubtype(weapon: Item | null): string {
  if (!weapon) return 'none';
  const baseName = getItemBaseName(weapon.name);
  return WEAPON_SUBTYPES[baseName] || 'sword'; // Default to sword
}

export function getArmorSubtype(armor: Item | null): string {
  if (!armor) return 'none';
  const baseName = getItemBaseName(armor.name);
  return ARMOR_SUBTYPES[baseName] || 'armor'; // Default to armor
}

export function getUtilitySubtype(utility: Item | null): string {
  if (!utility) return 'none';
  const baseName = getItemBaseName(utility.name);
  return UTILITY_SUBTYPES[baseName] || 'scope'; // Default to scope
}

// Get base URL from Vite (handles /pixlab/ base path)
const BASE_URL = import.meta.env.BASE_URL || '/';

// Generate image paths for operator composition
export function getOperatorBasePath(): string {
  return `${BASE_URL}imgs/compendium/ops/operator.png`;
}

export function getOperatorHandPath(): string {
  return `${BASE_URL}imgs/compendium/ops/operator-hand.png`;
}

export function getWeaponImagePath(subtype: string): string {
  if (subtype === 'none') return '';
  return `${BASE_URL}imgs/compendium/ops/weapons/${subtype}.png`;
}

export function getArmorImagePath(subtype: string): string {
  if (subtype === 'none') return '';
  return `${BASE_URL}imgs/compendium/ops/armor/${subtype}.png`;
}

export function getUtilityImagePath(subtype: string): string {
  if (subtype === 'none') return '';
  return `${BASE_URL}imgs/compendium/ops/utility/${subtype}.png`;
}

// Get gauntlets image paths (special case - separate images for gauntlets and sleeve)
export function getGauntletsImagePath(): string {
  return `${BASE_URL}imgs/compendium/ops/armor/gauntlets.png`;
}

export function getGauntletsSleeveImagePath(): string {
  return `${BASE_URL}imgs/compendium/ops/armor/gauntlets-sleeve.png`;
}

// Generate image filename for mob
export function getMobImagePath(subtype: string): string {
  return `${BASE_URL}imgs/compendium/mobs/${subtype}.png`;
}

