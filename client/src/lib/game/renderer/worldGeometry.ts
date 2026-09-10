import type { Level } from '../types';
import { worldDepth, type GroundPoint, type PerspectiveCamera, type WorldBounds } from './projection';

export const WALL_HEIGHT = 1;
export const WALL_SIDE = { north: 1, east: 2, south: 4, west: 8 } as const;
export interface WorldOrderEntry extends GroundPoint { orderId: number }

/** Ground-depth painter ordering. At equal depth, lateral blocks farther from
 * the eye draw first. The stable ID resolves exact ties without frame jitter.
 * Upright entity bodies and walls share this queue; overlays are screen-facing.
 */
export function compareWorldOrder(camera: PerspectiveCamera, a: WorldOrderEntry, b: WorldOrderEntry): number {
  return worldDepth(camera, b) - worldDepth(camera, a)
    || Math.abs(b.x - camera.focus.x) - Math.abs(a.x - camera.focus.x)
    || a.orderId - b.orderId;
}

export interface WorldDrawable extends WorldOrderEntry {
  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void;
  /** Floor-plane shadows / directional cues, before any raised geometry. */
  drawGround?(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void;
  drawOverlay?(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void;
  /** Player-only navigation hint, clipped to wall faces painted after its body. */
  drawOccluded?(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void;
}
export interface WallRecord extends WorldOrderEntry { col: number; row: number }

/** Cache only topology and reusable world records, never a projected bitmap.
 * Check the visible region for in-place tile edits (e.g. boss-created exits).
 */
export class WorldTopology {
  private level: Level | null = null;
  private tiles: Level['tiles'] | null = null;
  width = 0;
  height = 0;
  kinds = new Uint8Array(0);
  exposed = new Uint8Array(0);
  records: WallRecord[] = [];
  builds = 0;
  edits = 0;

  private kind(level: Level, x: number, y: number): number {
    return level.tiles[y][x] === 'wall' ? 1 : level.tiles[y][x] === 'exit' ? 2 : 0;
  }

  private updateMask(level: Level, x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const wall = (xx: number, yy: number) => level.tiles[yy]?.[xx] === 'wall';
    this.exposed[y * this.width + x] = !wall(x, y) ? 0
      : (wall(x, y - 1) ? 0 : WALL_SIDE.north) | (wall(x + 1, y) ? 0 : WALL_SIDE.east)
      | (wall(x, y + 1) ? 0 : WALL_SIDE.south) | (wall(x - 1, y) ? 0 : WALL_SIDE.west);
  }

  sync(level: Level, bounds: WorldBounds): void {
    if (this.level !== level || this.tiles !== level.tiles || this.width !== level.width || this.height !== level.height) {
      this.level = level; this.tiles = level.tiles;
      this.width = level.width; this.height = level.height;
      this.kinds = new Uint8Array(this.width * this.height);
      this.exposed = new Uint8Array(this.kinds.length);
      this.records = new Array(this.kinds.length);
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const id = y * this.width + x;
          this.kinds[id] = this.kind(level, x, y);
          this.records[id] = { col: x, row: y, x: x + 0.5, y: y + 0.5, orderId: id };
          this.updateMask(level, x, y);
        }
      }
      this.builds++;
      return;
    }
    for (let y = Math.max(0, bounds.minY - 1); y < Math.min(this.height, bounds.maxY + 1); y++) {
      for (let x = Math.max(0, bounds.minX - 1); x < Math.min(this.width, bounds.maxX + 1); x++) {
        const id = y * this.width + x, kind = this.kind(level, x, y);
        if (kind === this.kinds[id]) continue;
        this.kinds[id] = kind;
        this.updateMask(level, x, y);
        this.updateMask(level, x - 1, y); this.updateMask(level, x + 1, y);
        this.updateMask(level, x, y - 1); this.updateMask(level, x, y + 1);
        this.edits++;
      }
    }
  }
}
