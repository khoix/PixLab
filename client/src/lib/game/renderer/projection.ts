import { resolveAnchorY } from './cameraAnchor';

export interface GroundPoint { x: number; y: number }

/** All ground distances use tiles; all screen distances use logical CSS pixels.
 * Ground (0, 0) is a tile corner. Entity positions need tileCenter() first.
 * +X is right, +Y is toward the camera. No yaw or isometric rotation.
 */
export const PERSPECTIVE_CAMERA = Object.freeze({
  pitchDegrees: 60,
  focalLengthTiles: 12,
  distanceTiles: 8,
  nearDepthTiles: 2,
  farDepthTiles: 48,
  anchorX: 0.5,
  anchorYDesktop: 0.5,
  anchorYMobile: 0.43,
});

export type PerspectiveSettings = { [Key in keyof typeof PERSPECTIVE_CAMERA]: number };
export interface PerspectiveCamera {
  readonly focus: GroundPoint;
  readonly anchor: GroundPoint;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly focalLength: number;
  readonly sinPitch: number;
  readonly cosPitch: number;
  readonly distance: number;
  readonly near: number;
  readonly far: number;
}

export function tileCenter(tile: GroundPoint): GroundPoint {
  return { x: tile.x + 0.5, y: tile.y + 0.5 };
}

export function createPerspectiveCamera(input: {
  player: GroundPoint;
  width: number;
  height: number;
  stableHeight?: number;
  isMobile: boolean;
  tileSize: number;
  settings?: Partial<PerspectiveSettings>;
}): PerspectiveCamera {
  const s = { ...PERSPECTIVE_CAMERA, ...input.settings };
  if (![...Object.values(s), input.width, input.height, input.tileSize,
    input.player.x, input.player.y, input.stableHeight ?? input.height].every(Number.isFinite)
    || input.width <= 0 || input.height <= 0 || input.tileSize <= 0
    || s.pitchDegrees <= 0 || s.pitchDegrees >= 90 || s.focalLengthTiles <= 0
    || s.nearDepthTiles <= 0 || s.distanceTiles <= s.nearDepthTiles
    || s.farDepthTiles <= s.distanceTiles
    || [s.anchorX, s.anchorYDesktop, s.anchorYMobile].some(n => n < 0 || n > 1)) {
    throw new RangeError('Invalid perspective camera settings');
  }
  const pitch = s.pitchDegrees * Math.PI / 180;
  return {
    focus: tileCenter(input.player),
    anchor: {
      x: input.width * s.anchorX,
      y: resolveAnchorY(input.height, input.stableHeight ?? input.height,
        input.isMobile ? s.anchorYMobile : s.anchorYDesktop),
    },
    width: input.width,
    height: input.height,
    tileSize: input.tileSize,
    focalLength: s.focalLengthTiles * input.tileSize,
    sinPitch: Math.sin(pitch),
    cosPitch: Math.cos(pitch),
    distance: s.distanceTiles,
    near: s.nearDepthTiles,
    far: s.farDepthTiles,
  };
}

/** Camera-space depth in tile units. Sort descending for far-to-near painting. */
export function worldDepth(camera: PerspectiveCamera, ground: GroundPoint): number {
  return camera.distance - (ground.y - camera.focus.y) * camera.cosPitch;
}

/** Dimensionless size relative to a legacy TILE_SIZE sprite. Clip, never clamp
 * scale: clamping would break straight perspective lines and inverse picking.
 */
export function perspectiveScale(camera: PerspectiveCamera, ground: GroundPoint): number | null {
  const depth = worldDepth(camera, ground);
  if (!Number.isFinite(depth) || depth < camera.near || depth > camera.far) return null;
  return camera.focalLength / (depth * camera.tileSize);
}

export function worldToScreen(camera: PerspectiveCamera, ground: GroundPoint): GroundPoint | null {
  const scale = perspectiveScale(camera, ground);
  if (scale === null || !Number.isFinite(ground.x)) return null;
  const pixelsPerTile = scale * camera.tileSize;
  return {
    x: camera.anchor.x + (ground.x - camera.focus.x) * pixelsPerTile,
    y: camera.anchor.y + (ground.y - camera.focus.y) * camera.sinPitch * pixelsPerTile,
  };
}

/** Analytic ray/ground intersection. Null at/above the horizon or outside the
 * depth clip planes. Off-viewport X is allowed for culling and geometry work.
 */
export function screenToGround(camera: PerspectiveCamera, screen: GroundPoint): GroundPoint | null {
  if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
  const sy = screen.y - camera.anchor.y;
  const denominator = camera.focalLength * camera.sinPitch + sy * camera.cosPitch;
  if (denominator <= 1e-9) return null;
  const dy = sy * camera.distance / denominator;
  const groundY = camera.focus.y + dy;
  const depth = worldDepth(camera, { x: 0, y: groundY });
  // Small tolerance allows points exactly on clip planes to round-trip.
  if (depth < camera.near - 1e-9 || depth > camera.far + 1e-9) return null;
  return {
    x: camera.focus.x + (screen.x - camera.anchor.x) * depth / camera.focalLength,
    y: groundY,
  };
}

export function screenToTile(camera: PerspectiveCamera, screen: GroundPoint): GroundPoint | null {
  const ground = screenToGround(camera, screen);
  return ground ? { x: Math.floor(ground.x), y: Math.floor(ground.y) } : null;
}

/** Clockwise TL, TR, BR, BL on the ground. A tile crossing a clip plane is
 * omitted for now; polygon clipping belongs with the Execution 2 world pass.
 */
export function projectedTileCorners(camera: PerspectiveCamera, tile: GroundPoint): GroundPoint[] | null {
  const corners = [tile, { x: tile.x + 1, y: tile.y },
    { x: tile.x + 1, y: tile.y + 1 }, { x: tile.x, y: tile.y + 1 }]
    .map(point => worldToScreen(camera, point));
  return corners.every((point): point is GroundPoint => point !== null) ? corners : null;
}

/** Client pointer -> logical canvas pixel; DPR is deliberately absent. */
export function clientToCanvas(
  client: GroundPoint,
  rect: { left: number; top: number; width: number; height: number },
  logical: { width: number; height: number },
): GroundPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (client.x - rect.left) * logical.width / rect.width;
  const y = (client.y - rect.top) * logical.height / rect.height;
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= 0 && y >= 0 && x < logical.width && y < logical.height ? { x, y } : null;
}
