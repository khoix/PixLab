import type { EffectiveRenderQuality } from '../renderQuality';
import { fogAlphaAtDistance } from './fogGradient';
import { screenToGround, type GroundPoint, type PerspectiveCamera } from './projection';

export interface WorldVisibility {
  visibilityAt(point: GroundPoint): number;
  drawGround(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void;
}

/** Same logical radius/falloff as the flat renderer. The cached mask samples
 * inverse-projected ground rays, while raised artwork uses its ground footpoint.
 * Camera translation cancels out: following never rebuilds a static-radius mask. */
export class PerspectiveFog implements WorldVisibility {
  private camera!: PerspectiveCamera;
  private radius = 0;
  private quality: EffectiveRenderQuality = 'high';
  private buffer: HTMLCanvasElement | null = null;
  private key = '';
  private shapeKey = '';
  private distances = new Float64Array(0);
  private pixels: ImageData | null = null;
  private builds = 0;
  prepare(camera: PerspectiveCamera, radiusTiles: number, quality: EffectiveRenderQuality): this {
    this.camera = camera; this.radius = radiusTiles; this.quality = quality; return this;
  }
  visibilityAt(point: GroundPoint): number {
    return 1 - fogAlphaAtDistance(Math.hypot(point.x - this.camera.focus.x, point.y - this.camera.focus.y), this.radius);
  }
  getStats() { return { builds: this.builds, width: this.buffer?.width ?? 0, height: this.buffer?.height ?? 0, radiusTiles: this.radius }; }
  drawGround(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    const step = this.quality === 'high' ? 4 : this.quality === 'medium' ? 6 : 8;
    const key = [camera.width, camera.height, camera.anchor.x, camera.anchor.y, camera.focalLength,
      camera.sinPitch, camera.cosPitch, camera.distance, camera.near, camera.far, step].join(':');
    const maskKey = `${key}:${this.radius}`;
    if (maskKey !== this.key || !this.buffer) {
      if (!this.buffer) this.buffer = document.createElement('canvas');
      const b = this.buffer.getContext('2d');
      if (!b) return;
      // Projection rays depend on viewport/camera shape, not focus translation
      // or vision radius. Reuse both distances and ImageData during debuff decay.
      if (key !== this.shapeKey || !this.pixels) {
        this.buffer.width = Math.max(1, Math.ceil(camera.width / step));
        this.buffer.height = Math.max(1, Math.ceil(camera.height / step));
        this.pixels = b.createImageData(this.buffer.width, this.buffer.height);
        this.distances = new Float64Array(this.buffer.width * this.buffer.height);
        for (let y = 0; y < this.buffer.height; y++) for (let x = 0; x < this.buffer.width; x++) {
          const p = screenToGround(camera, { x: (x + 0.5) * camera.width / this.buffer.width,
            y: (y + 0.5) * camera.height / this.buffer.height });
          this.distances[y * this.buffer.width + x] = p
            ? Math.hypot(p.x - camera.focus.x, p.y - camera.focus.y) : Infinity;
        }
        this.shapeKey = key;
      }
      for (let i = 0; i < this.distances.length; i++) {
        this.pixels.data[i * 4 + 3] = Math.round(255 * fogAlphaAtDistance(this.distances[i], this.radius));
      }
      b.putImageData(this.pixels, 0, 0); this.key = maskKey; this.builds++;
    }
    ctx.save(); ctx.shadowBlur = 0; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.buffer, 0, 0, camera.width, camera.height); ctx.restore();
  }
}
