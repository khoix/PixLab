import test from 'node:test';
import assert from 'node:assert/strict';
import { dropExpired, hasExpired, type Perishable } from './lifetimes';

const at = (createdAt: number, lifetime: number): Perishable => ({ createdAt, lifetime });

test('an item exactly at its lifetime is still alive', () => {
  assert.equal(hasExpired(at(0, 1000), 999), false);
  assert.equal(hasExpired(at(0, 1000), 1000), false, 'the boundary belongs to the living');
  assert.equal(hasExpired(at(0, 1000), 1001), true);
});

test('dropping keeps order and leaves the input alone', () => {
  const items = [at(0, 100), at(0, 500), at(400, 100), at(0, 50)];
  const kept = dropExpired(items, 450);
  assert.deepEqual(kept, [at(0, 500), at(400, 100)]);
  assert.equal(items.length, 4, 'rebuilt, not spliced — the renderer may still hold this array');
  assert.notEqual(kept, items);
});

test('an absent array is an empty one', () => {
  assert.deepEqual(dropExpired(undefined, 0), []);
  assert.deepEqual(dropExpired([], 999), []);
});

test('nothing expires at the moment of birth, however short the span', () => {
  assert.deepEqual(dropExpired([at(1000, 0)], 1000), [at(1000, 0)]);
  assert.deepEqual(dropExpired([at(1000, 0)], 1001), []);
});

test('a clock that has gone backwards keeps everything', () => {
  // The game clock pauses rather than rewinds, but a stamp taken before a
  // sector reset can read as being in the future; nothing should vanish for it.
  assert.deepEqual(dropExpired([at(5000, 100)], 1000), [at(5000, 100)]);
});
