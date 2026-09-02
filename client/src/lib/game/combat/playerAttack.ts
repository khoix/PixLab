/** Player attack cadence — decoupled from movement speed (M6). */

/** Base attacks per second at nominal gear; movement speed no longer scales DPS. */
export const PLAYER_ATTACKS_PER_SECOND = 2.0;

/** Minimum milliseconds between player auto-attacks while moving. */
export const PLAYER_ATTACK_COOLDOWN_MS = 1000 / PLAYER_ATTACKS_PER_SECOND;

export function getPlayerMoveDelayMs(speed: number): number {
  const clampedSpeed = Math.max(0.25, speed);
  return 1000 / (clampedSpeed * 4);
}

export function canPlayerAttack(lastAttackMs: number, now: number): boolean {
  return now - lastAttackMs >= PLAYER_ATTACK_COOLDOWN_MS;
}
