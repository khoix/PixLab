import { COLORS, TILE_SIZE } from '../constants';
import type { Entity } from '../types';
import { perspectiveScale, worldToScreen, type GroundPoint, type PerspectiveCamera } from './projection';

/** Semantic ink bounds, excluding glow. Bodies stay upright; their lowest art
 * point touches the floor. In particular, a Phase's tail isn't a circle foot. */
export function entityAppearance(entity: Entity | null) {
  if (!entity) return { color: COLORS.player, size: 20, bottom: 10, top: 10 };
  const subtype = entity.mobSubtype;
  let size = TILE_SIZE - 8;
  if (entity.isBoss) size = TILE_SIZE - 4;
  else if (subtype === 'swarm') size = TILE_SIZE - 12;
  else if (subtype === 'moth') size = TILE_SIZE - 18;
  else if (subtype === 'guardian' || subtype === 'turret' || subtype === 'cerberus') size = TILE_SIZE - 6;
  const color = entity.isBoss
    ? COLORS[subtype as keyof typeof COLORS] || COLORS.boss
    : COLORS[`mob_${subtype}` as keyof typeof COLORS] || COLORS.enemy;
  const bottom = !entity.isBoss && subtype === 'phase' ? 5 / 6
    : subtype === 'turret' ? 0.525 : subtype === 'moth' ? 1 / 3
    : subtype === 'guardian' ? 0.35 : subtype === 'swarm' ? 0.56 : 0.5;
  const top = subtype === 'phase' ? 0.625 : subtype === 'moth' ? 1 / 3
    : subtype === 'turret' ? 0.3 : subtype === 'swarm' ? 0.56 : 0.5;
  return { color, size, bottom: size * bottom, top: size * top };
}

export function billboardLayout(camera: PerspectiveCamera, foot: GroundPoint,
  appearance: ReturnType<typeof entityAppearance>) {
  const ground = worldToScreen(camera, foot), scale = perspectiveScale(camera, foot);
  if (!ground || scale === null) return null;
  const centerY = ground.y - appearance.bottom * scale;
  return { x: ground.x, footY: ground.y, centerY, scale,
    topY: centerY - appearance.top * scale,
    barWidth: Math.max(18, Math.min(48, 28 * scale)) };
}

/** Project a world vector locally instead of rotating the upright face. This
 * includes the inward/outward skew of depth directions away from screen center. */
export function projectedDirection(camera: PerspectiveCamera, foot: GroundPoint, direction: GroundPoint) {
  const length = Math.hypot(direction.x, direction.y);
  if (length < 1e-6) return null;
  const a = worldToScreen(camera, foot);
  const b = worldToScreen(camera, { x: foot.x + direction.x / length * 0.25,
    y: foot.y + direction.y / length * 0.25 });
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y, screenLength = Math.hypot(dx, dy);
  return screenLength > 1e-6 ? { x: dx / screenLength, y: dy / screenLength } : null;
}
