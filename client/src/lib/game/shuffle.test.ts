import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffleInPlace } from './shuffle';

/** mulberry32 — the same generator the M8.0 replay harness seeds with. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeed<T>(seed: number, body: () => T): T {
  const real = Math.random;
  Math.random = seeded(seed);
  try {
    return body();
  } finally {
    Math.random = real;
  }
}

test('a permutation, not a sample: same members, same length', () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = withSeed(1, () => shuffleInPlace([...input]));
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
});

test('one seed, one ordering', () => {
  const input = Array.from({ length: 64 }, (_, i) => i);
  const a = withSeed(0xbeef, () => shuffleInPlace([...input]));
  const b = withSeed(0xbeef, () => shuffleInPlace([...input]));
  assert.deepEqual(a, b);
});

test('draws exactly length - 1 values, so the stream position is predictable', () => {
  // Level generation continues drawing after a shuffle. If the number of draws
  // depended on the data, everything downstream would move with it — which is
  // exactly what the `sort` comparator did.
  for (const n of [1, 2, 5, 50, 407]) {
    let draws = 0;
    const real = Math.random;
    const rng = seeded(7);
    Math.random = () => {
      draws++;
      return rng();
    };
    try {
      shuffleInPlace(Array.from({ length: n }, (_, i) => i));
    } finally {
      Math.random = real;
    }
    assert.equal(draws, Math.max(0, n - 1), `n=${n}`);
  }
});

test('uniform: every element reaches every position over many shuffles', () => {
  // The guard on the actual defect. `sort(() => Math.random() - 0.5)` leaves
  // elements near where they started; a chi-square-ish check on the position
  // histogram catches that without being flaky.
  const n = 6;
  const runs = 60_000;
  const counts = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rng = seeded(0x5eed);
  const real = Math.random;
  Math.random = rng;
  try {
    for (let r = 0; r < runs; r++) {
      const out = shuffleInPlace(Array.from({ length: n }, (_, i) => i));
      for (let pos = 0; pos < n; pos++) counts[out[pos]][pos]++;
    }
  } finally {
    Math.random = real;
  }

  const expected = runs / n;
  // 6 sigma on a binomial with p = 1/6 over 60k runs is ~2.5% of `expected`;
  // 8% is comfortably outside noise and far inside the bias a sort-shuffle
  // produces (identity positions come out several times over-represented).
  const tolerance = expected * 0.08;
  for (let value = 0; value < n; value++) {
    for (let pos = 0; pos < n; pos++) {
      assert.ok(
        Math.abs(counts[value][pos] - expected) < tolerance,
        `value ${value} landed at position ${pos} ${counts[value][pos]} times, expected ~${expected}`,
      );
    }
  }
});

test('degenerate inputs are left alone', () => {
  assert.deepEqual(shuffleInPlace([]), []);
  assert.deepEqual(shuffleInPlace([42]), [42]);
});
