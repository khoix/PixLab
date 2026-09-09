import type { Level } from '../types';
import type { PerspectiveCamera } from './projection';
import type { WorldDrawable } from './worldGeometry';
import { GroundImage } from './groundImage';

class Landmark implements WorldDrawable {
  x = 0; y = 0; orderId = 0; alpha = 1;
  image: CanvasImageSource | null = null;
  private projector = new GroundImage();
  draw(): void { /* Ground decals precede every wall and entity. */ }
  drawGround(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    if (!this.image) return;
    ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = this.alpha;
    this.projector.draw(ctx, camera, this.image, this.x - 0.5, this.y - 0.5);
    ctx.restore();
  }
}

/** Cached floor artwork; only its projection and portal pulse change per frame.
 * No portal particle mutation, teleport, exit or selection logic lives here. */
export class PerspectiveLandmarks {
  private pool: Landmark[] = [];
  private active: WorldDrawable[] = [];
  private portal: HTMLCanvasElement | null = null;
  private stairs: HTMLCanvasElement[] = [];
  private source: HTMLImageElement | null = null;
  private floor = '';

  private buildPortal(): HTMLCanvasElement {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
    glow.addColorStop(0, 'rgba(100,50,255,0.8)'); glow.addColorStop(0.5, 'rgba(150,100,255,0.4)');
    glow.addColorStop(1, 'rgba(200,150,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#9B59FF'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(32, 32, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#6C3483'; ctx.beginPath(); ctx.arc(32, 32, 10, 0, Math.PI * 2); ctx.fill();
    return canvas;
  }
  private buildStairs(image: HTMLImageElement | null, floor: string): void {
    this.source = image; this.floor = floor; this.stairs.length = 0;
    for (let rotated = 0; rotated < 2; rotated++) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = floor; ctx.fillRect(0, 0, 64, 64);
      if (image) {
        ctx.save(); ctx.translate(32, 32); if (rotated) ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, -32, -32, 64, 64); ctx.restore();
        ctx.globalCompositeOperation = 'color'; ctx.fillStyle = floor; ctx.fillRect(0, 0, 64, 64);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(8, 8, 48, 48);
        ctx.strokeStyle = '#42d69b'; ctx.lineWidth = 2; ctx.strokeRect(8, 8, 48, 48);
      }
      this.stairs.push(canvas);
    }
  }
  private add(x: number, y: number, image: CanvasImageSource, alpha: number): void {
    const index = this.active.length, record = this.pool[index] ?? (this.pool[index] = new Landmark());
    record.x = x + 0.5; record.y = y + 0.5; record.orderId = 5_000_000 + index;
    record.image = image; record.alpha = alpha; this.active.push(record);
  }
  prepare(level: Level, floor: string, stairs: HTMLImageElement | null, now: number): readonly WorldDrawable[] {
    this.active.length = 0;
    if (!this.portal) this.portal = this.buildPortal();
    if (!this.stairs.length || this.source !== stairs || this.floor !== floor) this.buildStairs(stairs, floor);
    for (const portal of level.portals) this.add(portal.pos.x, portal.pos.y, this.portal, 0.85 + Math.sin(now * 0.003) * 0.15);
    // Iterate exit tiles, not just exitPos: preserves generated or boss-created exits.
    for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
      if (level.tiles[y][x] === 'exit') this.add(x, y, this.stairs[level.tiles[y - 1]?.[x] === 'wall' ? 1 : 0], 1);
    }
    return this.active;
  }
}
