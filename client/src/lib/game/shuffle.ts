/**
 * Fisher-Yates, replacing three `sort(() => Math.random() - 0.5)` shuffles.
 *
 * That idiom is wrong twice over, and M8.0's characterization harness is what
 * made both visible.
 *
 * **It has no defined result.** `Array.prototype.sort` is specified only for a
 * *consistent* comparator — one that gives the same answer for the same pair
 * every time. A comparator returning fresh randomness is not consistent, so
 * ECMAScript says nothing about what comes out; the answer is whatever the
 * engine's sort algorithm happens to do with it. Three correct comparison
 * sorts, handed the identical seeded comparator stream over 64 elements:
 *
 *     insertion    111 comparator calls   1,2,3,5,4,0,6,7
 *     merge        282 comparator calls   1,34,29,36,59,8,61,57
 *     V8 builtin   288 comparator calls   30,45,46,6,24,26,35,7
 *
 * No two agree, and the call counts differ — so the RNG stream position after
 * the shuffle differs too, which moves every value drawn afterwards. This broke
 * the M8.0 baselines across machines: identical maze, roster and exit, and
 * different item drops, because CI ran Chrome 151 against this container's
 * Chrome 141.
 *
 * **It is also biased.** Look at the insertion-sort row: the first eight
 * elements are almost in their original order. Whatever a given engine does
 * with a short array, the result leans toward the input order rather than
 * being uniform, and `validItemPositions` is built by scanning y then x — so
 * drops clustered toward the top-left of the maze. Nobody would have caught
 * that by playing; it took a seeded harness to compare runs against.
 *
 * Fisher-Yates is uniform, O(n), and defined by its own loop rather than by
 * the host's sort. It draws exactly `length - 1` values, which also makes the
 * stream position after a shuffle predictable.
 */

/**
 * Shuffle `items` uniformly in place and return it.
 *
 * Takes the array it is given rather than copying: every caller already spreads
 * into a fresh array to avoid mutating the source, and a second copy here would
 * be waste on a path that runs during level generation.
 */
export function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    // `i + 1`, not `i` — the element at `i` must be able to stay put, or the
    // shuffle is a random derangement instead of a uniform permutation.
    const j = Math.floor(Math.random() * (i + 1));
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
  return items;
}
