import { Level, Position, Entity, MobSubtype, Item, Portal, Lightswitch, ScrollType } from './types';
import { MOB_TYPES } from './constants';
import { generateItem, generateScroll } from './items';
import { calculateScaling, calculatePlayerPower } from './scaling';
import { PlayerStats, GameState } from './types';

// Item templates - matching items.ts
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
  { name: 'Potion of Light', type: 'consumable', baseStats: { vision: 1.0 }, description: 'Temporarily increases vision radius' },
];

const ALL_TEMPLATES = [
  ...WEAPON_TEMPLATES,
  ...ARMOR_TEMPLATES,
  ...UTILITY_TEMPLATES,
  ...CONSUMABLE_TEMPLATES,
];

const RARITY_MULTIPLIERS = {
  common: 1.0,
  rare: 1.5,
  epic: 2.0,
  legendary: 3.0,
};

export interface ItemOption {
  templateName: string;
  type: Item['type'];
  rarity: Item['rarity'];
  displayName: string;
  isScroll?: boolean;
  scrollType?: ScrollType;
}

// All scroll types
const SCROLL_TYPES: ScrollType[] = [
  'scroll_fortune',
  'scroll_pathfinding',
  'scroll_commerce',
  'scroll_ending',
  'scroll_threatsense',
  'scroll_lootsense',
  'scroll_phasing',
];

const SCROLL_NAMES: Record<ScrollType, string> = {
  scroll_fortune: 'Scroll of Fortune',
  scroll_pathfinding: 'Scroll of Pathfinding',
  scroll_commerce: 'Scroll of Commerce',
  scroll_ending: 'Scroll of Ending',
  scroll_threatsense: 'Scroll of Threat-sense',
  scroll_lootsense: 'Scroll of Loot-sense',
  scroll_phasing: 'Scroll of Phasing',
};

/**
 * Get all available item options (all templates × all rarities + all scrolls × all rarities)
 */
export function getAllItemOptions(): ItemOption[] {
  const rarities: Item['rarity'][] = ['common', 'rare', 'epic', 'legendary'];
  const options: ItemOption[] = [];
  
  // Add regular items (templates × rarities)
  for (const template of ALL_TEMPLATES) {
    for (const rarity of rarities) {
      options.push({
        templateName: template.name,
        type: template.type,
        rarity,
        displayName: `${template.name} (${rarity})`,
        isScroll: false,
      });
    }
  }
  
  // Add scrolls (scroll types × rarities)
  for (const scrollType of SCROLL_TYPES) {
    for (const rarity of rarities) {
      options.push({
        templateName: SCROLL_NAMES[scrollType],
        type: 'consumable',
        rarity,
        displayName: `${SCROLL_NAMES[scrollType]} (${rarity})`,
        isScroll: true,
        scrollType,
      });
    }
  }
  
  return options;
}

let entityIdCounter = 0;

/**
 * Find a valid floor tile for spawning
 */
export function findValidSpawnPosition(
  level: Level,
  excludePositions: Position[] = [],
  minDistanceFromPlayer: number = 2
): Position | null {
  const excludeSet = new Set(excludePositions.map(p => `${p.x},${p.y}`));
  
  // Collect all valid floor positions
  const validPositions: Position[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.tiles[y][x] === 'floor') {
        const posKey = `${x},${y}`;
        if (!excludeSet.has(posKey)) {
          // Check distance from player start
          const dist = Math.abs(x - level.startPos.x) + Math.abs(y - level.startPos.y);
          if (dist >= minDistanceFromPlayer) {
            validPositions.push({ x, y });
          }
        }
      }
    }
  }
  
  if (validPositions.length === 0) return null;
  return validPositions[Math.floor(Math.random() * validPositions.length)];
}

/**
 * Spawn a regular mob entity
 */
export function spawnMobEntity(
  level: Level,
  mobSubtype: MobSubtype,
  pos: Position,
  levelNum: number = 1,
  playerStats?: PlayerStats,
  loadout?: GameState['loadout']
): Entity | null {
  const mobType = MOB_TYPES.find(m => m.subtype === mobSubtype);
  if (!mobType) return null;
  
  // Calculate scaling
  const scaling = calculateScaling({
    level: levelNum,
    sectorType: 'normal',
    mobArchetype: mobType.subtype,
    playerPower: playerStats && loadout ? calculatePlayerPower(playerStats, loadout) : undefined,
    useAdaptive: !!(playerStats && loadout),
    loadout: loadout,
    useEconomyIndex: !!(playerStats && loadout)
  });
  
  const baseHp = mobType.baseHp + levelNum * mobType.hpPerLevel;
  const baseDamage = mobType.baseDamage + levelNum * mobType.damagePerLevel;
  const hp = Math.floor(baseHp * scaling.hpMultiplier);
  const damage = Math.floor(baseDamage * scaling.dmgMultiplier);
  
  const entity: Entity = {
    id: `demo-enemy-${entityIdCounter++}`,
    type: 'enemy',
    pos,
    hp,
    maxHp: hp,
    damage,
    mobSubtype,
    moveSpeed: mobType.moveSpeed,
    attackCooldown: mobType.attackCooldown,
    lastAttackTime: 0,
    canPhase: mobType.canPhase,
    isRanged: mobType.isRanged,
    range: mobType.range,
    isStationary: mobType.isStationary,
    chargeDirection: null,
  };
  
  // Initialize mob-specific properties
  if (!mobType.isStationary) {
    entity.roamDirection = null;
    entity.lastRoamChange = 0;
  }
  
  if (mobSubtype === 'tracker') {
    entity.isStalking = true;
    entity.pounceDirection = null;
    entity.moveSpeed = 1.55 + (levelNum * 0.04);
    entity.attackCooldown = Math.max(1050, 1600 - (levelNum * 15));
  }
  
  if (mobSubtype === 'moth') {
    entity.orbitAngle = 0;
    entity.blinkCooldown = 0;
    entity.moveSpeed = 1.35 + (levelNum * 0.03);
    entity.attackCooldown = Math.max(850, 1250 - (levelNum * 10));
  }
  
  if (mobSubtype === 'cerberus') {
    entity.biteComboCount = 0;
    entity.lastBiteTime = 0;
    entity.moveSpeed = 1.05 + (levelNum * 0.02);
    entity.attackCooldown = Math.max(1400, 2200 - (levelNum * 20));
  }
  
  return entity;
}

