import { TILE_SIZE } from '../constants';
import {
  installStaticShadowGate,
  makeStrokeGlowCircle,
  type EffectiveRenderQuality,
  type ShadowTier,
} from '../renderQuality';
import { drawMobArt, type MobArtOptions } from './mobArt';

// Mobs drawn once, then blitted.
//
// M7 flattened `update()` to ~0.3 ms whatever the mob count, leaving drawing as
// the only thing still scaling with population: 2.7 -> 3.5 ms from 8 to 62
// mobs. Most of that is per-entity path building and `shadowBlur`, which forces
// a blur filter on every single call.
//
// A mob's appearance is a pure function of a handful of values, so it can be
// rendered once per distinct look and copied thereafter. Follows
// `renderer/tileLayer.ts`, which does the same for the map.

/**
 * Room around the tile for art that overflows it.
 *
 * The widest overhang is the Phase's wispy tail — an ellipse centred `size/3`
 * below the middle with a `size/2` radius — plus up to 20px of `shadowBlur`.
 * 40 clears both with room to spare; too small and sprites would be clipped in
 * a way that only shows on one mob type.
 */
export const SPRITE_PAD = 40;
export const SPRITE_SIZE = TILE_SIZE + SPRITE_PAD * 2;

/** Everything that changes how a mob looks. Two mobs sharing one are identical. */
export interface MobSpriteKey {
  /** Undefined is a real case: a plain enemy with no subtype has its own art. */
  subtype: string | undefined;
  isBoss: boolean;
  color: string;
  size: number;
  quality: EffectiveRenderQuality;
  charging: boolean;
}

export function spriteKeyOf(key: MobSpriteKey): string {
  return [
    key.subtype ?? 'plain',
    key.isBoss ? 'boss' : 'mob',
    key.color,
    key.size,
    key.quality,
    key.charging ? 'charging' : 'idle',
  ].join('|');
}

export interface MobSpriteStats {
  entries: number;
  builds: number;
  hits: number;
  misses: number;
}

export class MobSpriteCache {
  private sprites = new Map<string, HTMLCanvasElement>();
  private dpr = 1;
  private builds = 0;
  private hits = 0;
  private misses = 0;
  private enabled = true;

  /** Drop everything. The backing store is DPR-sized, so a resize invalidates. */
  invalidate(): void {
    this.sprites.clear();
  }

  /**
   * Turn caching off, so `get` reports failure and every caller takes its
   * direct-draw fallback — which is the pre-cache render path exactly.
   *
   * That makes an A/B measurable in one session rather than across branches,
   * and leaves a kill switch if a sprite ever renders wrong on a real device.
   */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.invalidate();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setDpr(dpr: number): void {
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.invalidate();
  }

  getStats(): MobSpriteStats {
    return {
      entries: this.sprites.size,
      builds: this.builds,
      hits: this.hits,
      misses: this.misses,
    };
  }

  resetStats(): void {
    this.builds = 0;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * The sprite for this look, rendering it if it is new.
   *
   * Returns null when the canvas cannot be built, so the caller can fall back
   * to drawing directly rather than showing nothing.
   */
  get(key: MobSpriteKey, tier: ShadowTier): HTMLCanvasElement | null {
    if (!this.enabled) return null;

    const id = spriteKeyOf(key);
    const existing = this.sprites.get(id);
    if (existing) {
      this.hits++;
      return existing;
    }
    this.misses++;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(SPRITE_SIZE * this.dpr));
    canvas.height = Math.max(1, Math.round(SPRITE_SIZE * this.dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // A gate bound to this sprite's quality, so it cannot disturb the live pass.
    const restore = installStaticShadowGate(ctx, key.quality, tier);
    const centre = SPRITE_PAD + TILE_SIZE / 2;
    const opts: MobArtOptions = {
      subtype: key.subtype as MobArtOptions['subtype'],
      isBoss: key.isBoss,
      centerX: centre,
      centerY: centre,
      color: key.color,
      size: key.size,
      quality: key.quality,
      charging: key.charging,
    };
    try {
      drawMobArt(ctx, opts, makeStrokeGlowCircle(key.quality));
    } finally {
      restore();
    }

    this.builds++;
    this.sprites.set(id, canvas);
    return canvas;
  }

  /** Blit a sprite so its tile lands on the mob's tile. */
  draw(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, tileX: number, tileY: number): void {
    ctx.drawImage(
      sprite,
      tileX * TILE_SIZE - SPRITE_PAD,
      tileY * TILE_SIZE - SPRITE_PAD,
      SPRITE_SIZE,
      SPRITE_SIZE,
    );
  }
}

export const mobSpriteCache = new MobSpriteCache();

export function initMobSpriteApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_MOB_SPRITES__ = {
    getStats: () => mobSpriteCache.getStats(),
    resetStats: () => mobSpriteCache.resetStats(),
    invalidate: () => mobSpriteCache.invalidate(),
    setEnabled: (enabled: boolean) => mobSpriteCache.setEnabled(enabled),
    isEnabled: () => mobSpriteCache.isEnabled(),
    spriteSize: SPRITE_SIZE,
    pad: SPRITE_PAD,
  };
}

declare global {
  interface Window {
    __PIXLAB_MOB_SPRITES__?: {
      getStats: () => MobSpriteStats;
      resetStats: () => void;
      invalidate: () => void;
      setEnabled: (enabled: boolean) => void;
      isEnabled: () => boolean;
      spriteSize: number;
      pad: number;
    };
  }
}
