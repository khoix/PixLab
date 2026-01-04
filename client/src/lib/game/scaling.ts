import { PlayerStats, GameState } from './types';
import { INITIAL_STATS } from './constants';
import { getEffectiveStats, getTotalDefense } from './stats';

/**
 * Configuration for the dynamic difficulty scaling system.
 * All values are tunable for balance adjustments.
 */
export const SCALING_CONFIG = {
  // Baseline curve: P_exp(L) = P0 * (1 + g)^L
  growthRate: 0.05,        // g - expected power growth per level
  initialPower: 0,         // P0 - will be calculated from INITIAL_STATS
  
  // Adaptive scaling: S(L) = (1 + a*L + b*L^2) * (ratio^p)
  linearCoeff: 0.06,       // a - linear scaling coefficient
  quadraticCoeff: 0.002,   // b - quadratic scaling coefficient
  powerExponent: 0.35,      // p - power exponent for ratio adjustment
  ratioClamp: [0.8, 1.25] as [number, number], // Clamp for player power ratio
  
  // Sector modifiers
  normalHpExponent: 0.95,  // HP multiplier exponent for normal sectors
  normalDmgExponent: 1.00, // DMG multiplier exponent for normal sectors
  bossHpExponent: 1.15,    // HP multiplier exponent for boss sectors
  bossDmgExponent: 0.90,   // DMG multiplier exponent for boss sectors
  
  // Tier bumps
  shopTierMultiplier: 1.10, // Multiplier applied after each shop tier (every 4 levels)
  bossHpMultiplier: [1.6, 2.2] as [number, number],  // Boss HP multiplier range
  bossDmgMultiplier: [1.25, 1.6] as [number, number], // Boss DMG multiplier range
  
  // Smoothing
  smoothingAlpha: 0.3,     // EMA smoothing factor (0-1, higher = more responsive)
  smoothingWindow: 5,      // Number of levels to track for smoothing
  
  // Safety clamps
  minScaling: 0.5,         // Minimum scaling multiplier (never make easier than 50%)
  maxScaling: 3.0,         // Maximum scaling multiplier (prevent extreme spikes)
  
  // Player power calculation
  baseAttackRate: 2.0,     // Base attacks per second (movement-based)
  defenseEhpFactor: 100,   // Factor for converting flat defense to EHP multiplier
};

/**
 * Player power metrics calculated from stats and loadout.
 */
export interface PlayerPowerMetrics {
  dps: number;      // Estimated DPS (damage per second)
  ehp: number;      // Effective HP (HP adjusted by defense)
  power: number;    // Power index: sqrt(dps * ehp)
}

/**
 * Parameters for calculating scaling multipliers.
 */
export interface ScalingParams {
  level: number;
  sectorType: 'normal' | 'boss' | 'shop';
  mobArchetype?: string;
  playerPower?: PlayerPowerMetrics;
  useAdaptive?: boolean;
}

/**
 * Result of scaling calculation.
 */
export interface ScalingResult {
  hpMultiplier: number;
  dmgMultiplier: number;
}

/**
 * Mob archetype constants for HP and damage scaling.
 * These allow fine-tuning of different mob types.
 */
const ARCHETYPE_CONSTANTS: Record<string, { hp: number; dmg: number }> = {
  // Trash mobs - baseline
  'drone': { hp: 1.0, dmg: 1.0 },
  'swarm': { hp: 1.0, dmg: 1.0 },
  
  // Ranged mobs - lower HP, higher damage
  'sniper': { hp: 0.8, dmg: 1.2 },
  'turret': { hp: 0.8, dmg: 1.2 },
  'moth': { hp: 0.8, dmg: 1.2 },
  
  // Elite mobs - higher HP, slightly higher damage
  'charger': { hp: 1.2, dmg: 1.1 },
  'guardian': { hp: 1.2, dmg: 1.1 },
  'tracker': { hp: 1.2, dmg: 1.1 },
  'cerberus': { hp: 1.2, dmg: 1.1 },
  
  // Phase mobs - balanced
  'phase': { hp: 1.0, dmg: 1.0 },
  
  // Boss mobs - use boss-specific multipliers
  'boss': { hp: 1.0, dmg: 1.0 },
};

// Calculate initial power from INITIAL_STATS
function calculateInitialPower(): number {
  const stats = INITIAL_STATS;
  // DPS = damage * speed * attackRate
  const dps = stats.damage * stats.speed * SCALING_CONFIG.baseAttackRate;
  // EHP = maxHp (no defense at start)
  const ehp = stats.maxHp;
  // Power = sqrt(dps * ehp)
  return Math.sqrt(dps * ehp);
}

// Initialize initialPower in config
SCALING_CONFIG.initialPower = calculateInitialPower();

// Track smoothed power across levels for EMA
let smoothedPowerHistory: number[] = [];
let lastSmoothedPower: number = SCALING_CONFIG.initialPower;

