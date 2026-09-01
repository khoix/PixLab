import type { GameState } from '../lib/game/types';

declare global {
  interface Window {
    __PIXLAB_TEST__?: {
      updateSettings: (payload: Partial<GameState['settings']>) => void;
      setActiveMods: (mods: string[]) => void;
      addHealingPotion: () => void;
      setScreen: (screen: GameState['screen']) => void;
    };
  }
}

export {};
