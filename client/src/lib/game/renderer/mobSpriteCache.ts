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
  /** Mean blit area in logical px², across the sprites currently held. */
  avgBlitArea: number;
}

/**
 * A rendered sprite plus the sub-rect of it that actually holds ink.
 *
 * The padded canvas is 112x112 for a 32px mob, and blitting all of it means
 * compositing 12x the pixels the art occupies. On a fill-rate-limited renderer
 * that costs more than rebuilding the paths did — measured on CI, where the
 * full-canvas blit was 10-14% *slower* than drawing direct at high quality
 * while the same test on a low-quality mobile viewport saved 14%.
 *
 * So each sprite carries the bounds of its non-transparent pixels, found once
 * at build time, and only that rect is blitted. The bounds are snapped outward
 * to whole logical pixels so the source-to-destination mapping stays 1:1 and
 * the blit is still pixel-identical to a direct draw.
 */
export interface MobSprite {
  canvas: HTMLCanvasElement;
  /** Source rect in backing-store (device) pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Offset of that rect from the sprite's top-left, in logical pixels. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/**
 * The bounding box of non-transparent pixels, in device pixels, snapped
 * outward to whole logical pixels. Null when the sprite drew nothing.
 */
function inkBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
): { sx: number; sy: number; sw: number; sh: number } | null {
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    // A tainted or zero-sized canvas: fall back to the whole thing.
    return { sx: 0, sy: 0, sw: width, sh: height };
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  // Outward to whole logical pixels, so the destination offset is an integer
  // and the source rect maps 1:1 onto it.
  const step = Math.max(1, Math.round(dpr));
  const sx = Math.floor(minX / step) * step;
  const sy = Math.floor(minY / step) * step;
  const sw = Math.min(width, Math.ceil((maxX + 1) / step) * step) - sx;
  const sh = Math.min(height, Math.ceil((maxY + 1) / step) * step) - sy;
  return { sx, sy, sw, sh };
}

export class MobSpriteCache {
  private sprites = new Map<string, MobSprite>();
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
    let area = 0;
    this.sprites.forEach((sprite) => {
      area += sprite.width * sprite.height;
    });
    return {
      entries: this.sprites.size,
      builds: this.builds,
      hits: this.hits,
      misses: this.misses,
      avgBlitArea: this.sprites.size === 0 ? 0 : area / this.sprites.size,
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
  get(key: MobSpriteKey, tier: ShadowTier): MobSprite | null {
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

    const bounds = inkBounds(ctx, canvas.width, canvas.height, this.dpr);
    // A look that drew nothing is a bug, not a blank mob: fall back to the
    // direct draw rather than silently blitting emptiness.
    if (!bounds) return null;

    const sprite: MobSprite = {
      canvas,
      sx: bounds.sx,
      sy: bounds.sy,
      sw: bounds.sw,
      sh: bounds.sh,
      offsetX: bounds.sx / this.dpr,
      offsetY: bounds.sy / this.dpr,
      width: bounds.sw / this.dpr,
      height: bounds.sh / this.dpr,
    };

    this.builds++;
    this.sprites.set(id, sprite);
    return sprite;
  }

  /** Blit a sprite's inked rect so its tile lands on the mob's tile. */
  draw(ctx: CanvasRenderingContext2D, sprite: MobSprite, tileX: number, tileY: number): void {
    ctx.drawImage(
      sprite.canvas,
      sprite.sx,
      sprite.sy,
      sprite.sw,
      sprite.sh,
      tileX * TILE_SIZE - SPRITE_PAD + sprite.offsetX,
      tileY * TILE_SIZE - SPRITE_PAD + sprite.offsetY,
      sprite.width,
      sprite.height,
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
