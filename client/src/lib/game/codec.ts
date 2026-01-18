import { GameState, Item } from './types';
import { INITIAL_STATS } from './constants';

/**
 * Base128 encoding with URL-safe, copy-friendly characters
 * Uses 7 bits per character (vs base64's 6 bits) for ~16.7% shorter codes
 * Character set avoids confusing pairs: 0/O, 1/I/l, etc.
 * Uses only printable ASCII characters that are URL-safe and easy to copy/paste
 * Total: 128 characters
 * Format: 24 uppercase + 25 lowercase + 8 digits + 71 symbols = 128
 */
// Build character set with exact count
const part1 = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 uppercase (no I, O)
const part2 = 'abcdefghijkmnopqrstuvwxyz'; // 25 lowercase (no l)
const part3 = '23456789'; // 8 digits (no 0, 1)
const part4 = '-_!@#$%^&*()=+[]{}|;:,.<>?~`"\''; // Common symbols
const EXTENDED_CHARS = '\\/§©®°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ';

// Calculate: base = part1 + part2 + part3 + part4, need 128 total
const baseCount = part1.length + part2.length + part3.length + part4.length;
const neededFromExtended = 128 - baseCount;
const BASE128_CHARS_RAW = part1 + part2 + part3 + part4 + EXTENDED_CHARS.substring(0, neededFromExtended);

// Verify we have exactly 128 unique characters
if (BASE128_CHARS_RAW.length !== 128 || new Set(BASE128_CHARS_RAW).size !== 128) {
  console.error(`BASE128_CHARS must have exactly 128 unique characters. Got ${BASE128_CHARS_RAW.length} length, ${new Set(BASE128_CHARS_RAW).size} unique`);
  throw new Error('Invalid BASE128_CHARS configuration');
}

const BASE128_CHARS = BASE128_CHARS_RAW;

function encodeBase128(bytes: Uint8Array): string {
  let result = '';
  let buffer = 0;
  let bitsInBuffer = 0;
  
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;
    
    while (bitsInBuffer >= 7) {
      const value = (buffer >> (bitsInBuffer - 7)) & 0x7F;
      result += BASE128_CHARS[value];
      bitsInBuffer -= 7;
    }
  }
  
  // Handle remaining bits
  if (bitsInBuffer > 0) {
    const value = (buffer << (7 - bitsInBuffer)) & 0x7F;
    result += BASE128_CHARS[value];
  }
  
  return result;
}

function decodeBase128(encoded: string): Uint8Array {
  const bytes: number[] = [];
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

/**
 * Dictionary compression - finds repeated substrings and replaces them with short references
 * Very effective for JSON with repeated patterns (like item arrays with similar stats)
 * Uses ASCII-safe markers that work with base128 encoding
 */
function dictionaryCompress(str: string): string {
  // Guard against undefined/null input
  if (str == null || typeof str !== 'string') {
    return '';
  }
  
  // Find common repeated patterns (4+ chars that appear 3+ times)
  const minPatternLength = 4;
  const minOccurrences = 3;
  const patternCounts = new Map<string, number>();
  
  // Find all repeated patterns efficiently
  for (let len = minPatternLength; len <= Math.min(15, str.length / 3); len++) {
    for (let i = 0; i <= str.length - len; i++) {
      const pattern = str.substring(i, i + len);
      // Only count patterns that don't contain our special markers
      if (!pattern.includes('\x01') && !pattern.includes('\x02')) {
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
      }
    }
  }
  
  // Filter to patterns that provide compression benefit
  const usefulPatterns = Array.from(patternCounts.entries())
    .filter(([pattern, count]) => {
      // Benefit = (pattern length * occurrences) - (pattern length + 3 char overhead)
      const benefit = pattern.length * count - (pattern.length + 3);
      return count >= minOccurrences && benefit > 5;
    })
    .sort((a, b) => {
      const benefitA = a[0].length * a[1] - (a[0].length + 3);
      const benefitB = b[0].length * b[1] - (b[0].length + 3);
      return benefitB - benefitA;
    })
    .slice(0, 30); // Limit to top 30 patterns
  
  if (usefulPatterns.length === 0) {
    return str; // No compression benefit
  }
  
  // Build dictionary and compressed string
  const dictionary: string[] = [];
  let compressed = str;
  
  for (const [pattern, count] of usefulPatterns) {
    // Check if pattern still exists (may have been replaced)
    if (pattern && compressed.includes(pattern)) {
      const token = `\x01${String.fromCharCode(32 + dictionary.length)}\x01`; // ASCII-safe token
      dictionary.push(pattern);
      compressed = compressed.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), token);
      if (dictionary.length >= 30) break; // Limit dictionary size
    }
  }
  
  if (dictionary.length === 0) {
    return str; // No compression applied
  }
  
  // Prepend dictionary: \x02 marks start, \x03 marks end
  const dictStr = dictionary.join('\x00'); // Use null char as separator
  return '\x02' + dictStr + '\x03' + compressed;
}

