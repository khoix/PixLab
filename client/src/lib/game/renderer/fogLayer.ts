export interface FogLayerParams {
  logicalWidth: number;
  logicalHeight: number;
  dpr: number;
  centerX: number;
  centerY: number;
  radius: number;
}

export class FogLayerCache {
  private buffer: HTMLCanvasElement | null = null;
  private lastKey = '';
  private rebuildCount = 0;
  private blitCount = 0;

  draw(ctx: CanvasRenderingContext2D, params: FogLayerParams): void {
    const key = this.buildKey(params);

    if (key !== this.lastKey || !this.buffer) {
      this.rebuild(params);
      this.lastKey = key;
      this.rebuildCount += 1;
    } else {
      this.blitCount += 1;
    }

    if (!this.buffer) return;

    ctx.drawImage(this.buffer, 0, 0, params.logicalWidth, params.logicalHeight);
  }

  invalidate(): void {
    this.lastKey = '';
  }

  getStats(): { rebuildCount: number; blitCount: number; lastKey: string } {
    return {
      rebuildCount: this.rebuildCount,
      blitCount: this.blitCount,
      lastKey: this.lastKey,
    };
  }

  resetStats(): void {
    this.rebuildCount = 0;
    this.blitCount = 0;
  }

  private buildKey(params: FogLayerParams): string {
    return [
      params.logicalWidth,
      params.logicalHeight,
      params.dpr,
      Math.round(params.centerX),
      Math.round(params.centerY),
      Math.round(params.radius),
    ].join(':');
  }

  private rebuild(params: FogLayerParams): void {
    if (!this.buffer) {
      this.buffer = document.createElement('canvas');
    }

    this.buffer.width = Math.max(1, Math.floor(params.logicalWidth * params.dpr));
    this.buffer.height = Math.max(1, Math.floor(params.logicalHeight * params.dpr));

    const fogCtx = this.buffer.getContext('2d');
    if (!fogCtx) return;

    fogCtx.setTransform(params.dpr, 0, 0, params.dpr, 0, 0);
    fogCtx.clearRect(0, 0, params.logicalWidth, params.logicalHeight);

    const gradient = fogCtx.createRadialGradient(
      params.centerX,
      params.centerY,
      params.radius * 0.5,
      params.centerX,
      params.centerY,
      params.radius,
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.1)');
    gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.3)');
    gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(0.95, 'rgba(0, 0, 0, 0.9)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');

    fogCtx.fillStyle = gradient;
    fogCtx.fillRect(0, 0, params.logicalWidth, params.logicalHeight);
  }
}

export function initFogLayerCache(cache: FogLayerCache): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_FOG__ = {
    getStats: () => cache.getStats(),
    resetStats: () => cache.resetStats(),
  };
}

declare global {
  interface Window {
    __PIXLAB_FOG__?: {
      getStats: () => { rebuildCount: number; blitCount: number; lastKey: string };
      resetStats: () => void;
    };
  }
}
