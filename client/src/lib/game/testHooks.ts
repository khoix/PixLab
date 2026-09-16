import type { GameState, Item, MobSubtype, Position } from './types';
import type { PerspectiveCamera } from './renderer/projection';
import type { WorldRenderStats } from './renderer/voxelWorld';

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
      getWorldRenderStats: () => WorldRenderStats;
      getRenderedPerspectiveCamera: () => PerspectiveCamera | null;
      getPerspectiveFogStats: () => { builds: number; width: number; height: number; radiusTiles: number };
      /** Live attack-pressure occupancy, for M6.4b assertions. */
      getPressureStats: () => { used: number; cap: number; holders: number; peakUsed: number };
      getPlayerHp: () => number;
      getLegacyEffectCount: () => number;
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

/**
 * M8.7 — the e2e/debug view of a live run, built where its types already live.
 *
 * Ninety lines of it sat in `GameCanvas` as a `useEffect`, which is the one
 * place it did not belong: it is neither simulation nor rendering nor
 * orchestration, it is the seam the specs drive the game through. `testHooks.ts`
 * declared the shape of `window.__PIXLAB_LEVEL__` all along and implemented
 * none of it.
 *
 * Everything here reads or writes refs the component owns, so the dependencies
 * arrive as the refs themselves rather than as values — the hooks are installed
 * once at mount and must keep working for the life of the canvas.
 *
 * One exception, preserved rather than fixed: `sector` is a **value**, captured
 * when the hooks are installed. `getPressureStats().cap` has always reported
 * the slot cap for the sector the canvas mounted in. Every spec that reads it
 * enters its sector and gets a fresh canvas, so it has never been wrong in
 * practice, and changing it here would change what a passing test means.
 */

import type { PressureState } from './ai/attackPressure';
import type { LegacyEffectField } from './renderer/legacyEffects';
import type { Level } from './types';
import type { PerspectiveFog } from './renderer/perspectiveFog';
import type { VoxelWorldRenderer } from './renderer/voxelWorld';
import { slotCapForLevel, usedSlots } from './ai/attackPressure';
import { getLosCacheStats } from './ai/losCache';
import { spawnMobEntity, spawnPortalAtPosition } from './demoSpawn';

/** A mutable box, which is all these need of React's `useRef`. */
interface Box<T> {
  current: T;
}

/** What the portal affordance exposes to the tap hooks. */
interface PortalApiLike {
  isStandingOnPortal: () => boolean;
  screenToTile: (x: number, y: number) => Position | null;
  tryEnterPortalAt: (tile: Position) => boolean;
}

export interface LevelDebugDeps {
  levelRef: Box<Level | null>;
  playerPosRef: Box<Position>;
  visualPosRef: Box<Position>;
  moveStartPosRef: Box<Position>;
  moveProgressRef: Box<number>;
  lastPlayerPosRef: Box<Position>;
  statsRef: Box<GameState['stats']>;
  loadoutRef: Box<GameState['loadout']>;
  attackPressureRef: Box<PressureState>;
  peakPressureRef: Box<number>;
  legacyEffectsRef: Box<LegacyEffectField>;
  portalApiRef: Box<PortalApiLike | null>;
  renderedCameraRef: Box<{ perspective?: PerspectiveCamera } | null>;
  voxelWorld: VoxelWorldRenderer;
  perspectiveFog: PerspectiveFog;
  /** Sector at install time. See the note above before making this a getter. */
  sector: number;
}

export function buildLevelDebugHooks(d: LevelDebugDeps): NonNullable<Window['__PIXLAB_LEVEL__']> {
  return {
    getPlayerPos: () => ({ ...d.playerPosRef.current }),
    getWorldRenderStats: () => d.voxelWorld.getStats(),
    getRenderedPerspectiveCamera: () => {
      const camera = d.renderedCameraRef.current?.perspective;
      return camera ? { ...camera, focus: { ...camera.focus }, anchor: { ...camera.anchor } } : null;
    },
    getPerspectiveFogStats: () => d.perspectiveFog.getStats(),
    getPlayerHp: () => d.statsRef.current.hp,
    // Render-owned legacy 2D effects. Exposed because the pause leak they
    // used to cause is only observable from outside the component.
    getLegacyEffectCount: () => d.legacyEffectsRef.current.effects.length,
    isWall: (x: number, y: number) => d.levelRef.current?.tiles[y]?.[x] === 'wall',
    getPressureStats: () => ({
      used: usedSlots(d.attackPressureRef.current),
      cap: slotCapForLevel(d.sector),
      holders: d.attackPressureRef.current.size,
      peakUsed: d.peakPressureRef.current,
    }),
    getEntities: () =>
      (d.levelRef.current?.entities ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        mobSubtype: e.mobSubtype ?? null,
        pos: { ...e.pos },
        hp: e.hp,
        bossPhase: e.bossPhase ?? null,
      })),
    getExitPos: () => (d.levelRef.current ? { ...d.levelRef.current.exitPos } : null),
    isFloor: (x: number, y: number) => d.levelRef.current?.tiles[y]?.[x] === 'floor',
    setPlayerPos: (pos) => {
      d.playerPosRef.current = { ...pos };
      d.visualPosRef.current = { ...pos };
      d.moveStartPosRef.current = { ...pos };
      d.moveProgressRef.current = 1;
      d.lastPlayerPosRef.current = { ...pos };
    },
    spawnMob: (subtype, pos) => {
      const level = d.levelRef.current;
      if (!level) return null;
      const entity = spawnMobEntity(level, subtype, { ...pos }, level.levelNumber, d.statsRef.current, d.loadoutRef.current);
      if (!entity) return null;
      level.entities = [...level.entities, entity];
      return entity.id;
    },
    clearMobs: () => {
      const level = d.levelRef.current;
      if (!level) return;
      level.entities = level.entities.filter((e) => e.type !== 'enemy' && e.type !== 'boss_enemy');
    },
    spawnItem: (item, pos) => {
      const level = d.levelRef.current;
      if (!level) return;
      level.items = [...level.items, { pos: { ...pos }, item }];
    },
    getItems: () => (d.levelRef.current?.items ?? []).map(({ pos, item }) => ({ pos: { ...pos }, item })),
    getLosCacheStats: () => (d.levelRef.current ? getLosCacheStats(d.levelRef.current) : null),
    spawnPortal: (pos: Position) => {
      const level = d.levelRef.current;
      if (!level) return null;
      const portal = spawnPortalAtPosition(level, { ...pos });
      if (!portal) return null;
      level.portals = [...(level.portals ?? []), portal];
      return portal.id;
    },
    clearPortals: () => {
      const level = d.levelRef.current;
      if (level) level.portals = [];
    },
    getPortals: () =>
      (d.levelRef.current?.portals ?? []).map((p) => ({
        id: p.id,
        pos: { ...p.pos },
        exitPos: { ...p.exitPos },
      })),
    isStandingOnPortal: () => d.portalApiRef.current?.isStandingOnPortal() ?? false,
    screenToTile: (x: number, y: number) => d.portalApiRef.current?.screenToTile(x, y) ?? null,
    tapAt: (x: number, y: number) => {
      const tile = d.portalApiRef.current?.screenToTile(x, y);
      if (!tile) return false;
      return d.portalApiRef.current?.tryEnterPortalAt(tile) ?? false;
    },
  };
}

export {};
