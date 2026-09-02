import type { DamageNumber, Entity, Level, Position } from '../types';

export const HIT_FLASH_MS = 160;
export const DAMAGE_NUMBER_LIFETIME_MS = 750;

let damageNumberCounter = 0;

export function spawnDamageNumber(
  level: Level,
  pos: Position,
  amount: number,
  now: number,
  isCrit = false,
): void {
  if (!level.damageNumbers) {
    level.damageNumbers = [];
  }

  level.damageNumbers.push({
    id: `dmg-${now}-${damageNumberCounter++}`,
    pos: { x: pos.x, y: pos.y },
    amount: Math.max(1, Math.floor(amount)),
    createdAt: now,
    lifetime: DAMAGE_NUMBER_LIFETIME_MS,
    isCrit,
  });
}

export function applyEnemyHitFeedback(
  level: Level,
  enemy: Entity,
  amount: number,
  now: number,
  isCrit = false,
): void {
  enemy.hitFlashUntil = now + HIT_FLASH_MS;
  spawnDamageNumber(level, enemy.pos, amount, now, isCrit);
}

export function updateDamageNumbers(level: Level, now: number): void {
  if (!level.damageNumbers?.length) return;
  level.damageNumbers = level.damageNumbers.filter(
    (entry: DamageNumber) => now - entry.createdAt < entry.lifetime,
  );
}
