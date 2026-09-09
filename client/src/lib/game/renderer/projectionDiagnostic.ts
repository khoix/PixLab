import type { Level } from '../types';
import { perspectiveScale, worldToScreen, type PerspectiveCamera } from './projection';
import type { WorldDrawable } from './worldGeometry';

// The title screen navigates to /play without retaining its query string.
// Remember an explicit perspective request for this page load only.
const initialRequest = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('perspective') === '1';

export function isProjectionDiagnosticRequested(): boolean {
  const current = new URLSearchParams(window.location.search).get('perspective');
  return current === null ? initialRequest : current === '1';
}

/** Temporary Execution 1 markers, now submitted to the wall depth queue.
 * Replace this adapter with entity artwork in Execution 3, not the world pass.
 */
class GroundMarker implements WorldDrawable {
  x = 0;
  y = 0;
  orderId = 0;
  color = '';
  radius = 0;
  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    const p = worldToScreen(camera, this);
    const scale = perspectiveScale(camera, this);
    if (!p || scale === null) return;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.radius * camera.tileSize * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

export class PerspectiveMarkers {
  private pool: GroundMarker[] = [];
  private active: GroundMarker[] = [];

  private add(x: number, y: number, color: string, radius: number, baseId: number): void {
    const index = this.active.length;
    const marker = this.pool[index] ?? (this.pool[index] = new GroundMarker());
    marker.x = x; marker.y = y; marker.color = color; marker.radius = radius;
    marker.orderId = baseId + index;
    this.active.push(marker);
  }

  prepare(level: Level, camera: PerspectiveCamera): readonly WorldDrawable[] {
    this.active.length = 0;
    const baseId = level.width * level.height;
    for (const e of level.entities) this.add(e.pos.x + 0.5, e.pos.y + 0.5, '#ff627c', 0.2, baseId);
    for (const i of level.items) this.add(i.pos.x + 0.5, i.pos.y + 0.5, '#ffd166', 0.12, baseId);
    for (const p of level.portals) this.add(p.pos.x + 0.5, p.pos.y + 0.5, '#b594ff', 0.25, baseId);
    if (level.tiles[level.exitPos.y]?.[level.exitPos.x] === 'exit') {
      this.add(level.exitPos.x + 0.5, level.exitPos.y + 0.5, '#42d69b', 0.2, baseId);
    }
    this.add(camera.focus.x, camera.focus.y, '#05d9e8', 0.25, baseId);
    return this.active;
  }
}
