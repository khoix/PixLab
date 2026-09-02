// Fictional "boot log" lines shown under the title-screen progress bar. They
// stand in for the real work (caching music) so the player sees the broadcast
// coming online rather than a file count.

export const PRELOAD_STATUS_LINES = [
  'CALIBRATING CARRIER SIGNAL',
  'MAPPING CATACOMB SECTORS',
  'SYNCING ROGUE PROTOCOL',
  'ALIGNING LABYRINTH GEOMETRY',
  'CHARGING FOG EMITTERS',
  'DECRYPTING VENDOR LEDGER',
  'WAKING CERBERUS SUBROUTINES',
  'REINFORCING SECTOR TIMERS',
  'HANDSHAKE WITH BROADCAST TOWER',
] as const;

export const PRELOAD_STATUS_DONE = 'SIGNAL LOCKED';
export const PRELOAD_STATUS_DEGRADED = 'FALLING BACK TO LIVE FEED';

/** How often the log advances on its own while a download is stalled. */
export const PRELOAD_STATUS_TICK_MS = 650;

export type PreloadStatusOutcome = 'loading' | 'done' | 'error';

/**
 * Picks the line to show. Progress pulls the log forward; elapsed ticks let it
 * keep marching during a stall; it never reaches the final line until the
 * preload actually settles, so the log can't lie about being finished.
 */
export function pickPreloadStatusLine(progress: number, ticks: number, outcome: PreloadStatusOutcome): string {
  if (outcome === 'done') return PRELOAD_STATUS_DONE;
  if (outcome === 'error') return PRELOAD_STATUS_DEGRADED;

  const lastIndex = PRELOAD_STATUS_LINES.length - 1;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const fromProgress = Math.floor(clamped * lastIndex);
  const fromTime = Math.max(0, Math.floor(ticks));
  const index = Math.min(lastIndex, Math.max(fromProgress, fromTime));
  return PRELOAD_STATUS_LINES[index];
}
