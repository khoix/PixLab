import { MOBILE_BREAKPOINT } from '../renderQuality';

export const MAX_DPR = 2;

/**
 * M2: backing-store pixel budget for mobile viewports. Roughly a small phone
 * at 2x (375×667 ≈ 1.0MP), so compact devices keep full DPR while large
 * high-DPR phones get their effective DPR scaled down instead of paying for
 * a 1.6MP+ full-window buffer.
 */
export const MOBILE_MAX_BUFFER_PIXELS = 1_200_000;

export interface CanvasDimensions {
  logicalWidth: number;
  logicalHeight: number;
  dpr: number;
  bufferWidth: number;
  bufferHeight: number;
}

function isMobileViewport(logicalWidth: number): boolean {
  return logicalWidth < MOBILE_BREAKPOINT || window.innerWidth < MOBILE_BREAKPOINT;
}

function clampDprToBudget(dpr: number, logicalWidth: number, logicalHeight: number): number {
  if (!isMobileViewport(logicalWidth)) return dpr;

  const logicalPixels = logicalWidth * logicalHeight;
  if (logicalPixels <= 0) return dpr;

  const budgetDpr = Math.sqrt(MOBILE_MAX_BUFFER_PIXELS / logicalPixels);
  return Math.max(1, Math.min(dpr, budgetDpr));
}

export function getCanvasDimensions(canvas?: HTMLCanvasElement | null): CanvasDimensions {
  const rawDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  let logicalWidth: number;
  let logicalHeight: number;

  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    logicalWidth = Math.max(1, Math.floor(rect.width) || canvas.clientWidth || window.innerWidth);
    logicalHeight = Math.max(
      1,
      Math.floor(rect.height) || canvas.clientHeight || window.innerHeight,
    );
  } else {
    logicalWidth = window.innerWidth;
    logicalHeight = window.innerHeight;
  }

  const dpr = clampDprToBudget(rawDpr, logicalWidth, logicalHeight);

  return {
    logicalWidth,
    logicalHeight,
    dpr,
    bufferWidth: Math.max(1, Math.floor(logicalWidth * dpr)),
    bufferHeight: Math.max(1, Math.floor(logicalHeight * dpr)),
  };
}

export function applyCanvasDimensions(
  canvas: HTMLCanvasElement,
  dims: CanvasDimensions,
): CanvasRenderingContext2D | null {
  canvas.width = dims.bufferWidth;
  canvas.height = dims.bufferHeight;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  return ctx;
}

export function initCanvasSizing(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_CANVAS__ = {
    getDimensions: getCanvasDimensions,
    maxDpr: MAX_DPR,
    mobileMaxBufferPixels: MOBILE_MAX_BUFFER_PIXELS,
  };
}

declare global {
  interface Window {
    __PIXLAB_CANVAS__?: {
      getDimensions: typeof getCanvasDimensions;
      maxDpr: number;
      mobileMaxBufferPixels: number;
    };
  }
}
