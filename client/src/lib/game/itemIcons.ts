/**
 * Item icon drawing functions for canvas rendering.
 * Uses PNG images from public/imgs/icons.
 *
 * Loading is resilient: any draw that misses the cache requests the image
 * (deduped while in flight), and a failed request is retried with backoff
 * instead of being written off for the session. Until the bitmap is ready a
 * rarity-tinted placeholder is drawn — never an opaque black shape, which on
 * the dark floor reads as a hole in the map.
 */

import { Item } from './types';
import { RARITY_COLORS } from './constants';

const BASE_URL = import.meta.env.BASE_URL || '/';

const ITEM_TYPES = ['weapon', 'armor', 'utility', 'consumable'] as const;
const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

export const ICON_RETRY_BASE_MS = 500;
export const ICON_RETRY_MAX_MS = 8000;
export const ICON_MAX_ATTEMPTS = 6;

interface IconRecord {
  image: HTMLImageElement | null;
  inFlight: Promise<HTMLImageElement | null> | null;
  attempts: number;
  nextRetryAt: number;
  failed: boolean;
}

const records = new Map<string, IconRecord>();
let preloadPromise: Promise<void> | null = null;

function recordFor(path: string): IconRecord {
  let record = records.get(path);
  if (!record) {
    record = { image: null, inFlight: null, attempts: 0, nextRetryAt: 0, failed: false };
    records.set(path, record);
  }
  return record;
}

function fetchImage(path: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

/**
 * Ensure `path` is loaded or loading. Safe to call every frame: returns the
 * cached bitmap when ready, otherwise kicks off (or continues) a load and
 * returns null. Failed loads back off exponentially and give up after
 * ICON_MAX_ATTEMPTS, after which the placeholder is drawn permanently.
 */
export function requestItemIcon(path: string): HTMLImageElement | null {
  const record = recordFor(path);
  if (record.image) return record.image;
  if (record.inFlight) return null;
  if (record.attempts >= ICON_MAX_ATTEMPTS) return null;
  const now = Date.now();
  if (now < record.nextRetryAt) return null;

  record.attempts += 1;
  record.inFlight = fetchImage(path).then((img) => {
    record.inFlight = null;
    if (img && img.naturalWidth > 0) {
      record.image = img;
      record.failed = false;
      return img;
    }
    record.failed = true;
    const backoff = Math.min(ICON_RETRY_MAX_MS, ICON_RETRY_BASE_MS * 2 ** (record.attempts - 1));
    record.nextRetryAt = Date.now() + backoff;
    if (record.attempts === 1 || record.attempts === ICON_MAX_ATTEMPTS) {
      console.warn(`[itemIcons] Failed to load item icon (attempt ${record.attempts}): ${path}`);
    }
    return null;
  });
  return null;
}

/** Wait for one image to load (used by preload); resolves null on failure. */
function loadImage(path: string): Promise<HTMLImageElement | null> {
  const ready = requestItemIcon(path);
  if (ready) return Promise.resolve(ready);
  const record = recordFor(path);
  return record.inFlight ?? Promise.resolve(null);
}

export function getAllItemIconPaths(): string[] {
  const paths: string[] = [];
  for (const type of ITEM_TYPES) {
    for (const rarity of RARITIES) {
      paths.push(`${BASE_URL}imgs/icons/${type}_${rarity}.png`);
    }
  }
  for (const rarity of RARITIES) {
    paths.push(`${BASE_URL}imgs/icons/scroll_${rarity}.png`);
  }
  return paths;
}

/**
 * Preload every item icon. Idempotent while a preload is in flight; once it
 * has settled, calling again re-requests anything that failed, so a later
 * caller (lobby, sector start) picks up icons a flaky first load missed.
 */
export function preloadItemIcons(): Promise<void> {
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const results = await Promise.all(getAllItemIconPaths().map((path) => loadImage(path)));
    const missing = results.filter((img) => !img).length;
    if (missing === 0) {
      console.log('[itemIcons] Preloaded all item icons');
    } else {
      console.warn(`[itemIcons] ${missing} item icon(s) did not load; they will be retried on demand`);
    }
  })().finally(() => {
    preloadPromise = null;
  });

  return preloadPromise;
}

export interface ItemIconStatus {
  total: number;
  loaded: string[];
  failed: string[];
  pending: string[];
}

