/**
 * M8.6 — "drop what has expired", written once.
 *
 * Four passes in `update()` were the same eleven lines: build a new array, walk
 * the old one, `continue` past anything older than its lifetime, assign the
 * result back. Particles, footprints and afterimages differ only in what else
 * they do on the way past, and projectiles only in how much else.
 *
 * The rule is **strictly past**: an item exactly at its lifetime is still
 * alive. That is a one-frame difference nobody would notice in play and a
 * guaranteed off-by-one the moment two copies of the comparison disagree, which
 * is the argument for having one copy.
 *
 * Rebuilding rather than splicing is kept deliberately. The renderer holds the
 * array it was given for the length of a frame, and splicing under it is how a
 * particle pass turns into a flicker.
 */

/** Anything with a birthday and a span. */
export interface Perishable {
  createdAt: number;
  lifetime: number;
}

/** True once `now` is past the item's span. Exactly at it is still alive. */
export function hasExpired(item: Perishable, now: number): boolean {
  return now - item.createdAt > item.lifetime;
}

/**
 * A new array with the expired entries left behind.
 *
 * Takes `undefined` because several of these fields are optional on `Level` and
 * every caller was opening with the same "ensure the array exists" guard.
 */
export function dropExpired<T extends Perishable>(items: T[] | undefined, now: number): T[] {
  if (!items) return [];
  const kept: T[] = [];
  for (const item of items) {
    if (!hasExpired(item, now)) kept.push(item);
  }
  return kept;
}
