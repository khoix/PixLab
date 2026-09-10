import type { PerspectiveCamera } from './projection';

/** Reused Sutherland-Hodgman buffers for convex quad faces. Clip in camera
 * space before perspective division, so near-plane crossings never pop away.
 */
export class ProjectedPolygon {
  private a = new Float64Array(24);
  private b = new Float64Array(24);
  readonly points = new Float64Array(16);
  count = 0;

  project(camera: PerspectiveCamera, vertices: Float64Array, indices: ArrayLike<number>): boolean {
    let count = indices.length;
    for (let i = 0; i < count; i++) {
      const source = indices[i] * 3;
      for (let axis = 0; axis < 3; axis++) this.a[i * 3 + axis] = vertices[source + axis];
    }
    count = this.clip(count, camera.near, true);
    count = this.clip(count, camera.far, false);
    this.count = count;
    if (count < 3) return false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const scale = camera.focalLength / this.a[i * 3 + 2];
      const x = camera.anchor.x + this.a[i * 3] * scale;
      const y = camera.anchor.y + this.a[i * 3 + 1] * scale;
      this.points[i * 2] = x;
      this.points[i * 2 + 1] = y;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return maxX >= 0 && minX <= camera.width && maxY >= 0 && minY <= camera.height;
  }

  private clip(count: number, plane: number, keepGreater: boolean): number {
    let written = 0;
    for (let i = 0; i < count; i++) {
      const previous = ((i + count - 1) % count) * 3;
      const current = i * 3;
      const prevDepth = this.a[previous + 2], depth = this.a[current + 2];
      const prevInside = keepGreater ? prevDepth >= plane : prevDepth <= plane;
      const inside = keepGreater ? depth >= plane : depth <= plane;
      if (prevInside !== inside) {
        const t = (plane - prevDepth) / (depth - prevDepth);
        this.b[written++] = this.a[previous] + t * (this.a[current] - this.a[previous]);
        this.b[written++] = this.a[previous + 1] + t * (this.a[current + 1] - this.a[previous + 1]);
        this.b[written++] = plane;
      }
      if (inside) {
        this.b[written++] = this.a[current];
        this.b[written++] = this.a[current + 1];
        this.b[written++] = depth;
      }
    }
    const swap = this.a; this.a = this.b; this.b = swap;
    return written / 3;
  }

  path(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(this.points[0], this.points[1]);
    for (let i = 1; i < this.count; i++) ctx.lineTo(this.points[i * 2], this.points[i * 2 + 1]);
    ctx.closePath();
  }
}
