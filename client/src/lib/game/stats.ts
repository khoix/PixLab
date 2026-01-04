import { PlayerStats, GameState } from './types';

/**
 * Calculate effective player stats by applying equipped item bonuses
 */
export function getEffectiveStats(baseStats: PlayerStats, loadout: GameState['loadout']): PlayerStats {
  const effectiveStats = { ...baseStats };
  
  // Apply weapon stats
  if (loadout.weapon?.stats) {
    if (loadout.weapon.stats.damage) {
      effectiveStats.damage += loadout.weapon.stats.damage;
    }
    if (loadout.weapon.stats.speed) {
      effectiveStats.speed += loadout.weapon.stats.speed;
    }
    if (loadout.weapon.stats.vision) {
      effectiveStats.visionRadius += loadout.weapon.stats.vision;
    }
  }
  
  // Apply armor stats
  if (loadout.armor?.stats) {
    if (loadout.armor.stats.defense) {
      // Defense reduces incoming damage (stored separately, applied during damage calculation)
      // For now, we'll track it but apply it in damage calculation
    }
    if (loadout.armor.stats.speed) {
      effectiveStats.speed += loadout.armor.stats.speed;
    }
    if (loadout.armor.stats.vision) {
      effectiveStats.visionRadius += loadout.armor.stats.vision;
    }
    if (loadout.armor.stats.damage) {
      effectiveStats.damage += loadout.armor.stats.damage;
    }
  }
  
  // Apply utility stats
  if (loadout.utility?.stats) {
    if (loadout.utility.stats.damage) {
      effectiveStats.damage += loadout.utility.stats.damage;
    }
    if (loadout.utility.stats.speed) {
      effectiveStats.speed += loadout.utility.stats.speed;
    }
    if (loadout.utility.stats.vision) {
      effectiveStats.visionRadius += loadout.utility.stats.vision;
    }
  }
  
  return effectiveStats;
}

/**
 * Get total defense from equipped armor
 */
export function getTotalDefense(loadout: GameState['loadout']): number {
  let defense = 0;
  
  if (loadout.armor?.stats?.defense) {
    defense += loadout.armor.stats.defense;
  }
  
  // Also check weapon and utility for defense (some items might have it)
  if (loadout.weapon?.stats?.defense) {
    defense += loadout.weapon.stats.defense;
  }
  
  if (loadout.utility?.stats?.defense) {
    defense += loadout.utility.stats.defense;
  }
  
  return defense;
}

