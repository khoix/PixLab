import type { Level } from '../types';
import {
  perspectiveScale, projectedTileCorners, tileCenter, worldDepth, worldToScreen,
  type GroundPoint, type PerspectiveCamera,
} from './projection';

// The title screen navigates to /play without retaining its query string.
// Remember an explicit diagnostic request for this page load only.
const initialRequest = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('perspective') === '1';

export function isProjectionDiagnosticRequested(): boolean {
  const current = new URLSearchParams(window.location.search).get('perspective');
  return current === null ? initialRequest : current === '1';
}

/** Temporary ground-only camera inspection pass, enabled by ?perspective=1.
 * Bypasses the flat tile/fog/sprite caches without modifying their contents.
 * This is intentionally not the production voxel-world renderer.
 */
export function drawProjectionDiagnostic(
  ctx: CanvasRenderingContext2D,
  camera: PerspectiveCamera,
  level: Level,
): void {
  ctx.save();
  try {
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    const radius = 12;
    const minX = Math.max(0, Math.floor(camera.focus.x) - radius);
    const maxX = Math.min(level.width, Math.ceil(camera.focus.x) + radius);
    const minY = Math.max(0, Math.floor(camera.focus.y) - radius);
    const maxY = Math.min(level.height, Math.ceil(camera.focus.y) + radius);
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const corners = projectedTileCorners(camera, { x, y });
        if (!corners || corners.every(p => p.x < 0) || corners.every(p => p.x > camera.width)
          || corners.every(p => p.y < 0) || corners.every(p => p.y > camera.height)) continue;
        const tile = level.tiles[y][x];
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (const p of corners.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fillStyle = tile === 'wall' ? '#38445a' : tile === 'exit' ? '#175b4a' : '#101d2b';
        ctx.fill();
        ctx.strokeStyle = '#628093';
        ctx.stroke();
      }
    }
    const markers: { ground: GroundPoint; color: string; radius: number }[] = [
      ...level.entities.map(e => ({ ground: tileCenter(e.pos), color: '#ff627c', radius: 0.2 })),
      ...level.items.map(i => ({ ground: tileCenter(i.pos), color: '#ffd166', radius: 0.12 })),
      ...level.portals.map(p => ({ ground: tileCenter(p.pos), color: '#b594ff', radius: 0.25 })),
      { ground: camera.focus, color: '#05d9e8', radius: 0.25 },
    ];
    markers.sort((a, b) => worldDepth(camera, b.ground) - worldDepth(camera, a.ground));
    for (const marker of markers) {
      if (Math.abs(marker.ground.x - camera.focus.x) > radius
        || Math.abs(marker.ground.y - camera.focus.y) > radius) continue;
      const p = worldToScreen(camera, marker.ground);
      const scale = perspectiveScale(camera, marker.ground);
      if (!p || scale === null) continue;
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, marker.radius * camera.tileSize * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText('Perspective diagnostic · ground markers only', 12, 24);
  } finally {
    ctx.restore();
  }
}
