import type { Entity, Position } from '../types';

export const RANGED_TELEGRAPH_MS = 450;
export const BOSS_RANGED_TELEGRAPH_MS = 550;

export function cardinalVelocityToward(from: Position, to: Position): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx > absDy) {
    return { x: Math.sign(dx) || 1, y: 0 };
  }
  return { x: 0, y: Math.sign(dy) || 1 };
}

export function isAttackTelegraphActive(entity: Entity, now: number): boolean {
  return entity.attackTelegraphUntil !== undefined && now < entity.attackTelegraphUntil;
}

export function beginAttackTelegraph(
  entity: Entity,
  now: number,
  playerPos: Position,
  durationMs: number,
): Partial<Entity> {
  return {
    attackTelegraphUntil: now + durationMs,
    attackTelegraphVelocity: cardinalVelocityToward(entity.pos, playerPos),
  };
}

export function completeAttackTelegraph(
  entity: Entity,
  now: number,
  onFire: (velocity: { x: number; y: number }) => void,
): Partial<Entity> {
  if (!entity.attackTelegraphUntil || !entity.attackTelegraphVelocity) {
    return {};
  }
  if (now < entity.attackTelegraphUntil) {
    return {};
  }

  onFire(entity.attackTelegraphVelocity);
  return {
    lastAttackTime: now,
    attackTelegraphUntil: undefined,
    attackTelegraphVelocity: undefined,
  };
}
