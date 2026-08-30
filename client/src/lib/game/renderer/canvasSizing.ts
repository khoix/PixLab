export const MAX_DPR = 2;

export interface CanvasDimensions {
  logicalWidth: number;
  logicalHeight: number;
  dpr: number;
  bufferWidth: number;
  bufferHeight: number;
}

export function getCanvasDimensions(): CanvasDimensions {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const logicalWidth = window.innerWidth;
  const logicalHeight = window.innerHeight;

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
  canvas.style.width = `${dims.logicalWidth}px`;
  canvas.style.height = `${dims.logicalHeight}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
  }
  return ctx;
}

export function initCanvasSizing(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_CANVAS__ = {
    getDimensions: getCanvasDimensions,
    maxDpr: MAX_DPR,
  };
}

declare global {
  interface Window {
    __PIXLAB_CANVAS__?: {
      getDimensions: typeof getCanvasDimensions;
      maxDpr: number;
    };
  }
}