/**
 * Calculate player power metrics from stats and loadout.
 * 
 * DPS Calculation:
 * - Player attacks on movement (instant, no cooldown)
 * - DPS = damage * movementSpeed * attackRate
 * - Movement speed affects how often player can attack
 * 
 * EHP Calculation:
 * - EHP = maxHp * (1 + defense / defenseEhpFactor)
 * - Defense is flat reduction, converted to percentage-based EHP multiplier
 * 
 * @param stats Base player stats
 * @param loadout Equipped items
 * @returns Player power metrics
 */
export function calculatePlayerPower(
  stats: PlayerStats,
  loadout: GameState['loadout']
): PlayerPowerMetrics {
  // Get effective stats (includes item bonuses)
  const effectiveStats = getEffectiveStats(stats, loadout);
  const defense = getTotalDefense(loadout);
  
  // Calculate DPS: damage * speed * attack rate
  // Player attacks on movement, so speed directly affects attack frequency
  const dps = effectiveStats.damage * effectiveStats.speed * SCALING_CONFIG.baseAttackRate;
  
  // Calculate EHP: maxHp adjusted by defense
  // Defense is flat reduction, convert to EHP multiplier
  // Formula: EHP = maxHp * (1 + defense / factor)
  // This means 100 defense = 2x EHP, 200 defense = 3x EHP, etc.
  const ehp = effectiveStats.maxHp * (1 + defense / SCALING_CONFIG.defenseEhpFactor);
  
  // Power index: geometric mean of DPS and EHP
  // This balances offensive and defensive power
  const power = Math.sqrt(dps * ehp);
  
  return { dps, ehp, power };
}

/**
 * Apply exponential moving average smoothing to player power.
 * This prevents wild swings in difficulty between levels.
 * 
 * @param currentPower Current calculated power
 * @returns Smoothed power value
 */
function smoothPlayerPower(currentPower: number): number {
  const alpha = SCALING_CONFIG.smoothingAlpha;
  const smoothed = alpha * currentPower + (1 - alpha) * lastSmoothedPower;
  lastSmoothedPower = smoothed;
  
  // Track history for debugging/analysis
  smoothedPowerHistory.push(smoothed);
  if (smoothedPowerHistory.length > SCALING_CONFIG.smoothingWindow) {
    smoothedPowerHistory.shift();
  }
  
  return smoothed;
}

/**
 * Calculate expected baseline power for a given level.
 * Uses exponential growth: P_exp(L) = P0 * (1 + g)^L
 * 
 * @param level Current level
 * @returns Expected baseline power
 */
function calculateExpectedPower(level: number): number {
  const P0 = SCALING_CONFIG.initialPower;
  const g = SCALING_CONFIG.growthRate;
  return P0 * Math.pow(1 + g, level);
}

/**
 * Calculate base scaling multiplier for a level.
 * Uses adaptive scaling if player power is provided, otherwise fallback.
 * 
 * @param level Current level
 * @param playerPower Optional player power metrics
 * @param useAdaptive Whether to use adaptive scaling
 * @returns Base scaling multiplier
 */
function calculateBaseScaling(
  level: number,
  playerPower?: PlayerPowerMetrics,
  useAdaptive: boolean = false
): number {
  if (useAdaptive && playerPower) {
    // Adaptive scaling: S(L) = (1 + a*L + b*L^2) * (ratio^p)
    const a = SCALING_CONFIG.linearCoeff;
    const b = SCALING_CONFIG.quadraticCoeff;
    const p = SCALING_CONFIG.powerExponent;
    
    // Calculate expected power and ratio
    const expectedPower = calculateExpectedPower(level);
    const smoothedPower = smoothPlayerPower(playerPower.power);
    const ratio = smoothedPower / expectedPower;
    
    // Clamp ratio to prevent extreme adjustments
    const clampedRatio = Math.max(
      SCALING_CONFIG.ratioClamp[0],
      Math.min(SCALING_CONFIG.ratioClamp[1], ratio)
    );
    
    // Base scaling: (1 + a*L + b*L^2)
    const baseScaling = 1 + a * level + b * level * level;
    
    // Apply ratio adjustment: (ratio^p)
    const ratioAdjustment = Math.pow(clampedRatio, p);
    
    return baseScaling * ratioAdjustment;
  } else {
    // Fallback non-adaptive scaling: HP(L) = (1 + 0.10*L)^1.25
    // This provides consistent progression without player power assessment
    return Math.pow(1 + 0.10 * level, 1.25);
  }
}

/**
 * Calculate tier-based difficulty multiplier.
 * Applies shop tier bumps (every 4 levels) and boss multipliers (every 8 levels).
 * 
 * @param level Current level
 * @param sectorType Type of sector
 * @returns Tier multiplier
 */
