/**
 * M8.2 — the tap-to-enter-portal surface, minus the refs.
 *
 * `GameCanvas` held this as four closures over `levelRef`, `playerPosRef`,
 * `canvasRef` and `renderedCameraRef`, which made it untestable without a
 * canvas and a mounted component. The geometry does not need any of that: it
 * needs a level, a position and a camera. Those parts move here; what stays
 * behind is a thin adapter that reads the refs and calls these.
 *
 * Behaviour is unchanged — this is an extraction, and the M8.0 characterization
 * plus `m6-3-opt-in-portals` hold it to that.
 */

import type { Level, Portal, Position } from '../types';

/**
 * Tiles a tap may land on and still count.
 *
 * The player's own thumb covers the tile they are standing on, so the 3x3
 * around the portal is accepted. Entry is gated on actually standing on the
 * portal regardless, so this cannot reach a portal elsewhere on the map.
 */
export const PORTAL_TAP_FORGIVENESS_TILES = 1;

/** The portal on the tile `pos` occupies, or null. Compares floored tiles. */
export function portalAt(level: Pick<Level, 'portals'> | null, pos: Position): Portal | null {
  if (!level?.portals) return null;
  const px = Math.floor(pos.x);
  const py = Math.floor(pos.y);
  return level.portals.find((p) => Math.floor(p.pos.x) === px && Math.floor(p.pos.y) === py) ?? null;
}

/** Whether a tapped tile is close enough to the portal to count as a hit. */
export function tapHitsPortal(
  tile: Position,
  portalPos: Position,
  forgiveness: number = PORTAL_TAP_FORGIVENESS_TILES,
): boolean {
  const dx = Math.abs(tile.x - Math.floor(portalPos.x));
  const dy = Math.abs(tile.y - Math.floor(portalPos.y));
  return dx <= forgiveness && dy <= forgiveness;
}

/**
 * Floor tiles a portal may send the player to.
 *
 * Excludes the sector exit, so a portal can never skip the level. Everything
 * else — including the tile the portal itself is on — stays in, which is what
 * the original inline loop did and what `rollPortalDestination` expects to
 * weigh.
 */
export function portalDestinationCandidates(
  level: Pick<Level, 'tiles' | 'width' | 'height' | 'exitPos'>,
): Position[] {
  const candidates: Position[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.tiles[y]?.[x] !== 'floor') continue;
      if (x === level.exitPos.x && y === level.exitPos.y) continue;
      candidates.push({ x, y });
    }
  }
  return candidates;
}

/**
 * Where a canvas-space point lands, in tiles, under the legacy top-down camera.
 *
 * The perspective camera has its own projection (`projectedScreenToTile`) and
 * stays in the renderer; this is the branch that was inline arithmetic.
 */
export function legacyScreenToTile(
  screen: Position,
  legacyOffset: Position,
  tileSize: number,
): Position {
  return {
    x: Math.floor((screen.x + legacyOffset.x) / tileSize),
    y: Math.floor((screen.y + legacyOffset.y) / tileSize),
  };
}