export function getItemIconStatus(): ItemIconStatus {
  const status: ItemIconStatus = { total: 0, loaded: [], failed: [], pending: [] };
  for (const path of getAllItemIconPaths()) {
    status.total += 1;
    const record = records.get(path);
    if (record?.image) status.loaded.push(path);
    else if (record?.failed) status.failed.push(path);
    else status.pending.push(path);
  }
  return status;
}

/** Test/debug: forget every cached bitmap and retry state. */
export function resetItemIconCache(): void {
  records.clear();
  preloadPromise = null;
}

// Get image path for an item
export function getItemIconPath(item: Item): string {
  if (item.name.includes('Scroll of')) {
    return `${BASE_URL}imgs/icons/scroll_${item.rarity}.png`;
  }
  return `${BASE_URL}imgs/icons/${item.type}_${item.rarity}.png`;
}

type IconShape = 'weapon' | 'armor' | 'utility' | 'consumable';

// Placeholder while the bitmap is not ready: a rarity-coloured outline of the
// item silhouette on a translucent dark disc, so the tile still reads as "an
// item is here" rather than as a gap in the floor.
function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  item: Item,
  shape: IconShape,
): void {
  const color = RARITY_COLORS[item.rarity] ?? '#9e9e9e';
  const cx = x + size / 2;
  const cy = y + size / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 20, 0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  switch (shape) {
    case 'weapon':
      ctx.moveTo(cx, y + size * 0.1);
      ctx.lineTo(cx, y + size * 0.9);
      ctx.moveTo(x + size * 0.3, y + size * 0.65);
      ctx.lineTo(x + size * 0.7, y + size * 0.65);
      break;
    case 'armor':
      ctx.moveTo(cx, y + size * 0.1);
      ctx.lineTo(x + size * 0.22, y + size * 0.3);
      ctx.lineTo(x + size * 0.28, y + size * 0.65);
      ctx.lineTo(cx, y + size * 0.9);
      ctx.lineTo(x + size * 0.72, y + size * 0.65);
      ctx.lineTo(x + size * 0.78, y + size * 0.3);
      ctx.closePath();
      break;
    case 'utility':
      ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
      break;
    case 'consumable':
    default:
      // Bottle: neck then body
      ctx.moveTo(x + size * 0.4, y + size * 0.12);
      ctx.lineTo(x + size * 0.6, y + size * 0.12);
      ctx.lineTo(x + size * 0.6, y + size * 0.38);
      ctx.lineTo(x + size * 0.74, y + size * 0.55);
      ctx.lineTo(x + size * 0.74, y + size * 0.88);
      ctx.lineTo(x + size * 0.26, y + size * 0.88);
      ctx.lineTo(x + size * 0.26, y + size * 0.55);
      ctx.lineTo(x + size * 0.4, y + size * 0.38);
      ctx.closePath();
      break;
  }
  ctx.stroke();
  ctx.restore();
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  item: Item,
  shape: IconShape,
): void {
  const img = requestItemIcon(getItemIconPath(item));
  if (img) {
    // Draw at native 20x20 size without scaling
    ctx.drawImage(img, x, y, img.width, img.height);
  } else {
    drawPlaceholder(ctx, x, y, size, item, shape);
  }
}

export function drawWeaponIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, item: Item): void {
  drawIcon(ctx, x, y, size, item, 'weapon');
}

export function drawArmorIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, item: Item): void {
  drawIcon(ctx, x, y, size, item, 'armor');
}

export function drawUtilityIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, item: Item): void {
  drawIcon(ctx, x, y, size, item, 'utility');
}

export function drawConsumableIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, item: Item): void {
  drawIcon(ctx, x, y, size, item, 'consumable');
}

declare global {
  interface Window {
    __PIXLAB_ICONS__?: {
      getStatus: () => ItemIconStatus;
      preload: () => Promise<void>;
      reset: () => void;
      constants: { retryBaseMs: number; retryMaxMs: number; maxAttempts: number };
    };
  }
}

export function initItemIconsApi(): void {
  if (typeof window === 'undefined') return;
  window.__PIXLAB_ICONS__ = {
    getStatus: getItemIconStatus,
    preload: preloadItemIcons,
    reset: resetItemIconCache,
    constants: { retryBaseMs: ICON_RETRY_BASE_MS, retryMaxMs: ICON_RETRY_MAX_MS, maxAttempts: ICON_MAX_ATTEMPTS },
  };
}