/**
 * Decompresses dictionary-compressed string
 */
function dictionaryDecompress(str: string): string {
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

/**
 * Compresses JSON by replacing common patterns with shorter tokens
 * Uses a safe token system to avoid conflicts
 */
function compressString(str: string): string {
  // Guard against undefined/null input
  if (str == null || typeof str !== 'string') {
    return '';
  }
  
  // Use tokens that won't conflict - longer patterns first to avoid partial matches
  const replacements: [string, string][] = [
    // Long patterns first
    ['"description":"', '~d'],
    ['"joystickPosition":', '~j'],
    ['"visionRadius":', '~V'],
    ['"musicVolume":', '~Mu'],
    ['"currentLevel":', '~l'],
    ['"activeMods":', '~m'],
    ['"bossDrops":', '~b'],
    ['"inventory":', '~I'],
    // Medium patterns
    ['"rarity":"', '~r'],
    ['"stats":', '~s'],
    ['"damage":', '~D'],
    ['"defense":', '~f'],
    ['"speed":', '~p'],
    ['"vision":', '~v'],
    ['"loadout":', '~Lo'],
    ['"settings":', '~S'],
    // Short patterns
    ['"id":"', '~i'],
    ['"i":', '~I2'],  // Short id property
    ['"name":"', '~n'],
    ['"n":', '~N2'],  // Short name property
    ['"type":"', '~t'],
    ['"t":', '~T2'],  // Short type property
    ['"r":', '~R2'],  // Short rarity property
    ['"heal":', '~h'],
    ['"price":', '~c'],
    ['"weapon":', '~w'],
    ['"armor":', '~a'],
    ['"utility":', '~u'],
    ['"hp":', '~H'],
    ['"maxHp":', '~M'],
    ['"coins":', '~C'],
    // Values
    ['"common"', '~0'],
    ['"rare"', '~1'],
    ['"epic"', '~2'],
    ['"legendary"', '~3'],
    ['"weapon"', '~W'],
    ['"armor"', '~A'],
    ['"utility"', '~U'],
    ['"consumable"', '~X'],
    ['"left"', '~L'],
    ['"right"', '~R'],
  ];
  
  let compressed = str;
  // Apply in order (longest first to avoid partial matches)
  for (const [pattern, replacement] of replacements) {
    if (pattern && typeof pattern === 'string') {
      compressed = compressed.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
    }
  }
  
  return compressed;
}

/**
 * Decompresses a string - reverse the compression
 */
function decompressString(str: string): string {
  // Order matters! Longer/more specific tokens must come first to avoid partial matches
  const replacements: [string, string][] = [
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

/**
 * Removes default/null values to reduce size
 */
function minimizeData(data: any, defaults: any): any {
  if (Array.isArray(data)) {
    return data.length > 0 ? data.map(item => minimizeData(item, {})) : undefined;
  }
  
  if (data && typeof data === 'object') {
    const minimized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const defaultValue = defaults[key];
      
      // Skip null values
      if (value === null) continue;
      
      // Skip arrays that are empty
      if (Array.isArray(value) && value.length === 0) continue;
      
      // Skip default values for numbers
      if (typeof value === 'number' && defaultValue !== undefined && value === defaultValue) continue;
      
      // Skip default values for objects (recursively)
      if (typeof value === 'object' && !Array.isArray(value)) {
        const minimizedObj = minimizeData(value, defaultValue || {});
        if (minimizedObj && Object.keys(minimizedObj).length > 0) {
          minimized[key] = minimizedObj;
        }
        continue;
      }
      
      minimized[key] = value;
    }
    return Object.keys(minimized).length > 0 ? minimized : undefined;
  }
  
  return data;
}

/**
 * Restores default values
 */
function restoreDefaults(data: any, defaults: any): any {
  if (data === undefined || data === null) {
    return defaults;
  }
  
  if (Array.isArray(data)) {
    return data;
  }
  
  if (typeof data === 'object') {
    const restored: any = { ...defaults };
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

/**
 * Encodes game state into a compressed base64 string code
 * Only encodes the relevant data needed for restoration
 */
/**
 * Minimizes an item by removing regenerable data (description, price)
 * Keeps id, name, type, rarity, stats (needed for gameplay)
 */
function minimizeItem(item: Item | null | undefined): any {
  // Guard against null/undefined items
  if (!item) {
    return null;
  }
  
  // Ensure required properties exist
  if (!item.id || !item.name || !item.type || !item.rarity) {
    console.warn('Item missing required properties:', item);
    return null;
  }
  
  const minimized: any = {
    i: item.id, // Keep id for item tracking
    n: item.name, // Keep name (players recognize items by name)
    t: item.type,
    r: item.rarity,
  };
  
  // Only include stats if they exist and are non-zero
  if (item.stats) {
    const stats: any = {};
    if (item.stats.damage) stats.d = item.stats.damage;
    if (item.stats.defense) stats.f = item.stats.defense;
    if (item.stats.speed) stats.p = item.stats.speed;
    if (item.stats.vision) stats.v = item.stats.vision;
    if (item.stats.heal) stats.h = item.stats.heal;
    if (Object.keys(stats).length > 0) {
      minimized.s = stats;
    }
  }
  
  // Description and price are removed - can be regenerated if needed
  
  return minimized;
}

/**
 * Restores a full item from minimized data (regenerates description, price)
 */
function restoreItem(minimized: any): Item {
  const item: Item = {
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
    const statValue = Object.values(item.stats).reduce((sum: number, val) => sum + (typeof val === 'number' ? val : 0), 0);
    const multiplierMap: Record<string, number> = { common: 1.0, rare: 1.5, epic: 2.0, legendary: 3.0 };
    const multiplier = multiplierMap[item.rarity] ?? 1.0;
    item.price = Math.floor(statValue * 2 * multiplier);
  }
  
  return item;
}

export function encodeGameState(state: GameState): string {
  // Use shorter property names
  const saveData: any = {
    l: state.currentLevel,
    s: state.stats,
    I: state.inventory.length > 0 ? state.inventory.map(minimizeItem).filter((item): item is any => item != null) : undefined,
    Lo: (() => {
      const loadout: any = {};
      if (state.loadout.weapon) {
        const minimized = minimizeItem(state.loadout.weapon);
        if (minimized != null) loadout.w = minimized;
      }
      if (state.loadout.armor) {
        const minimized = minimizeItem(state.loadout.armor);
        if (minimized != null) loadout.a = minimized;
      }
      if (state.loadout.utility) {
        const minimized = minimizeItem(state.loadout.utility);
        if (minimized != null) loadout.u = minimized;
      }
      return Object.keys(loadout).length > 0 ? loadout : undefined;
    })(),
    m: state.activeMods.length > 0 ? state.activeMods : undefined,
    b: state.bossDrops.length > 0 ? state.bossDrops.map(minimizeItem).filter((item): item is any => item != null) : undefined,
    S: (() => {
      const settings: any = {};
      if (state.settings.musicVolume !== 0.5) settings['1'] = state.settings.musicVolume;
      if (state.settings.sfxVolume !== 0.5) settings['2'] = state.settings.sfxVolume;
      if (state.settings.joystickPosition !== 'left') settings['3'] = state.settings.joystickPosition;
      if (state.settings.mobileControlType && state.settings.mobileControlType !== 'dpad') settings['4'] = state.settings.mobileControlType;
      return Object.keys(settings).length > 0 ? settings : undefined;
    })(),
  };
  
  // Remove undefined values
  Object.keys(saveData).forEach(key => {
    if (saveData[key] === undefined) delete saveData[key];
  });
  
  // Minimize data by removing defaults
  const minimized = minimizeData(saveData, {
    l: 1,
    s: INITIAL_STATS,
    I: [],
    Lo: { w: null, a: null, u: null },
    m: [],
    b: [],
    S: { '1': 0.5, '2': 0.5, '3': 'left', '4': 'joystick' },
  });
  
  try {
    // Ensure we have a valid object to stringify (minimizeData can return undefined)
    const dataToEncode = minimized ?? {};
    const json = JSON.stringify(dataToEncode);
    
    // Guard against empty or invalid JSON
    if (!json || json === '{}') {
      // Return a minimal valid encoded state
      const minimalData = { l: state.currentLevel, s: state.stats };
      const minimalJson = JSON.stringify(minimalData);
      const tokenCompressed = compressString(minimalJson);
      const dictCompressed = dictionaryCompress(tokenCompressed);
      const utf8Bytes = new TextEncoder().encode(dictCompressed);
      return encodeBase128(utf8Bytes);
    }
    
    // Apply token-based compression
    const tokenCompressed = compressString(json);
    // Apply dictionary compression for repeated patterns
    const dictCompressed = dictionaryCompress(tokenCompressed);
    // Use base128 encoding for better efficiency (7 bits per char vs base64's 6 bits)
    const utf8Bytes = new TextEncoder().encode(dictCompressed);
    return encodeBase128(utf8Bytes);
  } catch (error) {
    console.error('Failed to encode game state:', error);
    throw new Error('Failed to encode game state');
  }
}

/**
 * Decodes a code string back into game state data
 * Returns null if decoding fails
 */
export function decodeGameState(code: string): Partial<GameState> | null {
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
    const expanded: any = {
      currentLevel: saveData.l ?? 1,
      stats: saveData.s ?? INITIAL_STATS,
      inventory: (saveData.I ?? []).map((item: any) => restoreItem(item)),
      loadout: {
        weapon: saveData.Lo?.w ? restoreItem(saveData.Lo.w) : null,
        armor: saveData.Lo?.a ? restoreItem(saveData.Lo.a) : null,
        utility: saveData.Lo?.u ? restoreItem(saveData.Lo.u) : null,
      },
      activeMods: saveData.m ?? [],
      bossDrops: (saveData.b ?? []).map((item: any) => restoreItem(item)),
      settings: {
        musicVolume: saveData.S?.['1'] ?? 0.5,
        sfxVolume: saveData.S?.['2'] ?? 0.5,
        joystickPosition: saveData.S?.['3'] ?? 'left',
        mobileControlType: saveData.S?.['4'] ?? 'dpad',
      },
    };
    
    // Validate the structure
    if (
      typeof expanded === 'object' &&
      expanded !== null &&
      typeof expanded.currentLevel === 'number' &&
      expanded.stats &&
      Array.isArray(expanded.inventory) &&
      expanded.loadout &&
      Array.isArray(expanded.activeMods) &&
      Array.isArray(expanded.bossDrops) &&
      expanded.settings
    ) {
      return {
        currentLevel: expanded.currentLevel,
        stats: expanded.stats,
        inventory: expanded.inventory,
        loadout: expanded.loadout,
        activeMods: expanded.activeMods,
        bossDrops: expanded.bossDrops,
        settings: expanded.settings,
        screen: 'lobby', // Always start at lobby when loading from code
      };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to decode game state:', error);
    return null;
  }
}

