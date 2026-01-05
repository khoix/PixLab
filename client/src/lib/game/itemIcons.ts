/**
 * Item icon drawing functions for canvas rendering
 * Uses PNG images from public/imgs/icons directory
 */

import { Item } from './types';

const BASE_URL = import.meta.env.BASE_URL || '/';

// Image cache to avoid reloading
const imageCache = new Map<string, HTMLImageElement>();

// Preload all item icons
const ITEM_TYPES = ['weapon', 'armor', 'utility', 'consumable'] as const;
const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

// Load image with caching
function loadImage(path: string): Promise<HTMLImageElement | null> {
  if (!path) return Promise.resolve(null);
  
  // Check cache first
  if (imageCache.has(path)) {
    return Promise.resolve(imageCache.get(path)!);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(path, img);
      resolve(img);
    };
    img.onerror = () => {
      console.warn(`Failed to load item icon: ${path}`);
      resolve(null);
    };
    img.src = path;
  });
}

// Preload all item icons on module load
export function preloadItemIcons(): Promise<void> {
  const loadPromises: Promise<HTMLImageElement | null>[] = [];
  
  for (const type of ITEM_TYPES) {
    for (const rarity of RARITIES) {
      const imagePath = `${BASE_URL}imgs/icons/${type}_${rarity}.png`;
      loadPromises.push(loadImage(imagePath));
    }
  }
  
  // Also preload scroll icons
  for (const rarity of RARITIES) {
    const scrollPath = `${BASE_URL}imgs/icons/scroll_${rarity}.png`;
    loadPromises.push(loadImage(scrollPath));
  }
  
  return Promise.all(loadPromises).then(() => {
    console.log('[itemIcons] Preloaded all item icons');
  });
}

// Get image path for an item
function getItemIconPath(item: Item): string {
  // Check if item is a scroll
  if (item.name.includes('Scroll of')) {
    return `${BASE_URL}imgs/icons/scroll_${item.rarity}.png`;
  }
  return `${BASE_URL}imgs/icons/${item.type}_${item.rarity}.png`;
}

/**
 * Draw a weapon icon using PNG image
 * @param ctx - Canvas rendering context
 * @param x - X position (top-left of icon area)
 * @param y - Y position (top-left of icon area)
 * @param size - Size of the item tile
 * @param item - Item to get icon for
 */
export function drawWeaponIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  item: Item
): void {
  const imagePath = getItemIconPath(item);
  const img = imageCache.get(imagePath);
  
  if (img) {
    // Draw at native 20x20 size without scaling
    ctx.drawImage(img, x, y, img.width, img.height);
  } else {
    // Fallback: draw a simple shape if image not loaded
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x + size * 0.3, y + size * 0.1, size * 0.4, size * 0.8);
    ctx.fillRect(x + size * 0.1, y + size * 0.4, size * 0.8, size * 0.2);
  }
}

/**
 * Draw an armor icon using PNG image
 * @param ctx - Canvas rendering context
 * @param x - X position (top-left of icon area)
 * @param y - Y position (top-left of icon area)
 * @param size - Size of the item tile
 * @param item - Item to get icon for
 */
export function drawArmorIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  item: Item
): void {
  const imagePath = getItemIconPath(item);
  const img = imageCache.get(imagePath);
  
  if (img) {
    // Draw at native 20x20 size without scaling
    ctx.drawImage(img, x, y, img.width, img.height);
  } else {
    // Fallback: draw a simple shape if image not loaded
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y);
    ctx.lineTo(x + size * 0.2, y + size * 0.6);
    ctx.lineTo(x + size * 0.2, y + size * 0.9);
    ctx.lineTo(x + size / 2, y + size);
    ctx.lineTo(x + size * 0.8, y + size * 0.9);
    ctx.lineTo(x + size * 0.8, y + size * 0.6);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Draw a utility icon using PNG image
 * @param ctx - Canvas rendering context
 * @param x - X position (top-left of icon area)
 * @param y - Y position (top-left of icon area)
 * @param size - Size of the item tile
 * @param item - Item to get icon for
 */
export function drawUtilityIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  item: Item
): void {
  const imagePath = getItemIconPath(item);
  const img = imageCache.get(imagePath);
  
  if (img) {
    // Draw at native 20x20 size without scaling
    ctx.drawImage(img, x, y, img.width, img.height);
  } else {
    // Fallback: draw a simple shape if image not loaded
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw a consumable icon using PNG image
 * @param ctx - Canvas rendering context
 * @param x - X position (top-left of icon area)
 * @param y - Y position (top-left of icon area)
 * @param size - Size of the item tile
 * @param item - Item to get icon for
 */
export function drawConsumableIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  item: Item
): void {
  const imagePath = getItemIconPath(item);
  const img = imageCache.get(imagePath);
  
  if (img) {
    // Draw at native 20x20 size without scaling
    ctx.drawImage(img, x, y, img.width, img.height);
  } else {
    // Fallback: draw a simple shape if image not loaded
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x + size * 0.25, y + size * 0.3, size * 0.5, size * 0.5);
    ctx.fillRect(x + size * 0.35, y + size * 0.1, size * 0.3, size * 0.2);
  }
}
