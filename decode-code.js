#!/usr/bin/env node
/**
 * Quick Code Decoder for PixLab Game
 * 
 * Usage:
 *   node decode-code.js <code>
 *   OR
 *   In browser console: decodeCode('<code>')
 */

// Base128 character set (must match codec.ts exactly)
const part1 = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 uppercase (no I, O)
const part2 = 'abcdefghijkmnopqrstuvwxyz'; // 25 lowercase (no l)
const part3 = '23456789'; // 8 digits (no 0, 1)
const part4 = '-_!@#$%^&*()=+[]{}|;:,.<>?~`"\''; // Common symbols
const EXTENDED_CHARS = '\\/§©®°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ';

const baseCount = part1.length + part2.length + part3.length + part4.length;
const neededFromExtended = 128 - baseCount;
const BASE128_CHARS = part1 + part2 + part3 + part4 + EXTENDED_CHARS.substring(0, neededFromExtended);

// Initial stats defaults
const INITIAL_STATS = {
  hp: 100,
  maxHp: 100,
  coins: 0,
  damage: 10,
  speed: 1,
  visionRadius: 3.5,
};

function decodeBase128(encoded) {
  const bytes = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  
  for (const char of encoded) {
    const value = BASE128_CHARS.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base128 character: ${char}`);
    }
    
    buffer = (buffer << 7) | value;
    bitsInBuffer += 7;
    
    while (bitsInBuffer >= 8) {
      bytes.push((buffer >> (bitsInBuffer - 8)) & 0xFF);
      bitsInBuffer -= 8;
    }
  }
  
  return new Uint8Array(bytes);
}

function dictionaryDecompress(str) {
  if (!str.startsWith('\x02')) {
    return str; // Not compressed
  }
  
  const dictEnd = str.indexOf('\x03');
  if (dictEnd === -1) {
    return str; // Invalid format
  }
  
  const dictStr = str.substring(1, dictEnd);
  const dictionary = dictStr.split('\x00');
  let decompressed = str.substring(dictEnd + 1);
  
  // Replace tokens with dictionary entries (in reverse order to avoid conflicts)
  for (let i = dictionary.length - 1; i >= 0; i--) {
    const token = `\x01${String.fromCharCode(32 + i)}\x01`;
    decompressed = decompressed.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), dictionary[i]);
  }
  
  return decompressed;
}

function decompressString(str) {
  // Order matters! Longer/more specific tokens must come first to avoid partial matches
  const replacements = [
    // Long/specific tokens first
    ['~I2', '"i":'],  // Must come before ~I
    ['~N2', '"n":'],  // Must come before ~n
    ['~T2', '"t":'],  // Must come before ~t
    ['~R2', '"r":'],  // Must come before ~r
    ['~Mu', '"musicVolume":'],  // Must come before ~M
    ['~Lo', '"loadout":'],  // Must come before ~L
    // Then shorter tokens
    ['~d', '"description":"'],
    ['~j', '"joystickPosition":'],
    ['~V', '"visionRadius":'],
    ['~l', '"currentLevel":'],
    ['~m', '"activeMods":'],
    ['~b', '"bossDrops":'],
    ['~I', '"inventory":'],
    ['~r', '"rarity":"'],
    ['~s', '"stats":'],
    ['~D', '"damage":'],
    ['~f', '"defense":'],
    ['~p', '"speed":'],
    ['~v', '"vision":'],
    ['~S', '"settings":'],
    ['~i', '"id":"'],
    ['~n', '"name":"'],
    ['~t', '"type":"'],
    ['~h', '"heal":'],
    ['~c', '"price":'],
    ['~w', '"weapon":'],
    ['~a', '"armor":'],
    ['~u', '"utility":'],
    ['~H', '"hp":'],
    ['~M', '"maxHp":'],
    ['~C', '"coins":'],
    ['~0', '"common"'],
    ['~1', '"rare"'],
    ['~2', '"epic"'],
    ['~3', '"legendary"'],
    ['~W', '"weapon"'],
    ['~A', '"armor"'],
    ['~U', '"utility"'],
    ['~X', '"consumable"'],
    ['~L', '"left"'],
    ['~R', '"right"'],
  ];
  
  let decompressed = str;
  // Apply replacements in order
  for (const [token, pattern] of replacements) {
    decompressed = decompressed.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), pattern);
  }
  
  return decompressed;
}

function restoreDefaults(data, defaults) {
  if (data === undefined || data === null) {
    return defaults;
  }
  
  if (Array.isArray(data)) {
    return data;
  }
  
  if (typeof data === 'object') {
    const restored = { ...defaults };
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && !Array.isArray(value) && defaults[key]) {
        restored[key] = restoreDefaults(value, defaults[key]);
      } else {
        restored[key] = value;
      }
    }
    return restored;
  }
  
  return data;
}

function restoreItem(minimized) {
  const item = {
    id: minimized.i,
    name: minimized.n,
    type: minimized.t,
    rarity: minimized.r,
    stats: minimized.s ? {
      damage: minimized.s.d,
      defense: minimized.s.f,
      speed: minimized.s.p,
      vision: minimized.s.v,
      heal: minimized.s.h,
    } : undefined,
    price: 0, // Will be recalculated when needed (not stored)
    description: '', // Not needed for gameplay (can be regenerated from template if needed)
  };
  
  // Recalculate price from stats if needed
  if (item.stats) {
    const statValue = Object.values(item.stats).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
    const multiplierMap = { common: 1.0, rare: 1.5, epic: 2.0, legendary: 3.0 };
    const multiplier = multiplierMap[item.rarity] ?? 1.0;
    item.price = Math.floor(statValue * 2 * multiplier);
  }
  
  return item;
}

/**
 * Decodes a game code string back into game state data
 * @param {string} code - The encoded game code
 * @returns {object|null} - Decoded game state or null if decoding fails
 */
function decodeCode(code) {
  try {
    // Decode base128 to UTF-8 bytes, then to string
    const utf8Bytes = decodeBase128(code);
    const baseDecoded = new TextDecoder().decode(utf8Bytes);
    // Decompress dictionary compression
    const dictDecompressed = dictionaryDecompress(baseDecoded);
    // Decompress token-based compression
    const json = decompressString(dictDecompressed);
    const minimized = JSON.parse(json);
    
    // Restore defaults and expand short property names
    const saveData = restoreDefaults(minimized, {
      l: 1,
      s: INITIAL_STATS,
      I: [],
      Lo: { w: null, a: null, u: null },
      m: [],
      b: [],
      S: { '1': 0.5, '2': 0.5, '3': 'left', '4': 'dpad' },
    });
    
    // Expand short property names to full names and restore items
    const expanded = {
      currentLevel: saveData.l ?? 1,
      stats: saveData.s ?? INITIAL_STATS,
      inventory: (saveData.I ?? []).map((item) => restoreItem(item)),
      loadout: {
        weapon: saveData.Lo?.w ? restoreItem(saveData.Lo.w) : null,
        armor: saveData.Lo?.a ? restoreItem(saveData.Lo.a) : null,
        utility: saveData.Lo?.u ? restoreItem(saveData.Lo.u) : null,
      },
      activeMods: saveData.m ?? [],
      bossDrops: (saveData.b ?? []).map((item) => restoreItem(item)),
      settings: {
        musicVolume: saveData.S?.['1'] ?? 0.5,
        sfxVolume: saveData.S?.['2'] ?? 0.5,
        joystickPosition: saveData.S?.['3'] ?? 'left',
        mobileControlType: saveData.S?.['4'] ?? 'dpad',
      },
    };
    
    return expanded;
  } catch (error) {
    console.error('Failed to decode code:', error);
    return null;
  }
}

/**
 * Pretty prints the decoded game state
 */
function printDecodedState(state) {
  if (!state) {
    console.log('❌ Failed to decode code');
    return;
  }
  
  console.log('\n📊 Decoded Game State:\n');
  console.log(`Level: ${state.currentLevel}`);
  console.log(`\nStats:`);
  console.log(`  HP: ${state.stats.hp}/${state.stats.maxHp}`);
  console.log(`  Coins: ${state.stats.coins}`);
  console.log(`  Damage: ${state.stats.damage}`);
  console.log(`  Speed: ${state.stats.speed}`);
  console.log(`  Vision Radius: ${state.stats.visionRadius}`);
  
  if (state.inventory && state.inventory.length > 0) {
    console.log(`\nInventory (${state.inventory.length} items):`);
    state.inventory.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name} [${item.rarity}] (${item.type})`);
      if (item.stats) {
        const stats = [];
        if (item.stats.damage) stats.push(`DMG:${item.stats.damage}`);
        if (item.stats.defense) stats.push(`DEF:${item.stats.defense}`);
        if (item.stats.speed) stats.push(`SPD:${item.stats.speed}`);
        if (item.stats.vision) stats.push(`VIS:${item.stats.vision}`);
        if (item.stats.heal) stats.push(`HEAL:${item.stats.heal}`);
        if (stats.length > 0) console.log(`     ${stats.join(', ')}`);
      }
    });
  }
  
  if (state.loadout) {
    console.log(`\nLoadout:`);
    if (state.loadout.weapon) {
      console.log(`  Weapon: ${state.loadout.weapon.name} [${state.loadout.weapon.rarity}]`);
    }
    if (state.loadout.armor) {
      console.log(`  Armor: ${state.loadout.armor.name} [${state.loadout.armor.rarity}]`);
    }
    if (state.loadout.utility) {
      console.log(`  Utility: ${state.loadout.utility.name} [${state.loadout.utility.rarity}]`);
    }
  }
  
  if (state.activeMods && state.activeMods.length > 0) {
    console.log(`\nActive Mods: ${state.activeMods.join(', ')}`);
  }
  
  if (state.bossDrops && state.bossDrops.length > 0) {
    console.log(`\nBoss Drops (${state.bossDrops.length} items):`);
    state.bossDrops.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name} [${item.rarity}]`);
    });
  }
  
  console.log(`\nSettings:`);
  console.log(`  Music Volume: ${state.settings.musicVolume}`);
  console.log(`  SFX Volume: ${state.settings.sfxVolume}`);
  console.log(`  Joystick Position: ${state.settings.joystickPosition}`);
  console.log(`  Mobile Control: ${state.settings.mobileControlType}`);
  
  console.log('\n📋 Full JSON:');
  console.log(JSON.stringify(state, null, 2));
}

// Main execution
if (typeof require !== 'undefined' && require.main === module) {
  // Running in Node.js
  const code = process.argv[2];
  
  if (!code) {
    console.log('Usage: node decode-code.js <code>');
    console.log('Example: node decode-code.js ABC123...');
    process.exit(1);
  }
  
  const decoded = decodeCode(code);
  printDecodedState(decoded);
} else if (typeof window !== 'undefined') {
  // Running in browser - expose functions globally
  window.decodeCode = decodeCode;
  window.printDecodedState = printDecodedState;
  console.log('✅ Decoder loaded! Use decodeCode("<code>") or printDecodedState(decodeCode("<code>"))');
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decodeCode, printDecodedState };
}
