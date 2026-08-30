import { TILE_SIZE } from '../constants';
import type { Level } from '../types';
import type { ColorPalette } from '../colorThemes';

export interface TileLayerKey {
  levelId: string;
  themeId: string;
  width: number;
  height: number;
}

export class TileLayerCache {
  private buffer: HTMLCanvasElement | null = null;
  private key: TileLayerKey | null = null;

  invalidate(): void {
    this.key = null;
    this.buffer = null;
  }

  build(level: Level, theme: ColorPalette, levelKey: string): void {
    const nextKey: TileLayerKey = {
      levelId: levelKey,
      themeId: theme.id,
      width: level.width,
      height: level.height,
    };

    if (
      this.key &&
      this.buffer &&
      this.key.levelId === nextKey.levelId &&
      this.key.themeId === nextKey.themeId &&
      this.key.width === nextKey.width &&
      this.key.height === nextKey.height
    ) {
      return;
    }

    if (!this.buffer) {
      this.buffer = document.createElement('canvas');
    }

    const pixelWidth = level.width * TILE_SIZE;
    const pixelHeight = level.height * TILE_SIZE;
    this.buffer.width = pixelWidth;
    this.buffer.height = pixelHeight;

    const tileCtx = this.buffer.getContext('2d');
    if (!tileCtx) return;

    tileCtx.clearRect(0, 0, pixelWidth, pixelHeight);

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const tile = level.tiles[y][x];
        const tileX = x * TILE_SIZE;
        const tileY = y * TILE_SIZE;

        if (tile === 'wall') {
          tileCtx.fillStyle = theme.wall;
          tileCtx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
          tileCtx.fillStyle = 'rgba(0,0,0,0.3)';
          tileCtx.fillRect(tileX + 4, tileY + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        } else if (tile === 'floor' || tile === 'exit') {
          tileCtx.fillStyle = theme.floor;
          tileCtx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
          tileCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          tileCtx.strokeRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    this.key = nextKey;
  }

  drawVisibleRegion(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    viewWidth: number,
    viewHeight: number,
  ): boolean {
    if (!this.buffer || !this.key) return false;

    const sourceWidth = Math.min(viewWidth, this.buffer.width - camX);
    const sourceHeight = Math.min(viewHeight, this.buffer.height - camY);
    if (sourceWidth <= 0 || sourceHeight <= 0) return false;

    ctx.drawImage(
      this.buffer,
      camX,
      camY,
      sourceWidth,
      sourceHeight,
      camX,
      camY,
      sourceWidth,
      sourceHeight,
    );
    return true;
  }
}

export function initTileLayerCache(_cache: TileLayerCache): void {
  // Reserved for future diagnostics
}
