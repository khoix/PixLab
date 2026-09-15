import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entity } from '../types';
import { buildMobOccupancy, occupancyKey } from './mobOccupancy';

const at = (id: string, x: number, y: number, type = 'enemy'): Entity =>
  ({ id, type, mobSubtype: 'drone', pos: { x, y }, hp: 5 }) as Entity;

test('mobs sharing a tile share a bucket', () => {
  const occupancy = buildMobOccupancy([at('a', 3, 4), at('b', 3, 4), at('c', 9, 1)]);
  assert.deepEqual(occupancy.get(occupancyKey(3, 4))?.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(occupancy.get(occupancyKey(9, 1))?.map((e) => e.id), ['c']);
  assert.equal(occupancy.get(occupancyKey(0, 0)), undefined);
});

test('fractional positions are floored to the tile they stand on', () => {
  const occupancy = buildMobOccupancy([at('a', 3.9, 4.2)]);
  assert.equal(occupancy.get(occupancyKey(3, 4))?.length, 1);
});

test('only enemies are indexed', () => {
  const occupancy = buildMobOccupancy([
    at('mob', 1, 1),
    at('boss', 1, 1, 'boss_enemy'),
    at('loot', 1, 1, 'item'),
  ]);
  assert.deepEqual(occupancy.get(occupancyKey(1, 1))?.map((e) => e.id), ['mob', 'boss']);
});

test('keys are unique across the board the game generates', () => {
  const seen = new Set<number>();
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) seen.add(occupancyKey(x, y));
  assert.equal(seen.size, 900, 'every tile of a 30x30 map has its own key');

  // The stride is what guarantees that, and this is where it would stop: an x
  // of 4096 lands on the next row's first tile. Far outside any map the game
  // generates, and worth stating so the constant is not narrowed by accident.
  assert.equal(occupancyKey(4096, 0), occupancyKey(0, 1));
});