/**
 * Spawn a boss entity
 */
export function spawnBossEntity(
  level: Level,
  bossType: 'boss_zeus' | 'boss_hades' | 'boss_ares',
  pos: Position,
  levelNum: number = 8,
  playerStats?: PlayerStats,
  loadout?: GameState['loadout']
): Entity | null {
  // Calculate boss scaling
  const bossScaling = calculateScaling({
    level: levelNum,
    sectorType: 'boss',
    mobArchetype: 'boss',
    playerPower: playerStats && loadout ? calculatePlayerPower(playerStats, loadout) : undefined,
    useAdaptive: !!(playerStats && loadout),
    loadout: loadout,
    useEconomyIndex: !!(playerStats && loadout)
  });
  
  const baseHp = 150 + levelNum * 15;
  const baseDamage = 20 + levelNum * 2;
  const hp = Math.floor(baseHp * bossScaling.hpMultiplier);
  const damage = Math.floor(baseDamage * bossScaling.dmgMultiplier);
  
  const entity: Entity = {
    id: `demo-boss-${entityIdCounter++}`,
    type: 'boss_enemy',
    pos,
    hp,
    maxHp: hp,
    damage,
    isBoss: true,
    mobSubtype: bossType,
    moveSpeed: 0.8,
    attackCooldown: 1000,
    lastAttackTime: 0,
    canPhase: bossType === 'boss_hades',
    isRanged: bossType === 'boss_zeus',
    range: bossType === 'boss_zeus' ? 6 : 1,
    isStationary: false,
    chargeDirection: bossType === 'boss_ares' ? null : undefined,
  };
  
  return entity;
}

/**
 * Spawn a specific item at a position
 */
export function spawnSpecificItemAtPosition(
  level: Level,
  templateName: string,
  rarity: Item['rarity'],
  pos: Position,
  levelNum: number = 1,
  scrollType?: ScrollType
): { pos: Position; item: Item } | null {
  // Check if this is a scroll
  if (scrollType) {
    const scroll = generateScroll(scrollType, rarity);
    return { pos, item: scroll };
  }
  
  // Find the template
  const template = ALL_TEMPLATES.find(t => t.name === templateName);
  if (!template) return null;
  
  // Calculate stats based on template, rarity, and level
  const multiplier = RARITY_MULTIPLIERS[rarity];
  const levelMultiplier = 1 + (levelNum - 1) * 0.1; // 10% per level
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
  
  // Generate item name with rarity prefix
  const rarityPrefix = {
    common: '',
    rare: 'Rare ',
    epic: 'Epic ',
    legendary: 'Legendary ',
  }[rarity];
  
  const itemName = `${rarityPrefix}${template.name}`;
  
  // Calculate price
  const statValue = Object.values(stats).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
  const price = Math.floor(statValue * 2 * multiplier);
  
  const item: Item = {
    id: `demo-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: itemName,
    type: template.type,
    rarity,
    stats,
    price,
    description: template.description,
  };
  
  return { pos, item };
}

/**
 * Spawn an item at a position (legacy function for backward compatibility)
 */
export function spawnItemAtPosition(
  level: Level,
  itemType: Item['type'],
  rarity: Item['rarity'],
  pos: Position,
  levelNum: number = 1
): { pos: Position; item: Item } | null {
  // Generate item with specific rarity
  // Note: generateItem doesn't accept type parameter, so we'll generate and filter
  let attempts = 0;
  const maxAttempts = 50; // Prevent infinite loop
  
  while (attempts < maxAttempts) {
    const item = generateItem(levelNum, rarity);
    if (item.type === itemType) {
      return { pos, item };
    }
    attempts++;
  }
  
  // Fallback: return any item of the requested rarity
  const item = generateItem(levelNum, rarity);
  return { pos, item };
}

/**
 * Spawn a portal at a position
 */
export function spawnPortalAtPosition(
  level: Level,
  pos: Position
): Portal | null {
  // Find a random exit position (2-5 tiles away)
  const exitPositions: Position[] = [];
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist >= 2 && dist <= 5) {
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (x >= 0 && x < level.width && y >= 0 && y < level.height) {
          exitPositions.push({ x, y });
        }
      }
    }
  }
  
  if (exitPositions.length === 0) {
    // Fallback to a nearby position
    exitPositions.push({ x: pos.x + 2, y: pos.y });
  }
  
  const exitPos = exitPositions[Math.floor(Math.random() * exitPositions.length)];
  
  const portal: Portal = {
    id: `demo-portal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    pos,
    exitPos,
  };
  
  return portal;
}

/**
 * Spawn a lightswitch at a position
 */
export function spawnLightswitchAtPosition(
  level: Level,
  pos: Position
): Lightswitch | null {
  const lightswitch: Lightswitch = {
    id: `demo-lightswitch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    pos,
    activated: false,
  };
  
  return lightswitch;
}

