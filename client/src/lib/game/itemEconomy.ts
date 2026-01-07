import { Item, GameState } from './types';

/**
 * Item Economy Index System
 * Tracks expected vs actual item power to align difficulty scaling
 * Availability-aware expected growth based on what was actually offered to the player
 */

/**
 * Item offer tracking structure
 */
export interface ItemOffer {
  item: Item;
  level: number;
  source: 'drop' | 'shop' | 'boss' | 'bonus';
  coinsAtOffer: number;
  wasPurchased: boolean;
  timestamp: number;
}

/**
 * Offer power metrics for a level
 */
export interface OfferPowerMetrics {
  level: number;
  offeredPower: number;
  expectedOfferPower: number; // EMA-smoothed
  actualOwnedPower: number;
  economyRatio: number;
  offersSeen: number;
  affordableOffers: number;
  affordabilityRate: number;
}

/**
 * Configuration for item economy system
 */
export const ECONOMY_CONFIG = {
  // EMA smoothing for expected offer power
  smoothingAlpha: 0.3,
  smoothingWindow: 10,
  
  // Affordability weight thresholds
  affordWeightFull: 1.0,      // price <= coins
  affordWeightPartial: 0.5,   // price <= 1.5 * coins
  affordWeightNone: 0.0,      // price > 1.5 * coins
  
  // Economy ratio exponent (mild adjustment)
  economyExponent: 0.25,
  
  // Economy ratio clamp
  economyRatioClamp: [0.8, 1.25] as [number, number],
  
  // Synergy multiplier clamp
  synergyClamp: [0.8, 1.3] as [number, number],
  
  // Soft assist thresholds
  softAssistThreshold: 0.9,    // If economyRatio < 0.9, apply soft assists
  coinRewardMultiplier: 1.2,  // Increase coin rewards
  shopPriceReduction: 0.9,    // Reduce shop prices by 10%
};

// Track all offers in current run
let offerHistory: ItemOffer[] = [];
let expectedOfferPowerHistory: number[] = [];
let lastExpectedOfferPower: number = 0;

/**
 * Calculate power value for an item based on its stats and tier
 */
export function calculateItemPowerValue(item: Item, level: number): number {
  if (!item.stats) return 0; // Scrolls have no power value
  
  // Calculate stat-based power
  let statPower = 0;
  if (item.stats.damage) {
    statPower += item.stats.damage * 2.0; // Damage is highly valuable
  }
  if (item.stats.defense) {
    statPower += item.stats.defense * 1.5; // Defense is valuable but less than damage
  }
  if (item.stats.speed) {
    statPower += item.stats.speed * 15.0; // Speed multiplies DPS, so high value
  }
  if (item.stats.vision) {
    statPower += item.stats.vision * 5.0; // Vision is utility, moderate value
  }
  if (item.stats.heal) {
    statPower += item.stats.heal * 0.1; // Healing is consumable, low power value
  }
  
  // Scale by rarity
  const rarityMultiplier = {
    common: 1.0,
    rare: 1.3,
    epic: 1.6,
    legendary: 2.0,
  }[item.rarity] || 1.0;
  
  const levelMultiplier = 1 + (level - 1) * 0.05;
  
  return statPower * rarityMultiplier * levelMultiplier;
}

/**
 * Record an item offer (when item is shown/dropped to player)
 */
export function recordItemOffer(
  item: Item,
  level: number,
  source: ItemOffer['source'],
  coinsAtOffer: number,
  wasPurchased: boolean = false
): void {
  const offer: ItemOffer = {
    item,
    level,
    source,
    coinsAtOffer,
    wasPurchased,
    timestamp: Date.now(),
  };
  
  offerHistory.push(offer);
  
  // Log for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[OfferTracking] Recorded offer: ${item.name} (${item.rarity}) at level ${level} from ${source}, coins: ${coinsAtOffer}`);
  }
}

/**
 * Mark an offer as purchased (when player buys it)
 */
export function markOfferPurchased(itemId: string): void {
  const offer = offerHistory.find(o => o.item.id === itemId);
  if (offer) {
    offer.wasPurchased = true;
  }
}

/**
 * Reset tracking state (for new runs)
 */
export function resetOfferTracking(): void {
  offerHistory = [];
  expectedOfferPowerHistory = [];
  lastExpectedOfferPower = 0;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[OfferTracking] Reset for new run');
  }
}

/**
 * Export offer history for analysis
 */
