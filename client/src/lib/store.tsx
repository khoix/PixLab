import React, { createContext, useContext, useState, useRef } from 'react';
import { GameState, Item, PlayerStats } from './game/types';
import { INITIAL_STATS } from './game/constants';
import { calculateSellValue } from './game/items';
import { encodeGameState, decodeGameState } from './game/codec';
import { eventLogger } from './game/eventLogger';

const STORAGE_KEY = 'pixel_labyrinth_save';
const SAVE_DEBOUNCE_MS = 500; // Debounce localStorage writes by 500ms

// Helper function to clear vendor items for a specific level
const clearVendorItems = (level: number) => {
  try {
    const storageKey = `vendor_items_level_${level}`;
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Failed to clear vendor items from localStorage:', error);
  }
};

// Helper function to clear all vendor items (for game over/reset)
const clearAllVendorItems = () => {
  try {
    // Clear vendor items for all possible levels (reasonable range)
    for (let level = 1; level <= 100; level++) {
      const storageKey = `vendor_items_level_${level}`;
      localStorage.removeItem(storageKey);
    }
  } catch (error) {
    console.warn('Failed to clear all vendor items from localStorage:', error);
  }
};

// Helper function to format item names with initial caps
function formatItemName(itemName: string): string {
  if (!itemName) return itemName;
  
  // Item names are usually already properly formatted, but ensure first letter is capitalized
  // Handle cases like "sword lv5" -> "Sword Lv5", "scroll of fortune" -> "Scroll of Fortune"
  return itemName
    .split(' ')
    .map((word, index) => {
      // Capitalize first letter of each word
      // Preserve special patterns like "Lv5", "of", etc.
      if (word.toLowerCase() === 'of' || word.toLowerCase() === 'the') {
        return word.toLowerCase(); // Keep lowercase for articles/prepositions
      }
      if (word.match(/^Lv\d+$/i)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); // "Lv5" -> "Lv5"
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

interface GameContextType {
  state: GameState;
  dispatch: (action: GameAction) => void;
  resetGame: () => void;
  saveGame: () => void;
  loadFromCode: (code: string) => boolean;
  getCode: () => string;
}

export type GameAction = 
  | { type: 'SET_SCREEN'; payload: GameState['screen'] }
  | { type: 'UPDATE_STATS'; payload: Partial<PlayerStats> }
  | { type: 'ADD_ITEM'; payload: Item }
  | { type: 'EQUIP_ITEM'; payload: { slot: 'weapon' | 'armor' | 'utility'; item: Item } }
  | { type: 'UNEQUIP_ITEM'; payload: { slot: 'weapon' | 'armor' | 'utility' } }
  | { type: 'USE_CONSUMABLE'; payload: { itemId: string } }
  | { type: 'SELL_ITEM'; payload: { itemId: string } }
  | { type: 'NEXT_LEVEL' }
  | { type: 'SET_CURRENT_LEVEL'; payload: number }
  | { type: 'SET_MODS'; payload: string[] }
  | { type: 'LOAD_STATE'; payload: Partial<GameState> }
  | { type: 'ADD_BOSS_DROP'; payload: Item }
  | { type: 'CLEAR_BOSS_DROPS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<GameState['settings']> }
  | { type: 'UNLOCK_COMPENDIUM_CARD'; payload: import('./game/types').MobSubtype }
  | { type: 'CLEAR_PENDING_SCROLL_ACTION' };

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingStateRef = useRef<GameState | null>(null);

  // Debounced save function
  const debouncedSave = (stateToSave: GameState) => {
    pendingStateRef.current = stateToSave;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (pendingStateRef.current) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingStateRef.current));
          pendingStateRef.current = null;
        } catch (error) {
          console.warn('Failed to save game state to localStorage:', error);
        }
      }
    }, SAVE_DEBOUNCE_MS);
  };

  const [state, setState] = useState<GameState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate parsed data structure
        if (parsed && typeof parsed === 'object' && parsed.stats && parsed.currentLevel !== undefined) {
          // Ensure all required properties exist with defaults
          const stateWithCode: GameState = {
            uid: '',
            screen: parsed.screen || 'title',
            currentLevel: parsed.currentLevel ?? 1,
            stats: parsed.stats || { ...INITIAL_STATS },
            inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
            loadout: parsed.loadout || { weapon: null, armor: null, utility: null },
            activeMods: Array.isArray(parsed.activeMods) ? parsed.activeMods : [],
            bossDrops: Array.isArray(parsed.bossDrops) ? parsed.bossDrops : [],
            compendium: Array.isArray(parsed.compendium) ? parsed.compendium : [],
            activeScrollEffects: parsed.activeScrollEffects || { threatSense: false, lootSense: false, phasing: null },
            temporaryVisionBoost: parsed.temporaryVisionBoost || null,
            pendingScrollAction: parsed.pendingScrollAction || null,
            settings: {
              musicVolume: parsed.settings?.musicVolume ?? 0.5,
              sfxVolume: parsed.settings?.sfxVolume ?? 0.5,
              joystickPosition: parsed.settings?.joystickPosition ?? 'left',
              mobileControlType: parsed.settings?.mobileControlType ?? 'joystick',
            },
          };
          // Regenerate code from saved state to ensure it's up to date
          try {
            stateWithCode.uid = encodeGameState(stateWithCode);
          } catch (encodeError) {
            console.warn('Failed to encode saved state, using default:', encodeError);
            // Fall through to default state
          }
          if (stateWithCode.uid) {
            return stateWithCode;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load save data from localStorage:', error);
      // Fall through to default state
    }
    const defaultState: GameState = {
      uid: '', // Will be set after creation
      screen: 'title',
      currentLevel: 1,
      stats: { ...INITIAL_STATS },
      inventory: [],
      loadout: { weapon: null, armor: null, utility: null },
      activeMods: [],
      bossDrops: [],
      compendium: [],
      activeScrollEffects: { threatSense: false, lootSense: false, phasing: null },
      temporaryVisionBoost: null,
      pendingScrollAction: null,
      settings: { musicVolume: 0.5, sfxVolume: 0.5, joystickPosition: 'left', mobileControlType: 'joystick' },
    };
    // Generate code from the default state
    try {
      defaultState.uid = encodeGameState(defaultState);
    } catch (encodeError) {
      console.error('Failed to encode default state:', encodeError);
      // Use empty string as fallback
      defaultState.uid = '';
    }
    return defaultState;
  });

  const dispatch = (action: GameAction) => {
    setState((prev) => {
      let newState = { ...prev };
      switch (action.type) {
        case 'SET_SCREEN':
          newState.screen = action.payload;
          // Update code when screen changes
          newState.uid = encodeGameState(newState);
          // Save immediately on screen changes (important state transitions)
          debouncedSave(newState);
          break;
        case 'UPDATE_STATS':
          newState.stats = { ...prev.stats, ...action.payload };
          newState.uid = encodeGameState(newState);
          debouncedSave(newState);
          break;
        case 'ADD_ITEM':
          newState.inventory = [...prev.inventory, action.payload];
          // Auto-equip if slot is empty
          if (action.payload.type === 'weapon' && !prev.loadout.weapon) {
            newState.loadout = { ...prev.loadout, weapon: action.payload };
          } else if (action.payload.type === 'armor' && !prev.loadout.armor) {
            newState.loadout = { ...prev.loadout, armor: action.payload };
          } else if (action.payload.type === 'utility' && !prev.loadout.utility) {
            newState.loadout = { ...prev.loadout, utility: action.payload };
          }
          newState.uid = encodeGameState(newState);
          debouncedSave(newState);
          break;
        case 'EQUIP_ITEM':
          newState.loadout = { ...prev.loadout, [action.payload.slot]: action.payload.item };
          const equippedItemName = formatItemName(action.payload.item.name);
          eventLogger.logEvent('event', `Equipped ${equippedItemName} (${action.payload.slot})`, {
            slot: action.payload.slot,
            item: action.payload.item
          });
          newState.uid = encodeGameState(newState);
          debouncedSave(newState);
          break;
        case 'UNEQUIP_ITEM':
          const unequippedItem = prev.loadout[action.payload.slot];
          newState.loadout = { ...prev.loadout, [action.payload.slot]: null };
          if (unequippedItem) {
            const unequippedItemName = formatItemName(unequippedItem.name);
            eventLogger.logEvent('event', `Unequipped ${unequippedItemName} (${action.payload.slot})`, {
              slot: action.payload.slot,
              item: unequippedItem
            });
          }
          newState.uid = encodeGameState(newState);
          debouncedSave(newState);
          break;
        case 'USE_CONSUMABLE':
          const consumable = prev.inventory.find(item => item.id === action.payload.itemId);
          if (consumable && consumable.type === 'consumable') {
            // Check for Scrolls
            if (consumable.name.includes('Scroll of')) {
              // Identify scroll type
              const scrollTypeMap: Record<string, import('./game/types').ScrollType> = {
                'Scroll of Fortune': 'scroll_fortune',
                'Scroll of Pathfinding': 'scroll_pathfinding',
                'Scroll of Commerce': 'scroll_commerce',
                'Scroll of Ending': 'scroll_ending',
                'Scroll of Threat-sense': 'scroll_threatsense',
                'Scroll of Loot-sense': 'scroll_lootsense',
                'Scroll of Phasing': 'scroll_phasing',
              };
              
              const scrollType = scrollTypeMap[consumable.name];
              if (scrollType) {
                // Set pending scroll action for GameCanvas to handle
                newState.pendingScrollAction = { type: scrollType, scrollId: consumable.id };
                
                // Handle scroll effects that don't need level data
                if (scrollType === 'scroll_threatsense') {
                  newState.activeScrollEffects.threatSense = true;
                  const threatSenseItemName = formatItemName(consumable.name);
                  eventLogger.logEvent('consumable', `Used ${threatSenseItemName} - Enemy detection active`, {
                    type: 'scroll',
                    scrollType: 'scroll_threatsense',
                    item: consumable
                  });
                } else if (scrollType === 'scroll_lootsense') {
                  newState.activeScrollEffects.lootSense = true;
                  const lootSenseItemName = formatItemName(consumable.name);
                  eventLogger.logEvent('consumable', `Used ${lootSenseItemName} - Item detection active`, {
                    type: 'scroll',
                    scrollType: 'scroll_lootsense',
                    item: consumable
                  });
                } else if (scrollType === 'scroll_phasing') {
                  const now = Date.now();
                  let endTime: number | 'entire_level';
                  if (consumable.rarity === 'legendary') {
                    endTime = 'entire_level';
                  } else {
                    const durationMap = { common: 5000, rare: 10000, epic: 20000 };
                    endTime = now + (durationMap[consumable.rarity] || 5000);
                  }
                  newState.activeScrollEffects.phasing = { active: true, endTime };
                  const duration = endTime === 'entire_level' ? 'entire level' : `${Math.floor((endTime - now) / 1000)}s`;
                  const phasingItemName = formatItemName(consumable.name);
                  eventLogger.logEvent('consumable', `Used ${phasingItemName} - Phasing active for ${duration}`, {
                    type: 'scroll',
                    scrollType: 'scroll_phasing',
                    item: consumable,
                    duration
                  });
                } else if (scrollType === 'scroll_commerce') {
                  const commerceItemName = formatItemName(consumable.name);
                  eventLogger.logEvent('consumable', `Used ${commerceItemName} - Commerce vendor opened`, {
                    type: 'scroll',
                    scrollType: 'scroll_commerce',
                    item: consumable
                  });
                } else if (scrollType === 'scroll_ending') {
                  // Advance to next boss sector (same as clearing a maze)
                  // This will be handled in GameCanvas by checking pendingScrollAction
                }
                // scroll_fortune, scroll_pathfinding, scroll_ending are handled in GameCanvas
              }
            } else if (consumable.name.includes('Potion of Light')) {
              // Check for Potion of Light
              const now = Date.now();
              const duration = 10000; // 10 seconds
              let visionBoost: number;
              
              if (consumable.rarity === 'legendary') {
                // Legendary: Full maze reveal (use very large number)
                visionBoost = 9999;
              } else {
                // Common: +1.0, Rare: +1.5, Epic: +2.0
                const boostMap = { common: 1.0, rare: 1.5, epic: 2.0 };
                visionBoost = boostMap[consumable.rarity] || 1.0;
              }
              
              newState.temporaryVisionBoost = {
                amount: visionBoost,
                endTime: now + duration,
              };
              
              // Log potion usage event
              const boostText = consumable.rarity === 'legendary' ? 'Full maze reveal' : `+${visionBoost} vision`;
              const lightPotionItemName = formatItemName(consumable.name);
              eventLogger.logEvent('consumable', `Used ${lightPotionItemName} - ${boostText} for 10s`, {
                type: 'potion',
                potionType: 'light',
                item: consumable,
                visionBoost,
                duration: 10000
              });
            } else if (consumable.stats) {
              // Apply other consumable effects
              const updates: Partial<PlayerStats> = {};
              if (consumable.stats.heal) {
                updates.hp = Math.min(prev.stats.maxHp, prev.stats.hp + consumable.stats.heal);
                // Log healing potion usage
                const healPotionItemName = formatItemName(consumable.name);
                eventLogger.logEvent('consumable', `Used ${healPotionItemName} - Healed ${consumable.stats.heal} HP`, {
                  type: 'potion',
                  potionType: 'heal',
                  item: consumable,
                  healAmount: consumable.stats.heal,
                  newHp: updates.hp
                });
              }
              if (consumable.stats.speed) {
                // Speed boost is temporary - could be implemented as a temporary effect
                // For now, we'll just remove the item after use
                const speedPotionItemName = formatItemName(consumable.name);
                eventLogger.logEvent('consumable', `Used ${speedPotionItemName} - Speed boost active`, {
                  type: 'potion',
                  potionType: 'speed',
                  item: consumable,
                  speedBoost: consumable.stats.speed
                });
              }
              if (Object.keys(updates).length > 0) {
                newState.stats = { ...prev.stats, ...updates };
              }
            }
            // Remove consumable from inventory
            newState.inventory = prev.inventory.filter(item => item.id !== action.payload.itemId);
            newState.uid = encodeGameState(newState);
            debouncedSave(newState);
          }
          break;
        case 'SELL_ITEM':
          const itemToSell = prev.inventory.find(item => item.id === action.payload.itemId);
          if (itemToSell) {
            // Check if item is equipped - unequip it first
            let newLoadout = { ...prev.loadout };
            if (prev.loadout.weapon?.id === itemToSell.id) {
              newLoadout.weapon = null;
            } else if (prev.loadout.armor?.id === itemToSell.id) {
              newLoadout.armor = null;
            } else if (prev.loadout.utility?.id === itemToSell.id) {
              newLoadout.utility = null;
            }
            newState.loadout = newLoadout;
            
            // Calculate sell value based on rarity and stats
            const sellValue = calculateSellValue(itemToSell);
            
            // Remove item from inventory and add coins
            newState.inventory = prev.inventory.filter(item => item.id !== action.payload.itemId);
            newState.stats = { ...prev.stats, coins: prev.stats.coins + sellValue };
            newState.uid = encodeGameState(newState);
            debouncedSave(newState);
          }
          break;
        case 'NEXT_LEVEL':
          // Clear vendor items for the previous level when moving to a new sector
          clearVendorItems(prev.currentLevel);
          // Clear scroll effects when level changes
          newState.activeScrollEffects = { threatSense: false, lootSense: false, phasing: null };
          newState.temporaryVisionBoost = null;
          newState.currentLevel += 1;
          newState.uid = encodeGameState(newState);
          // Save immediately on level changes
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
          } catch (error) {
            console.warn('Failed to save game state to localStorage:', error);
          }
          break;
        case 'SET_CURRENT_LEVEL':
          newState.currentLevel = action.payload;
          newState.uid = encodeGameState(newState);
          // Save immediately on level changes
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
          } catch (error) {
            console.warn('Failed to save game state to localStorage:', error);
          }
          break;
        case 'SET_MODS':
          newState.activeMods = action.payload;
          // Update code when mods change
          newState.uid = encodeGameState(newState);
          debouncedSave(newState);
          break;
        case 'LOAD_STATE':
          // Load state from decoded code
          Object.assign(newState, action.payload);
          // Regenerate code from loaded state
          newState.uid = encodeGameState(newState);
          // Save immediately when loading from code
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
          } catch (error) {
            console.warn('Failed to save game state to localStorage:', error);
          }
          break;
        case 'ADD_BOSS_DROP':
          newState.bossDrops = [...prev.bossDrops, action.payload];
          // Also add to inventory so it can be equipped/used
          newState.inventory = [...prev.inventory, action.payload];
          // Auto-equip if slot is empty
          if (action.payload.type === 'weapon' && !prev.loadout.weapon) {
            newState.loadout = { ...prev.loadout, weapon: action.payload };
          } else if (action.payload.type === 'armor' && !prev.loadout.armor) {
            newState.loadout = { ...prev.loadout, armor: action.payload };
          } else if (action.payload.type === 'utility' && !prev.loadout.utility) {
            newState.loadout = { ...prev.loadout, utility: action.payload };
          }
          newState.uid = encodeGameState(newState);
          // Save immediately on boss drops (important items)
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
          } catch (error) {
            console.warn('Failed to save game state to localStorage:', error);
          }
          break;
        case 'CLEAR_BOSS_DROPS':
          newState.bossDrops = [];
          newState.uid = encodeGameState(newState);
          debouncedSave(newState);
          break;
        case 'UPDATE_SETTINGS':
          newState.settings = { ...prev.settings, ...action.payload };
          newState.uid = encodeGameState(newState);
          debouncedSave(newState);
          break;
        case 'UNLOCK_COMPENDIUM_CARD':
          // Only add if not already unlocked
          if (!prev.compendium.includes(action.payload)) {
            newState.compendium = [...prev.compendium, action.payload];
            newState.uid = encodeGameState(newState);
            // Save immediately on compendium unlock (important progress)
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
            } catch (error) {
              console.warn('Failed to save game state to localStorage:', error);
            }
          }
          break;
        case 'CLEAR_PENDING_SCROLL_ACTION':
          newState.pendingScrollAction = null;
          newState.uid = encodeGameState(newState);
          debouncedSave(newState);
          break;
      }
      return newState;
    });
  };

  const resetGame = () => {
    // Clear all vendor items on game reset
    clearAllVendorItems();
    const newState: GameState = {
      uid: '', // Will be set after encoding
      screen: 'lobby',
      currentLevel: 1,
      stats: { ...INITIAL_STATS },
      inventory: [],
      loadout: { weapon: null, armor: null, utility: null },
      activeMods: state.activeMods,
      bossDrops: state.bossDrops,
      compendium: state.compendium, // Preserve compendium across resets
      activeScrollEffects: { threatSense: false, lootSense: false, phasing: null },
      temporaryVisionBoost: null,
      pendingScrollAction: null,
      settings: state.settings,
    };
    newState.uid = encodeGameState(newState);
    setState(newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (error) {
      console.warn('Failed to save game state to localStorage:', error);
    }
  };

  const loadFromCode = (code: string): boolean => {
    const decoded = decodeGameState(code);
    if (decoded) {
      dispatch({ type: 'LOAD_STATE', payload: decoded });
      return true;
    }
    return false;
  };

  const getCode = (): string => {
    return encodeGameState(state);
  };

  const saveGame = () => {
    // Force immediate save, clearing any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    try {
      // Ensure code is up to date before saving
      const stateWithCode = { ...state };
      stateWithCode.uid = encodeGameState(stateWithCode);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateWithCode));
      pendingStateRef.current = null;
      // Update state to reflect the new code
      setState(stateWithCode);
    } catch (error) {
      console.warn('Failed to save game state to localStorage:', error);
    }
  };

  return (
    <GameContext.Provider value={{ state, dispatch, resetGame, saveGame, loadFromCode, getCode }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
