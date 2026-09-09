import { worldToScreen, type PerspectiveCamera } from './projection';

/** Small tessellated ground decal. Camera math stays in projection.ts; each
 * affine texture triangle approximates only a quarter-tile patch. */
export class GroundImage {
  private points = new Float64Array(50);
  private seal = false;
  private valid = new Uint8Array(25);
  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera, image: CanvasImageSource,
    x: number, y: number, opaque = false): void {
    const size = 1; this.seal = opaque;
    const points = this.points;
    for (let row = 0; row <= 4; row++) for (let col = 0; col <= 4; col++) {
      const index = row * 5 + col;
      const p = worldToScreen(camera, { x: x + col * size / 4, y: y + row * size / 4 });
      this.valid[index] = p ? 1 : 0;
      if (p) { points[index * 2] = p.x; points[index * 2 + 1] = p.y; }
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const a = row * 5 + col, b = a + 1, d = a + 5, c = d + 1;
      this.triangle(ctx, image, a, b, c, col / 4, row / 4, true);
      this.triangle(ctx, image, a, c, d, col / 4, row / 4, false);
    }
  }
  private triangle(ctx: CanvasRenderingContext2D, image: CanvasImageSource,
    i: number, j: number, k: number, u: number, v: number, upper: boolean): void {
    if (!this.valid[i] || !this.valid[j] || !this.valid[k]) return;
    const p = this.points, x0 = p[i * 2], y0 = p[i * 2 + 1];
    const x1 = p[j * 2], y1 = p[j * 2 + 1], x2 = p[k * 2], y2 = p[k * 2 + 1];
    const a = (upper ? x1 - x0 : x1 - x2) * 4;
    const b = (upper ? y1 - y0 : y1 - y2) * 4;
    const c = (upper ? x2 - x1 : x2 - x0) * 4;
    const d = (upper ? y2 - y1 : y2 - y0) * 4;
    ctx.save();
    ctx.beginPath();
    // Opaque decals may overlap internally to cover triangle antialias seams.
    // The source image bounds still clip the outer decal edge. Transparent
    // portal glow keeps exact edges to avoid double-compositing its alpha.
    const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3;
    const expansion = this.seal ? 1.08 : 1;
    ctx.moveTo(cx + (x0 - cx) * expansion, cy + (y0 - cy) * expansion);
    ctx.lineTo(cx + (x1 - cx) * expansion, cy + (y1 - cy) * expansion);
    ctx.lineTo(cx + (x2 - cx) * expansion, cy + (y2 - cy) * expansion); ctx.closePath();
    ctx.clip(); ctx.transform(a, b, c, d, x0 - a * u - c * v, y0 - b * u - d * v);
    ctx.drawImage(image, 0, 0, 1, 1); ctx.restore();
  }
}
