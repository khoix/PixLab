/**
 * Test harness for dynamic difficulty scaling system.
 * 
 * This file can be run in development to verify scaling behavior
 * and print example scaling tables for different scenarios.
 * 
 * Usage: Import and call runScalingTests() in development mode.
 */

import { calculateScaling, calculatePlayerPower, resetScalingState, SCALING_CONFIG } from './scaling';
import { PlayerStats, GameState } from './types';
import { INITIAL_STATS } from './constants';

/**
 * Run scaling tests and print results to console.
 */
export function runScalingTests(): void {
  console.log('=== Dynamic Difficulty Scaling Test Harness ===\n');
  
  // Reset state
  resetScalingState();
  
  // Test scenarios
  const scenarios = [
    {
      name: 'Baseline Player (Expected Power)',
      stats: INITIAL_STATS,
      loadout: { weapon: null, armor: null, utility: null },
    },
    {
      name: 'Underpowered Player (50% Power)',
      stats: {
        ...INITIAL_STATS,
        damage: INITIAL_STATS.damage * 0.5,
        maxHp: INITIAL_STATS.maxHp * 0.5,
      },
      loadout: { weapon: null, armor: null, utility: null },
    },
    {
      name: 'Overpowered Player (200% Power)',
      stats: {
        ...INITIAL_STATS,
        damage: INITIAL_STATS.damage * 2,
        maxHp: INITIAL_STATS.maxHp * 2,
      },
      loadout: { weapon: null, armor: null, utility: null },
    },
    {
      name: 'High Damage Build',
      stats: {
        ...INITIAL_STATS,
        damage: INITIAL_STATS.damage * 3,
      },
      loadout: { weapon: null, armor: null, utility: null },
    },
    {
      name: 'Tank Build (High HP + Defense)',
      stats: {
        ...INITIAL_STATS,
        maxHp: INITIAL_STATS.maxHp * 2,
      },
      loadout: {
        weapon: null,
        armor: {
          id: 'test-armor',
          name: 'Test Armor',
          type: 'armor',
          rarity: 'epic',
          stats: { defense: 50 },
          price: 0,
          description: 'Test',
        },
        utility: null,
      },
    },
  ];
  
  // Test levels
  const testLevels = [1, 4, 8, 12, 16, 20, 24, 32, 40];
  
  // Test archetypes
  const archetypes = ['drone', 'sniper', 'charger', 'guardian', 'boss'];
  
  // Run tests for each scenario
  scenarios.forEach((scenario, scenarioIdx) => {
    console.log(`\n--- ${scenario.name} ---`);
    
    // Calculate player power
    const playerPower = calculatePlayerPower(scenario.stats, scenario.loadout);
    console.log(`Player Power: DPS=${playerPower.dps.toFixed(1)}, EHP=${playerPower.ehp.toFixed(1)}, Power=${playerPower.power.toFixed(1)}`);
    
    // Test different levels
    console.log('\nLevel | Sector | Archetype | HP Mult | DMG Mult');
    console.log('------|--------|-----------|---------|---------');
    
    testLevels.forEach(level => {
      // Test normal sector
      archetypes.forEach(archetype => {
        const scaling = calculateScaling({
          level,
          sectorType: level % 8 === 0 ? 'boss' : 'normal',
          mobArchetype: archetype,
          playerPower,
          useAdaptive: true,
        });
        
        const sectorType = level % 8 === 0 ? 'boss' : 'normal';
        console.log(
          `${level.toString().padStart(5)} | ${sectorType.padEnd(6)} | ${archetype.padEnd(9)} | ${scaling.hpMultiplier.toFixed(3).padStart(7)} | ${scaling.dmgMultiplier.toFixed(3).padStart(7)}`
        );
      });
    });
  });
  
  // Test fallback (non-adaptive) scaling
  console.log('\n\n--- Fallback (Non-Adaptive) Scaling ---');
  console.log('Level | Sector | Archetype | HP Mult | DMG Mult');
  console.log('------|--------|-----------|---------|---------');
  
  testLevels.forEach(level => {
    archetypes.forEach(archetype => {
      const scaling = calculateScaling({
        level,
        sectorType: level % 8 === 0 ? 'boss' : 'normal',
        mobArchetype: archetype,
        useAdaptive: false,
      });
      
      const sectorType = level % 8 === 0 ? 'boss' : 'normal';
      console.log(
        `${level.toString().padStart(5)} | ${sectorType.padEnd(6)} | ${archetype.padEnd(9)} | ${scaling.hpMultiplier.toFixed(3).padStart(7)} | ${scaling.dmgMultiplier.toFixed(3).padStart(7)}`
      );
    });
  });
  
  // Test tier bumps
  console.log('\n\n--- Tier Bump Analysis ---');
  console.log('Level | Shop Tier | Boss Tier | Tier Mult');
  console.log('------|-----------|-----------|-----------');
  
  testLevels.forEach(level => {
    const shopTiers = Math.floor((level - 1) / 4);
    const bossTier = Math.floor(level / 8);
    const tierMult = shopTiers > 0 ? Math.pow(SCALING_CONFIG.shopTierMultiplier, shopTiers) : 1.0;
    
    console.log(
      `${level.toString().padStart(5)} | ${shopTiers.toString().padStart(9)} | ${bossTier.toString().padStart(9)} | ${tierMult.toFixed(3).padStart(9)}`
    );
  });
  
  console.log('\n=== Test Complete ===');
}

/**
 * Example mob stat calculation for a specific scenario.
 */
export function calculateMobStats(
  level: number,
  baseHp: number,
  hpPerLevel: number,
  baseDamage: number,
  damagePerLevel: number,
  archetype: string,
  sectorType: 'normal' | 'boss' | 'shop',
  playerStats?: PlayerStats,
  loadout?: GameState['loadout']
): { hp: number; damage: number; scaling: { hpMultiplier: number; dmgMultiplier: number } } {
  const playerPower = playerStats && loadout ? calculatePlayerPower(playerStats, loadout) : undefined;
  
  const scaling = calculateScaling({
    level,
    sectorType,
    mobArchetype: archetype,
    playerPower,
    useAdaptive: !!(playerStats && loadout),
  });
  
  const baseHpCalc = baseHp + level * hpPerLevel;
  const baseDamageCalc = baseDamage + level * damagePerLevel;
  
  return {
    hp: Math.floor(baseHpCalc * scaling.hpMultiplier),
    damage: Math.floor(baseDamageCalc * scaling.dmgMultiplier),
    scaling,
  };
}