function calculateTierMultiplier(level: number, sectorType: 'normal' | 'boss' | 'shop'): number {
  let multiplier = 1.0;
  
  // Shop tier bumps (every 4 levels, starting after level 4)
  const shopTiers = Math.floor((level - 1) / 4);
  if (shopTiers > 0) {
    multiplier *= Math.pow(SCALING_CONFIG.shopTierMultiplier, shopTiers);
  }
  
  // Boss multipliers (every 8 levels)
  if (sectorType === 'boss') {
    const bossTier = Math.floor(level / 8);
    if (bossTier > 0) {
      // Use average of boss multiplier range
      const avgBossHpMult = (SCALING_CONFIG.bossHpMultiplier[0] + SCALING_CONFIG.bossHpMultiplier[1]) / 2;
      const avgBossDmgMult = (SCALING_CONFIG.bossDmgMultiplier[0] + SCALING_CONFIG.bossDmgMultiplier[1]) / 2;
      // Apply boss multipliers (will be further adjusted in sector modifiers)
      multiplier *= Math.sqrt(avgBossHpMult * avgBossDmgMult);
    }
  }
  
  return multiplier;
}

/**
 * Get archetype constants for a mob type.
 * 
 * @param archetype Mob archetype/subtype
 * @returns HP and damage multipliers for the archetype
 */
function getArchetypeConstants(archetype?: string): { hp: number; dmg: number } {
  if (!archetype) {
    return { hp: 1.0, dmg: 1.0 };
  }
  return ARCHETYPE_CONSTANTS[archetype] || { hp: 1.0, dmg: 1.0 };
}

/**
 * Calculate scaling multipliers for mob HP and damage.
 * 
 * This is the main API function that combines all scaling factors:
 * 1. Base scaling (adaptive or fallback)
 * 2. Sector modifiers (normal vs boss)
 * 3. Tier bumps (shop tiers, boss multipliers)
 * 4. Archetype constants (mob-specific tuning)
 * 5. Safety clamps
 * 
 * @param params Scaling parameters
 * @returns HP and damage multipliers
 */
export function calculateScaling(params: ScalingParams): ScalingResult {
  const { level, sectorType, mobArchetype, playerPower, useAdaptive = false } = params;
  
  // Calculate base scaling
  const baseScaling = calculateBaseScaling(level, playerPower, useAdaptive);
  
  // Apply tier multipliers
  const tierMult = calculateTierMultiplier(level, sectorType);
  
  // Get archetype constants
  const archetype = getArchetypeConstants(mobArchetype);
  
  // Apply sector-specific modifiers
  let hpExponent: number;
  let dmgExponent: number;
  
  if (sectorType === 'boss') {
    hpExponent = SCALING_CONFIG.bossHpExponent;
    dmgExponent = SCALING_CONFIG.bossDmgExponent;
  } else if (sectorType === 'shop') {
    // Shop sectors use normal scaling (no special modifier)
    hpExponent = SCALING_CONFIG.normalHpExponent;
    dmgExponent = SCALING_CONFIG.normalDmgExponent;
  } else {
    // Normal sectors
    hpExponent = SCALING_CONFIG.normalHpExponent;
    dmgExponent = SCALING_CONFIG.normalDmgExponent;
  }
  
  // Calculate final multipliers
  // HP = baseScaling^hpExponent * tierMult * archetype.hp
  // DMG = baseScaling^dmgExponent * tierMult * archetype.dmg
  let hpMultiplier = Math.pow(baseScaling, hpExponent) * tierMult * archetype.hp;
  let dmgMultiplier = Math.pow(baseScaling, dmgExponent) * tierMult * archetype.dmg;
  
  // Apply boss-specific multipliers if this is a boss
  if (sectorType === 'boss' && mobArchetype === 'boss') {
    const bossTier = Math.floor(level / 8);
    if (bossTier > 0) {
      // Use tier-based boss multipliers (scaled by tier)
      const bossHpMult = SCALING_CONFIG.bossHpMultiplier[0] + 
        (SCALING_CONFIG.bossHpMultiplier[1] - SCALING_CONFIG.bossHpMultiplier[0]) * 
        Math.min(bossTier / 5, 1.0); // Scale up to tier 5, then cap
      const bossDmgMult = SCALING_CONFIG.bossDmgMultiplier[0] + 
        (SCALING_CONFIG.bossDmgMultiplier[1] - SCALING_CONFIG.bossDmgMultiplier[0]) * 
        Math.min(bossTier / 5, 1.0);
      
      hpMultiplier *= bossHpMult;
      dmgMultiplier *= bossDmgMult;
    }
  }
  
  // Apply safety clamps
  hpMultiplier = Math.max(
    SCALING_CONFIG.minScaling,
    Math.min(SCALING_CONFIG.maxScaling, hpMultiplier)
  );
  dmgMultiplier = Math.max(
    SCALING_CONFIG.minScaling,
    Math.min(SCALING_CONFIG.maxScaling, dmgMultiplier)
  );
  
  return { hpMultiplier, dmgMultiplier };
}

/**
 * Reset smoothing history (useful for testing or game resets).
 */
export function resetScalingState(): void {
  smoothedPowerHistory = [];
  lastSmoothedPower = SCALING_CONFIG.initialPower;
}

