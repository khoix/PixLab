/**
 * M8.2 — the keyboard half of the input surface, as one table.
 *
 * It was written twice in `Game.tsx`: four `if` statements mapping keys to a
 * direction on keydown, and a separate twelve-entry `Set` on keyup deciding
 * whether to clear. Two lists of the same twelve keys, three hundred lines
 * apart, with nothing tying them together — add a key binding to one and the
 * other silently disagrees. Both now derive from `KEY_DIRECTIONS`.
 *
 * ## A behaviour this preserves rather than fixes
 *
 * Releasing *any* movement key clears the whole direction, even while another
 * is still held: hold Right, tap and release Up, and the player stops. The
 * keydown path has the matching shape — one event sets one direction, so
 * pressing Up while holding Right replaces rather than combines.
 *
 * That is the current behaviour and M8.2 is an extraction, so it stays. Fixing
 * it means tracking the held set and recomputing on each event, which changes
 * what the game does and belongs in a stage that re-records the M8.0 baselines.
 * `directionFromHeldKeys` below is the shape that fix would take; nothing calls
 * it yet, and the test says so.
 */

export interface Direction {
  x: number;
  y: number;
}

/**
 * Every key that moves the player, and where it moves them.
 *
 * Case-sensitive entries for both cases rather than lowercasing the incoming
 * key: `KeyboardEvent.key` is `'W'` with shift or caps lock, and the original
 * keyup set listed both, so matching that exactly keeps the extraction honest.
 */
export const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = Object.freeze({
  ArrowUp: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  W: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  S: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  A: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
  D: { x: 1, y: 0 },
});

/** The direction a key commands, or null if it is not a movement key. */
export function directionForKey(key: string): Direction | null {
  const dir = KEY_DIRECTIONS[key];
  return dir ? { ...dir } : null;
}

/** Whether a key press or release should affect movement at all. */
export function isMovementKey(key: string): boolean {
  return key in KEY_DIRECTIONS;
}

/**
 * What the direction *would* be if held keys combined — the shape the fix for
 * the note above takes.
 *
 * Sums the held keys and clamps each axis, so Right+Up is a diagonal and
 * Left+Right cancels. Deliberately unused: adopting it changes movement, which
 * needs its own stage and re-recorded baselines.
 */
export function directionFromHeldKeys(held: readonly string[]): Direction {
  // An array rather than a Set: the project targets ES5 without
  // downlevelIteration, so iterating a Set here is a compile error.
  let x = 0;
  let y = 0;
  for (let i = 0; i < held.length; i++) {
    const dir = KEY_DIRECTIONS[held[i]];
    if (!dir) continue;
    x += dir.x;
    y += dir.y;
  }
  return { x: Math.sign(x), y: Math.sign(y) };
}