export function getOfferHistory(): readonly ItemOffer[] {
  return offerHistory;
}

/**
 * Calculate affordability weight for an item offer
 */
export function calculateAffordWeight(price: number, coinsAtOffer: number): number {
  const cfg = ECONOMY_CONFIG;
  
  if (price <= coinsAtOffer) {
    return cfg.affordWeightFull; // 1.0 - fully affordable
  } else if (price <= coinsAtOffer * 1.5) {
    return cfg.affordWeightPartial; // 0.5 - partially affordable
  } else {
    return cfg.affordWeightNone; // 0.0 - not affordable
  }
}

/**
 * Calculate unlock weight (whether item tier is available at this level)
 */
export function calculateUnlockWeight(item: Item, level: number): number {
  // Check if item rarity is available at this level
  const rarityUnlockLevels: Record<Item['rarity'], number> = {
    common: 1,
    rare: 3,
    epic: 8,
    legendary: 12,
  };
  
  const unlockLevel = rarityUnlockLevels[item.rarity] || 1;
  if (level < unlockLevel) return 0.0;
  
  // Ramp up availability over a few levels after unlock
  const rampLevels = 5;
  if (level < unlockLevel + rampLevels) {
    return (level - unlockLevel + 1) / rampLevels;
  }
  
  return 1.0; // Fully available
}

/**
 * Calculate offered power for a specific level (weighted by affordability and unlock)
 */
export function calculateOfferedPower(level: number): number {
  // Get all offers up to and including this level
  const offersUpToLevel = offerHistory.filter(o => o.level <= level);
  
  let totalOfferedPower = 0;
  
  for (const offer of offersUpToLevel) {
    const powerValue = calculateItemPowerValue(offer.item, offer.level);
    const affordWeight = calculateAffordWeight(offer.item.price, offer.coinsAtOffer);
    const unlockWeight = calculateUnlockWeight(offer.item, offer.level);
    
    const weightedPower = powerValue * affordWeight * unlockWeight;
    totalOfferedPower += weightedPower;
  }
  
  return totalOfferedPower;
}

/**
 * Calculate expected offer power using EMA smoothing
 */
export function calculateExpectedOfferPower(level: number): number {
  const offeredPower = calculateOfferedPower(level);
  const alpha = ECONOMY_CONFIG.smoothingAlpha;
  
  // EMA: smoothed = alpha * current + (1 - alpha) * previous
  const smoothed = alpha * offeredPower + (1 - alpha) * lastExpectedOfferPower;
  lastExpectedOfferPower = smoothed;
  
  // Track history
  expectedOfferPowerHistory.push(smoothed);
  if (expectedOfferPowerHistory.length > ECONOMY_CONFIG.smoothingWindow) {
    expectedOfferPowerHistory.shift();
  }
  
  return smoothed;
}

/**
 * Calculate synergy multiplier for equipped items
 * Rewards diverse builds, penalizes extreme stacking
 */
export function calculateSynergyMultiplier(loadout: {
  weapon: Item | null;
  armor: Item | null;
  utility: Item | null;
}): number {
  const equipped = [loadout.weapon, loadout.armor, loadout.utility].filter(Boolean) as Item[];
  if (equipped.length === 0) return 1.0;
  
  // Count stat diversity
  const statTypes = new Set<string>();
  equipped.forEach(item => {
    if (item.stats) {
      Object.keys(item.stats).forEach(stat => {
        if (item.stats![stat as keyof typeof item.stats]) {
          statTypes.add(stat);
        }
      });
    }
  });
  
  // Diversity bonus: more stat types = better synergy
  const diversityBonus = Math.min(statTypes.size / 3, 1.0);
  
  // Check for extreme stacking (e.g., all damage)
  const damageCount = equipped.filter(item => 
    item.stats?.damage && item.stats.damage > 0
  ).length;
  const stackingPenalty = damageCount >= 3 ? 0.9 : 1.0;
  
  // Synergy ranges from 0.8 to 1.3
  const synergy = 0.8 + (diversityBonus * 0.5) * stackingPenalty;
  
  return Math.max(
    ECONOMY_CONFIG.synergyClamp[0],
    Math.min(ECONOMY_CONFIG.synergyClamp[1], synergy)
  );
}

/**
 * Calculate actual owned power from player's loadout
 */
