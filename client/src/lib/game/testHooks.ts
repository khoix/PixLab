import type { GameState, Item, MobSubtype, Position } from './types';

export interface LevelDebugEntity {
  id: string;
  type: string;
  mobSubtype: MobSubtype | null;
  pos: Position;
  hp: number;
  /** Boss attack-cycle phase, for M6.5 assertions. Null for ordinary mobs. */
  bossPhase: 'ready' | 'telegraph' | 'execute' | 'recover' | null;
}

declare global {
  interface Window {
    __PIXLAB_LEVEL__?: {
      getPlayerPos: () => Position;
      getPlayerHp: () => number;
      isWall: (x: number, y: number) => boolean;
      getEntities: () => LevelDebugEntity[];
      getExitPos: () => Position | null;
      isFloor: (x: number, y: number) => boolean;
      setPlayerPos: (pos: Position) => void;
      spawnMob: (subtype: MobSubtype, pos: Position) => string | null;
      clearMobs: () => void;
      spawnItem: (item: Item, pos: Position) => void;
      getItems: () => Array<{ pos: Position; item: Item }>;
      getLosCacheStats: () => { size: number; hits: number; misses: number } | null;
      spawnPortal: (pos: Position) => string | null;
      clearPortals: () => void;
      getPortals: () => Array<{ id: string; pos: Position; exitPos: Position }>;
      isStandingOnPortal: () => boolean;
      screenToTile: (x: number, y: number) => Position | null;
      tapAt: (x: number, y: number) => boolean;
    };
    __PIXLAB_TEST__?: {
      updateSettings: (payload: Partial<GameState['settings']>) => void;
      setActiveMods: (mods: string[]) => void;
      addHealingPotion: () => void;
      addConsumable: (item?: Partial<Item>) => void;
      setScreen: (screen: GameState['screen']) => void;
      setCoins: (coins: number) => void;
      setCurrentLevel: (level: number) => void;
      updateStats: (payload: Partial<GameState['stats']>) => void;
      setLobbyTab: (tab: string) => void;
    };
  }
}

export {};
