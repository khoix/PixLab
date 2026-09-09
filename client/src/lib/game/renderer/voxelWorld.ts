import type { Level } from '../types';
import type { ColorPalette } from '../colorThemes';
import type { EffectiveRenderQuality } from '../renderQuality';
import { visiblePlaneBounds, writeCameraVertex, type PerspectiveCamera, type WorldBounds } from './projection';
import { ProjectedPolygon } from './projectedPolygon';
import { compareWorldOrder, WALL_HEIGHT, WALL_SIDE, WorldTopology, type WallRecord, type WorldDrawable } from './worldGeometry';

const QUAD = [0, 1, 2, 3];
const emptyBounds = (): WorldBounds => ({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
function tint(hex: string, factor: number, lift = 0): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(Math.max(0, Math.min(255, ((n >> shift) & 255) * factor + lift)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export interface WorldRenderStats {
  levelNumber: number;
  cacheBuilds: number; tileEdits: number; visibleTiles: number; projectedVertices: number;
  walls: number; faces: number; drawables: number; quality: EffectiveRenderQuality;
}

/** Canvas voxel pass. Ground/top lattice vertices are transformed once per
 * visible frame and shared by adjoining faces. Buffers and queue are reused.
 */
export class VoxelWorldRenderer {
  readonly topology = new WorldTopology();
  private groundBounds = emptyBounds();
  private topBounds = emptyBounds();
  private bounds = emptyBounds();
  private vertices = new Float64Array(0);
  private quad = new Int32Array(4);
  private contactVertices = new Float64Array(12);
  private polygon = new ProjectedPolygon();
  private queue: (WallRecord | WorldDrawable)[] = [];
  private camera!: PerspectiveCamera;
  private occlusionMask: Path2D | null = null;
  private compare = (a: WallRecord | WorldDrawable, b: WallRecord | WorldDrawable) => compareWorldOrder(this.camera, a, b);
  private paletteKey = '';
  private colors = { floor: '', alternate: '', top: '', front: '', side: '', back: '' };
  private stats: WorldRenderStats = {
    levelNumber: 0, cacheBuilds: 0, tileEdits: 0, visibleTiles: 0, projectedVertices: 0,
    walls: 0, faces: 0, drawables: 0, quality: 'high',
  };

  getStats(): WorldRenderStats { return { ...this.stats }; }

  private prepare(camera: PerspectiveCamera, level: Level, theme: ColorPalette): void {
    this.camera = camera;
    visiblePlaneBounds(camera, 0, this.groundBounds);
    visiblePlaneBounds(camera, WALL_HEIGHT, this.topBounds);
    const b = this.bounds, g = this.groundBounds, t = this.topBounds;
    b.minX = Math.max(0, Math.floor(Math.min(g.minX, t.minX)) - 1);
    b.minY = Math.max(0, Math.floor(Math.min(g.minY, t.minY)) - 1);
    b.maxX = Math.min(level.width, Math.ceil(Math.max(g.maxX, t.maxX)) + 1);
    b.maxY = Math.min(level.height, Math.ceil(Math.max(g.maxY, t.maxY)) + 1);
    this.topology.sync(level, b);
    const latticeSize = (level.width + 1) * (level.height + 1);
    if (this.vertices.length !== latticeSize * 6) this.vertices = new Float64Array(latticeSize * 6);
    let projected = 0;
    for (let y = b.minY; y <= b.maxY; y++) {
      for (let x = b.minX; x <= b.maxX; x++) {
        const index = y * (level.width + 1) + x;
        writeCameraVertex(camera, x, y, 0, this.vertices, index * 3);
        writeCameraVertex(camera, x, y, WALL_HEIGHT, this.vertices, (index + latticeSize) * 3);
        projected += 2;
      }
    }
    const key = `${theme.wall}:${theme.floor}`;
    if (key !== this.paletteKey) {
      this.paletteKey = key;
      this.colors = { floor: theme.floor, alternate: tint(theme.floor, 1, 1.5),
        top: tint(theme.wall, 1, 20), front: tint(theme.wall, 0.87, 2),
        side: tint(theme.wall, 0.68, 1), back: tint(theme.wall, 0.76, 1) };
    }
    this.stats.cacheBuilds = this.topology.builds;
    this.stats.levelNumber = level.levelNumber;
    this.stats.tileEdits = this.topology.edits;
    this.stats.visibleTiles = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
    this.stats.projectedVertices = projected;
    this.stats.walls = this.stats.faces = this.stats.drawables = 0;
  }

  private face(ctx: CanvasRenderingContext2D, a: number, b: number, c: number, d: number, color: string, seal = false): boolean {
    this.quad[0] = a; this.quad[1] = b; this.quad[2] = c; this.quad[3] = d;
    if (!this.polygon.project(this.camera, this.vertices, this.quad)) return false;
    this.polygon.path(ctx);
    ctx.fillStyle = color;
    ctx.fill();
    if (this.occlusionMask) {
      const p = this.polygon.points, count = this.polygon.count;
      // All subpaths need the same winding so overlapping top/side faces
      // form a union instead of cancelling holes in the navigation hint mask.
      let area = 0;
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        area += p[i * 2] * p[next * 2 + 1] - p[next * 2] * p[i * 2 + 1];
      }
      this.occlusionMask.moveTo(p[0], p[1]);
      for (let i = 1; i < count; i++) {
        const index = area < 0 ? count - i : i;
        this.occlusionMask.lineTo(p[index * 2], p[index * 2 + 1]);
      }
      this.occlusionMask.closePath();
    }
    // Same-color subpixel seam coverage, not a contrasting block outline.
    if (seal) { ctx.strokeStyle = color; ctx.lineWidth = 0.65; ctx.stroke(); }
    return true;
  }

  private contact(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    const v = this.contactVertices, camera = this.camera;
    writeCameraVertex(camera, x0, y0, 0, v, 0);
    writeCameraVertex(camera, x1, y0, 0, v, 3);
    writeCameraVertex(camera, x1, y1, 0, v, 6);
    writeCameraVertex(camera, x0, y1, 0, v, 9);
    if (!this.polygon.project(camera, v, QUAD)) return;
    this.polygon.path(ctx); ctx.fill();
  }

  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera, level: Level,
    theme: ColorPalette, quality: EffectiveRenderQuality, drawables: readonly WorldDrawable[] = []): void {
    this.prepare(camera, level, theme);
    this.occlusionMask = null;
    this.stats.quality = quality;
    const { minX, minY, maxX, maxY } = this.bounds;
    if (minX >= maxX || minY >= maxY) return;
    const stride = level.width + 1, top = stride * (level.height + 1);
    const colors = this.colors, kinds = this.topology.kinds;
    ctx.save();
    try {
      ctx.shadowBlur = 0;
      // Continuous projected ground undercoat prevents antialiasing cracks
      // between separately rasterized tile polygons, at every quality/DPR.
      this.face(ctx, minY * stride + minX, minY * stride + maxX,
        maxY * stride + maxX, maxY * stride + minX, colors.floor);
      this.queue.length = 0;
      for (let y = minY; y < maxY; y++) {
        for (let x = minX; x < maxX; x++) {
          const id = y * level.width + x, a = y * stride + x;
          if (kinds[id] === 1) { this.queue.push(this.topology.records[id]); continue; }
          if (this.face(ctx, a, a + 1, a + stride + 1, a + stride, (x + y) % 2 ? colors.alternate : colors.floor)) {
            ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 0.6; ctx.stroke();
          }
        }
      }
      // Contact shading stays on the ground, never a screen-space blur. Low
      // quality uses one narrow band; other tiers add a faint outer band.
      for (let y = minY; y < maxY; y++) {
        for (let x = minX; x < maxX; x++) {
          const id = y * level.width + x;
          if (kinds[id] === 1) continue;
          const bands = quality === 'low' ? 1 : 2;
          for (let band = bands - 1; band >= 0; band--) {
            const width = band === 0 ? 0.07 : 0.17;
            ctx.fillStyle = band === 0 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)';
            if (y > 0 && kinds[id - level.width] === 1) this.contact(ctx, x, y, x + 1, y + width);
            if (y + 1 < level.height && kinds[id + level.width] === 1) this.contact(ctx, x, y + 1 - width, x + 1, y + 1);
            if (x > 0 && kinds[id - 1] === 1) this.contact(ctx, x, y, x + width, y + 1);
            if (x + 1 < level.width && kinds[id + 1] === 1) this.contact(ctx, x + 1 - width, y, x + 1, y + 1);
          }
        }
      }
      for (const drawable of drawables) {
        if (drawable.x >= minX - 2 && drawable.x <= maxX + 2 && drawable.y >= minY - 2 && drawable.y <= maxY + 2) {
          this.queue.push(drawable); this.stats.drawables++;
          drawable.drawGround?.(ctx, camera);
        }
      }
      this.queue.sort(this.compare);
      const eyeX = camera.focus.x, eyeY = camera.focus.y + camera.distance * camera.cosPitch;
      let playerHint: WorldDrawable | undefined;
      for (const entry of this.queue) {
        if ('draw' in entry) {
          entry.draw(ctx, camera);
          if (entry.drawOccluded) {
            playerHint = entry;
            this.occlusionMask = new Path2D();
          }
          continue;
        }
        const { col: x, row: y } = entry;
        const a = y * stride + x, b = a + 1, d = a + stride, c = d + 1;
        const mask = this.topology.exposed[y * level.width + x];
        let faces = 0;
        if ((mask & WALL_SIDE.south) && eyeY > y + 1) faces += +this.face(ctx, d, c, c + top, d + top, colors.front, true);
        if ((mask & WALL_SIDE.north) && eyeY < y) faces += +this.face(ctx, b, a, a + top, b + top, colors.back, true);
        if ((mask & WALL_SIDE.west) && eyeX < x) faces += +this.face(ctx, a, d, d + top, a + top, colors.side, true);
        if ((mask & WALL_SIDE.east) && eyeX > x + 1) faces += +this.face(ctx, c, b, b + top, c + top, colors.side, true);
        faces += +this.face(ctx, a + top, b + top, c + top, d + top, colors.top, true);
        if (faces > 0) this.stats.walls++;
        this.stats.faces += faces;
      }
      if (playerHint && this.occlusionMask) {
        ctx.save();
        ctx.clip(this.occlusionMask);
        playerHint.drawOccluded!(ctx, camera);
        ctx.restore();
      }
      for (const entry of this.queue) if ('draw' in entry) entry.drawOverlay?.(ctx, camera);
    } finally { this.occlusionMask = null; ctx.restore(); }
  }
}