export function calculateActualOwnedPower(
  loadout: {
    weapon: Item | null;
    armor: Item | null;
    utility: Item | null;
  },
  level: number
): number {
  const equipped = [loadout.weapon, loadout.armor, loadout.utility].filter(Boolean) as Item[];
  
  let totalPower = 0;
  equipped.forEach(item => {
    totalPower += calculateItemPowerValue(item, level);
  });
  
  // Apply synergy multiplier
  const synergy = calculateSynergyMultiplier(loadout);
  return totalPower * synergy;
}

/**
 * Calculate economy ratio (actual vs expected offer power)
 */
export function calculateEconomyRatio(
  actualOwnedPower: number,
  expectedOfferPower: number
): number {
  if (expectedOfferPower === 0) return 1.0;
  
  const ratio = actualOwnedPower / expectedOfferPower;
  const cfg = ECONOMY_CONFIG;
  
  return Math.max(
    cfg.economyRatioClamp[0],
    Math.min(cfg.economyRatioClamp[1], ratio)
  );
}

/**
 * Get comprehensive offer power metrics for a level
 */
export function getOfferPowerMetrics(
  level: number,
  loadout: {
    weapon: Item | null;
    armor: Item | null;
    utility: Item | null;
  }
): OfferPowerMetrics {
  const offeredPower = calculateOfferedPower(level);
  const expectedOfferPower = calculateExpectedOfferPower(level);
  const actualOwnedPower = calculateActualOwnedPower(loadout, level);
  const economyRatio = calculateEconomyRatio(actualOwnedPower, expectedOfferPower);
  
  // Count offers and affordable offers
  const offersUpToLevel = offerHistory.filter(o => o.level <= level);
  const offersSeen = offersUpToLevel.length;
  const affordableOffers = offersUpToLevel.filter(o => 
    calculateAffordWeight(o.item.price, o.coinsAtOffer) > 0
  ).length;
  const affordabilityRate = offersSeen > 0 ? affordableOffers / offersSeen : 0;
  
  return {
    level,
    offeredPower,
    expectedOfferPower,
    actualOwnedPower,
    economyRatio,
    offersSeen,
    affordableOffers,
    affordabilityRate,
  };
}

/**
 * Get soft assist adjustments based on economy ratio
 * Prefers soft assists (coin rewards, shop prices, mob weights) before direct difficulty reduction
 */
export function getSoftAssistAdjustments(economyRatio: number): {
  coinRewardMultiplier: number;
  shopPriceMultiplier: number;
  eliteMobWeightMultiplier: number;
} {
  const cfg = ECONOMY_CONFIG;
  
  if (economyRatio >= cfg.softAssistThreshold) {
    // No assists needed
    return {
      coinRewardMultiplier: 1.0,
      shopPriceMultiplier: 1.0,
      eliteMobWeightMultiplier: 1.0,
    };
  }
  
  // Apply soft assists (stronger as ratio gets lower)
  const assistStrength = (cfg.softAssistThreshold - economyRatio) / cfg.softAssistThreshold;
  
  return {
    coinRewardMultiplier: 1.0 + (cfg.coinRewardMultiplier - 1.0) * assistStrength,
    shopPriceMultiplier: 1.0 - (1.0 - cfg.shopPriceReduction) * assistStrength,
    eliteMobWeightMultiplier: 1.0 - 0.2 * assistStrength, // Reduce elite mobs by up to 20%
  };
}

/**
 * Log offer metrics for tuning (development only)
 */
export function logOfferMetrics(metrics: OfferPowerMetrics): void {
  if (process.env.NODE_ENV !== 'development') return;
  
  console.log(`[OfferMetrics] Level ${metrics.level}:`, {
    offeredPower: metrics.offeredPower.toFixed(2),
    expectedOfferPower: metrics.expectedOfferPower.toFixed(2),
    actualOwnedPower: metrics.actualOwnedPower.toFixed(2),
    economyRatio: metrics.economyRatio.toFixed(3),
    offersSeen: metrics.offersSeen,
    affordableOffers: metrics.affordableOffers,
    affordabilityRate: (metrics.affordabilityRate * 100).toFixed(1) + '%',
  });
  
  // Log soft assist status
  if (metrics.economyRatio < ECONOMY_CONFIG.softAssistThreshold) {
    const assists = getSoftAssistAdjustments(metrics.economyRatio);
    console.log(`[SoftAssists] Active: coinReward=${assists.coinRewardMultiplier.toFixed(2)}x, shopPrice=${assists.shopPriceMultiplier.toFixed(2)}x, eliteMobWeight=${assists.eliteMobWeightMultiplier.toFixed(2)}x`);
  }
}

