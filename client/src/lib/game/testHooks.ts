import type { GameState, Item } from '../lib/game/types';

declare global {
  interface Window {
    __PIXLAB_TEST__?: {
      updateSettings: (payload: Partial<GameState['settings']>) => void;
      setActiveMods: (mods: string[]) => void;
      addHealingPotion: () => void;
      addConsumable: (item?: Partial<Item>) => void;
      setScreen: (screen: GameState['screen']) => void;
      setCoins: (coins: number) => void;
    };
  }
}

export {};
