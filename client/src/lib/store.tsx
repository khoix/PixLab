import React, { createContext, useContext, useEffect, useState } from 'react';
import { GameState, Item, PlayerStats } from './game/types';
import { INITIAL_STATS } from './game/constants';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'neon_olympus_save';

interface GameContextType {
  state: GameState;
  dispatch: (action: GameAction) => void;
  resetGame: () => void;
  saveGame: () => void;
}

type GameAction = 
  | { type: 'SET_SCREEN'; payload: GameState['screen'] }
  | { type: 'UPDATE_STATS'; payload: Partial<PlayerStats> }
  | { type: 'ADD_ITEM'; payload: Item }
  | { type: 'EQUIP_ITEM'; payload: { slot: 'weapon' | 'armor' | 'utility'; item: Item } }
  | { type: 'NEXT_LEVEL' }
  | { type: 'SET_MODS'; payload: string[] }
  | { type: 'SET_UID'; payload: string };

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GameState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      uid: uuidv4(),
      screen: 'title',
      currentLevel: 1,
      stats: { ...INITIAL_STATS },
      inventory: [],
      loadout: { weapon: null, armor: null, utility: null },
      activeMods: [],
      settings: { musicVolume: 0.5, sfxVolume: 0.5, joystickPosition: 'left' },
    };
  });

  const dispatch = (action: GameAction) => {
    setState((prev) => {
      let newState = { ...prev };
      switch (action.type) {
        case 'SET_SCREEN':
          newState.screen = action.payload;
          break;
        case 'UPDATE_STATS':
          newState.stats = { ...prev.stats, ...action.payload };
          break;
        case 'ADD_ITEM':
          newState.inventory = [...prev.inventory, action.payload];
          break;
        case 'EQUIP_ITEM':
          newState.loadout = { ...prev.loadout, [action.payload.slot]: action.payload.item };
          break;
        case 'NEXT_LEVEL':
          newState.currentLevel += 1;
          break;
        case 'SET_MODS':
          newState.activeMods = action.payload;
          break;
        case 'SET_UID':
          newState.uid = action.payload;
          break;
      }
      // Auto-save on state change
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      return newState;
    });
  };

  const resetGame = () => {
    const newState: GameState = {
      uid: state.uid, // Keep UID
      screen: 'lobby',
      currentLevel: 1,
      stats: { ...INITIAL_STATS },
      inventory: [],
      loadout: { weapon: null, armor: null, utility: null },
      activeMods: [],
      settings: state.settings,
    };
    setState(newState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  };

  const saveGame = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  return (
    <GameContext.Provider value={{ state, dispatch, resetGame, saveGame }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
