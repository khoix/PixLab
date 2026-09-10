import { writeCameraVertex, type PerspectiveCamera } from './projection';
import { ProjectedPolygon } from './projectedPolygon';

const TOP = [4, 5, 6, 7], FRONT = [3, 2, 6, 7], BACK = [1, 0, 4, 5];
const LEFT = [0, 3, 7, 4], RIGHT = [2, 1, 5, 6], QUAD = [0, 1, 2, 3];
const RING = Array.from({ length: 13 }, (_, i) => {
  const angle = i * Math.PI / 6;
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

/** Small raised props use the same clipped faces as the voxel world. Buffers
 * belong to pooled props; only projection changes as the camera follows. */
export class PerspectivePropGeometry {
  private vertices = new Float64Array(24);
  private polygon = new ProjectedPolygon();
  private face(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera,
    indices: readonly number[], color: string): void {
    if (!this.polygon.project(camera, this.vertices, indices)) return;
    this.polygon.path(ctx); ctx.fillStyle = color; ctx.fill();
  }
  box(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera, x: number, y: number,
    halfWidth: number, halfDepth: number, bottom: number, height: number,
    top: string, front: string, side: string): void {
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 4; i++) {
      writeCameraVertex(camera, x + (i === 1 || i === 2 ? halfWidth : -halfWidth),
        y + (i >= 2 ? halfDepth : -halfDepth), bottom + layer * height, this.vertices, (layer * 4 + i) * 3);
    }
    const eyeY = camera.focus.y + camera.distance * camera.cosPitch;
    if (eyeY > y + halfDepth) this.face(ctx, camera, FRONT, front);
    if (eyeY < y - halfDepth) this.face(ctx, camera, BACK, side);
    if (camera.focus.x < x - halfWidth) this.face(ctx, camera, LEFT, side);
    if (camera.focus.x > x + halfWidth) this.face(ctx, camera, RIGHT, side);
    this.face(ctx, camera, TOP, top);
  }
  /** A horizontal annulus or disc, optionally extruded above the ground. */
  ring(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera, x: number, y: number,
    outer: number, inner: number, height: number, top: string, side: string): void {
    const eyeX = camera.focus.x - x, eyeY = camera.focus.y + camera.distance * camera.cosPitch - y;
    if (height > 0) for (let i = 0; i < 12; i++) {
      const a = RING[i], b = RING[i + 1];
      const facing = (a.x + b.x) * eyeX + (a.y + b.y) * eyeY;
      const radius = facing > 0 ? outer : inner;
      if (radius === 0) continue;
      writeCameraVertex(camera, x + a.x * radius, y + a.y * radius, 0, this.vertices, 0);
      writeCameraVertex(camera, x + b.x * radius, y + b.y * radius, 0, this.vertices, 3);
      writeCameraVertex(camera, x + b.x * radius, y + b.y * radius, height, this.vertices, 6);
      writeCameraVertex(camera, x + a.x * radius, y + a.y * radius, height, this.vertices, 9);
      this.face(ctx, camera, QUAD, side);
    }
    for (let i = 0; i < 12; i++) {
      const a = RING[i], b = RING[i + 1];
      writeCameraVertex(camera, x + a.x * outer, y + a.y * outer, height, this.vertices, 0);
      writeCameraVertex(camera, x + b.x * outer, y + b.y * outer, height, this.vertices, 3);
      writeCameraVertex(camera, x + b.x * inner, y + b.y * inner, height, this.vertices, 6);
      writeCameraVertex(camera, x + a.x * inner, y + a.y * inner, height, this.vertices, 9);
      this.face(ctx, camera, QUAD, top);
    }
  }
}
