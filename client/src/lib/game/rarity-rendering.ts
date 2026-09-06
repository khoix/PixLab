import type { Item } from './types';

const LEGENDARY_COLOR = '#ffd700';
const LEGENDARY_GLOW_ALPHA = 0.22;
const LEGENDARY_GLOW_BLUR_PX = 4;

type MaskInfo = {
  tintCanvas: HTMLCanvasElement;
  alphaPoints: Array<{ x: number; y: number }>;
};

const maskCache = new WeakMap<HTMLImageElement, MaskInfo>();

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getMaskInfo(
  img: HTMLImageElement,
  width: number,
  height: number
): MaskInfo | null {
  const cached = maskCache.get(img);
  if (cached && cached.tintCanvas.width === width && cached.tintCanvas.height === height) {
    return cached;
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskCtx) return null;

  maskCtx.drawImage(img, 0, 0, width, height);
  const imageData = maskCtx.getImageData(0, 0, width, height);
  const alphaPoints: Array<{ x: number; y: number }> = [];

  // Sample the alpha mask instead of the rectangular image bounds so the
  // glimmer always lands on visible equipment pixels.
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const alpha = imageData.data[(y * width + x) * 4 + 3];
      if (alpha >= 96) alphaPoints.push({ x, y });
    }
  }

  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = width;
  tintCanvas.height = height;
  const tintCtx = tintCanvas.getContext('2d');
  if (!tintCtx) return null;

  tintCtx.drawImage(img, 0, 0, width, height);
  tintCtx.globalCompositeOperation = 'source-in';
  tintCtx.fillStyle = LEGENDARY_COLOR;
  tintCtx.fillRect(0, 0, width, height);

  const info = { tintCanvas, alphaPoints };
  maskCache.set(img, info);
  return info;
}

function drawLegendaryGlimmer(
  ctx: CanvasRenderingContext2D,
  item: Item,
  points: Array<{ x: number; y: number }>,
  timeMs: number
): void {
  if (points.length === 0) return;

  // Roughly one brief glimmer every few seconds. The item id makes placement
  // deterministic for a given animation phase instead of visually jittery.
  const phase = Math.floor(timeMs / 450);
  if ((hashString(item.id) + phase) % 7 !== 0) return;

  const index = hashString(`${item.id}:${phase}`) % points.length;
  const point = points[index];

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = '#fff8c2';
  ctx.fillRect(point.x, point.y, 2, 2);
  ctx.fillStyle = LEGENDARY_COLOR;
  ctx.fillRect(point.x - 2, point.y, 2, 1);
  ctx.fillRect(point.x + 2, point.y, 2, 1);
  ctx.fillRect(point.x, point.y - 2, 1, 2);
  ctx.fillRect(point.x, point.y + 2, 1, 2);
  ctx.restore();
}

/**
 * Draws an equipped item using its normal image, adding subtle rarity treatment
 * only when needed. Legendary glow is generated from the item's alpha mask, so
 * it hugs the item rather than tinting the whole operator preview.
 */
export function drawItemWithRarity(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  item: Item | null,
  width: number,
  height: number,
  timeMs: number = Date.now()
): void {
  if (!item || item.rarity !== 'legendary') {
    ctx.drawImage(img, 0, 0, width, height);
    return;
  }

  const maskInfo = getMaskInfo(img, width, height);
  if (maskInfo) {
    ctx.save();
    ctx.globalAlpha = LEGENDARY_GLOW_ALPHA;
    ctx.filter = `blur(${LEGENDARY_GLOW_BLUR_PX}px)`;
    ctx.drawImage(maskInfo.tintCanvas, 0, 0);
    ctx.restore();
  }

  ctx.drawImage(img, 0, 0, width, height);

  if (maskInfo) {
    drawLegendaryGlimmer(ctx, item, maskInfo.alphaPoints, timeMs);
  }
}
