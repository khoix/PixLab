import { PlayerStats, GameState } from './types';
import { INITIAL_STATS } from './constants';
import { getEffectiveStats, getTotalDefense } from './stats';
import { 
  getOfferPowerMetrics, 
  ECONOMY_CONFIG,
  logOfferMetrics
} from './itemEconomy';

/**
 * Configuration for the dynamic difficulty scaling system.
 * All values are tunable for balance adjustments.
 */
export const SCALING_CONFIG = {
  // Baseline curve: P_exp(L) = P0 * (1 + g)^L
  growthRate: 0.05,        // g - expected power growth per level
  initialPower: 0,         // P0 - will be calculated from INITIAL_STATS
  
  // Adaptive scaling: S(L) = (1 + a*L + b*L^2 + c*shopTiers) * (ratio^p)
  //
  // The shop-tier bump used to multiply the curve as 1.15^(L/4) — an exponential
  // on top of a quadratic, 8.1x on its own by sector 48. Three growth terms
  // multiplying meant the raw value ran ~9x past the safety clamp, so the clamp
  // stopped being a safety net and became the curve: every multiplier pinned at
  // 3.0 from sector 11 and never moved again. Adaptive scaling stopped adapting
  // for two-thirds of a run, and the archetype constants — applied before the
  // clamp — stopped separating anything past sector 12.
  //
  // The bump is now a term inside the base curve rather than a factor on it, and
  // the coefficients are chosen so the raw value lands near the cap at sector 48
  // instead of far beyond it. See docs/BALANCE_ANALYSIS.md for the fitted table.
  linearCoeff: 0.03,       // a - linear scaling coefficient
  quadraticCoeff: 0.0011,  // b - quadratic scaling coefficient
  shopTierCoeff: 0.12,     // c - added per shop tier (every 4 levels)
  powerExponent: 0.35,      // p - power exponent for ratio adjustment
  ratioClamp: [0.8, 1.25] as [number, number], // Clamp for player power ratio
  
  // Sector modifiers. HP carries late-game difficulty; the damage exponent is
  // deliberately flat, so per-hit growth comes from each mob's `damagePerLevel`
  // and stays near the M6.4a per-hit cap rather than far above it.
  normalHpExponent: 1.15,  // HP multiplier exponent for normal sectors
  normalDmgExponent: 0.15, // DMG multiplier exponent for normal sectors
  bossHpExponent: 0.75,    // HP multiplier exponent for boss sectors
  bossDmgExponent: 0.90,   // DMG multiplier exponent for boss sectors
  
  // Tier bumps
  bossHpMultiplier: [1.6, 2.2] as [number, number],  // Boss HP multiplier range
  bossDmgMultiplier: [1.25, 1.6] as [number, number], // Boss DMG multiplier range
  
  // Smoothing
  smoothingAlpha: 0.3,     // EMA smoothing factor (0-1, higher = more responsive)
  smoothingWindow: 5,      // Number of levels to track for smoothing
  
  // Safety clamps. Split, because one shared ceiling forced HP and damage to
  // stop growing at the same sector — and they should not grow alike at all.
  // These are genuine safety valves now: normal HP peaks near 10 and damage near
  // 1.6 under the fitted curve, so neither should reach its cap in normal play.
  minScaling: 0.5,         // Minimum scaling multiplier (never make easier than 50%)
  maxHpScaling: 14.0,      // Ceiling for normal-sector HP
  maxDmgScaling: 4.0,      // Ceiling for damage, normal and boss
  // Bosses keep a tighter HP ceiling until M6.5 reworks their encounters:
  // it holds them near their current values rather than letting the unpinned
  // curve double them before their mechanics are readable.
  maxBossHpScaling: 3.5,
  
  // Player power calculation
  baseAttackRate: 2.0,     // Base attacks per second (decoupled from movement speed in M6)
  defenseEhpFactor: 150,   // Factor for converting flat defense to EHP multiplier (increased to make defense less powerful)
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
  loadout?: GameState['loadout'];      // For economy index
  useEconomyIndex?: boolean;           // Enable availability-aware economy
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
  // Trash mobs - baseline. The drone carries a damage penalty so the starter
  // mob stops out-damaging the elites introduced 20+ sectors later.
  'drone': { hp: 1.0, dmg: 0.8 },
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
  // DPS = damage * attackRate (speed affects movement only)
  const dps = stats.damage * SCALING_CONFIG.baseAttackRate;
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
  
  // Calculate DPS: damage * attack rate (movement speed no longer scales DPS — M6)
  const dps = effectiveStats.damage * SCALING_CONFIG.baseAttackRate;
  
  // Calculate EHP: maxHp adjusted by defense
  // Defense is flat reduction, convert to EHP multiplier
  // Formula: EHP = maxHp * (1 + defense / factor)
  // With factor=150: 150 defense = 2x EHP, 300 defense = 3x EHP, etc.
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

/** Shop tiers cleared by this level — one every 4 levels, from level 5. */
export function shopTiersAt(level: number): number {
  return Math.max(0, Math.floor((level - 1) / 4));
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
    
    // Base scaling: (1 + a*L + b*L^2 + c*shopTiers)
    const baseScaling =
      1 + a * level + b * level * level + SCALING_CONFIG.shopTierCoeff * shopTiersAt(level);
    
    // Apply ratio adjustment: (ratio^p)
    const ratioAdjustment = Math.pow(clampedRatio, p);
    
    return baseScaling * ratioAdjustment;
  } else {
    // Fallback non-adaptive scaling: the same curve without the ratio term, so
    // turning adaptive off changes how difficulty *responds*, not its shape.
    return (
      1 +
      SCALING_CONFIG.linearCoeff * level +
      SCALING_CONFIG.quadraticCoeff * level * level +
      SCALING_CONFIG.shopTierCoeff * shopTiersAt(level)
    );
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
  // Shop tiers now enter through `shopTierCoeff` inside the base curve, so there
  // is no separate exponential factor here. Kept as a seam: boss multipliers are
  // still applied in calculateScaling(), and a future per-sector-type bump has an
  // obvious home.
  return 1.0;
}

/**
 * Get archetype constants for a mob type.
 * 
 * @param archetype Mob archetype/subtype
 * @returns HP and damage multipliers for the archetype
 */
export function getArchetypeConstants(archetype?: string): { hp: number; dmg: number } {
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
  const { 
    level, 
    sectorType, 
    mobArchetype, 
    playerPower, 
    useAdaptive = false,
    loadout,
    useEconomyIndex = false
  } = params;
  
  // Calculate base scaling
  let baseScaling = calculateBaseScaling(level, playerPower, useAdaptive);
  
  // Apply availability-aware economy index if enabled
  if (useEconomyIndex && loadout) {
    const metrics = getOfferPowerMetrics(level, loadout);
    const economyRatio = metrics.economyRatio;
    
    // Apply economy ratio as mild exponent term
    const economyAdjustment = Math.pow(
      economyRatio, 
      ECONOMY_CONFIG.economyExponent
    );
    baseScaling *= economyAdjustment;
    
    // Log comprehensive metrics for tuning (only in development)
    if (process.env.NODE_ENV === 'development') {
      logOfferMetrics(metrics);
      console.log(`[EconomyIndex] Level ${level}: ratio=${economyRatio.toFixed(3)}, adjustment=${economyAdjustment.toFixed(3)}, baseScaling=${baseScaling.toFixed(3)}`);
    }
  }
  
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
  // Boss multipliers scale with tier (every 8 levels) and are applied only once here
  if (sectorType === 'boss' && mobArchetype === 'boss') {
    const bossTier = Math.floor(level / 8);
    if (bossTier > 0) {
      // Use tier-based boss multipliers (scaled by tier, capped at tier 5)
      // Interpolate between min and max based on tier progression
      const tierProgress = Math.min(bossTier / 5, 1.0); // Scale up to tier 5, then cap
      const bossHpMult = SCALING_CONFIG.bossHpMultiplier[0] + 
        (SCALING_CONFIG.bossHpMultiplier[1] - SCALING_CONFIG.bossHpMultiplier[0]) * tierProgress;
      const bossDmgMult = SCALING_CONFIG.bossDmgMultiplier[0] + 
        (SCALING_CONFIG.bossDmgMultiplier[1] - SCALING_CONFIG.bossDmgMultiplier[0]) * tierProgress;
      
      hpMultiplier *= bossHpMult;
      dmgMultiplier *= bossDmgMult;
    }
  }
  
  // Apply safety clamps. HP and damage no longer share a ceiling, and bosses
  // keep a tighter HP ceiling of their own until M6.5.
  const hpCeiling =
    sectorType === 'boss' ? SCALING_CONFIG.maxBossHpScaling : SCALING_CONFIG.maxHpScaling;
  hpMultiplier = Math.max(SCALING_CONFIG.minScaling, Math.min(hpCeiling, hpMultiplier));
  dmgMultiplier = Math.max(
    SCALING_CONFIG.minScaling,
    Math.min(SCALING_CONFIG.maxDmgScaling, dmgMultiplier)
  );
  
  return { hpMultiplier, dmgMultiplier };
}

/**
 * Multipliers for an explicit player-power ratio, skipping the EMA smoothing.
 *
 * `calculateScaling` derives the ratio from a smoothed power history, which is
 * right in a run and useless for asking "does a strong build actually face
 * different mobs than a weak one at sector 32?". This answers that directly.
 */
export function multipliersAtRatio(
  level: number,
  ratio: number,
  sectorType: 'normal' | 'boss' | 'shop' = 'normal',
  mobArchetype = 'drone',
): ScalingResult {
  const clampedRatio = Math.max(
    SCALING_CONFIG.ratioClamp[0],
    Math.min(SCALING_CONFIG.ratioClamp[1], ratio),
  );
  const baseScaling =
    (1 +
      SCALING_CONFIG.linearCoeff * level +
      SCALING_CONFIG.quadraticCoeff * level * level +
      SCALING_CONFIG.shopTierCoeff * shopTiersAt(level)) *
    Math.pow(clampedRatio, SCALING_CONFIG.powerExponent);

  const archetype = getArchetypeConstants(mobArchetype);
  const isBossSector = sectorType === 'boss';
  const hpExponent = isBossSector ? SCALING_CONFIG.bossHpExponent : SCALING_CONFIG.normalHpExponent;
  const dmgExponent = isBossSector ? SCALING_CONFIG.bossDmgExponent : SCALING_CONFIG.normalDmgExponent;

  let hpMultiplier = Math.pow(baseScaling, hpExponent) * archetype.hp;
  let dmgMultiplier = Math.pow(baseScaling, dmgExponent) * archetype.dmg;

  const hpCeiling = isBossSector ? SCALING_CONFIG.maxBossHpScaling : SCALING_CONFIG.maxHpScaling;
  hpMultiplier = Math.max(SCALING_CONFIG.minScaling, Math.min(hpCeiling, hpMultiplier));
  dmgMultiplier = Math.max(
    SCALING_CONFIG.minScaling,
    Math.min(SCALING_CONFIG.maxDmgScaling, dmgMultiplier),
  );

  return { hpMultiplier, dmgMultiplier };
}

export function initScalingApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_SCALING__ = {
    multipliersAtRatio,
    shopTiersAt,
    config: SCALING_CONFIG,
  };
}

declare global {
  interface Window {
    __PIXLAB_SCALING__?: {
      multipliersAtRatio: typeof multipliersAtRatio;
      shopTiersAt: typeof shopTiersAt;
      config: typeof SCALING_CONFIG;
    };
  }
}

/**
 * Reset smoothing history (useful for testing or game resets).
 */
export function resetScalingState(): void {
  smoothedPowerHistory = [];
  lastSmoothedPower = SCALING_CONFIG.initialPower;
}

