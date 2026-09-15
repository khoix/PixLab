import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entity } from '../types';
import { canMoveDiagonally, isInCardinalDirection, restrictToCardinal } from './mobGeometry';

const mob = (over: Partial<Entity> = {}): Entity =>
  ({ id: 'e1', type: 'enemy', pos: { x: 0, y: 0 }, hp: 10, mobSubtype: 'drone', ...over }) as Entity;

test('only flyers and phasers are exempt from the cardinal restriction', () => {
  assert.equal(canMoveDiagonally(mob({ mobSubtype: 'phase' })), true);
  assert.equal(canMoveDiagonally(mob({ mobSubtype: 'moth' })), true);
  assert.equal(canMoveDiagonally(mob({ mobSubtype: 'boss_hades' })), true);
  assert.equal(canMoveDiagonally(mob({ mobSubtype: 'drone', canPhase: true })), true,
    'the flag grants it without being one of the named subtypes');
  for (const subtype of ['drone', 'charger', 'sniper', 'turret', 'swarm', 'guardian', 'tracker']) {
    assert.equal(canMoveDiagonally(mob({ mobSubtype: subtype as Entity['mobSubtype'] })), false, subtype);
  }
});

test('a diagonal collapses to its larger component', () => {
  assert.deepEqual(restrictToCardinal(5, 2), { x: 1, y: 0 });
  assert.deepEqual(restrictToCardinal(-5, 2), { x: -1, y: 0 });
  assert.deepEqual(restrictToCardinal(2, 5), { x: 0, y: 1 });
  assert.deepEqual(restrictToCardinal(2, -5), { x: 0, y: -1 });
});

test('an exact diagonal breaks toward horizontal, every time', () => {
  // Deterministic by design: a random tiebreak would draw from the simulation's
  // RNG stream on a geometric question.
  for (const [dx, dy] of [[3, 3], [-3, 3], [3, -3], [-3, -3]] as const) {
    assert.deepEqual(restrictToCardinal(dx, dy), { x: Math.sign(dx), y: 0 });
  }
});

test('an already-cardinal direction is passed through as unit steps', () => {
  assert.deepEqual(restrictToCardinal(0, 4), { x: 0, y: 1 });
  assert.deepEqual(restrictToCardinal(-4, 0), { x: -1, y: 0 });
  assert.deepEqual(restrictToCardinal(0, 0), { x: 0, y: 0 });
});

test('cardinal reach is a shared row or column, and sharing a tile counts', () => {
  const from = { x: 4, y: 4 };
  assert.equal(isInCardinalDirection(from, { x: 4, y: 9 }), true);
  assert.equal(isInCardinalDirection(from, { x: 0, y: 4 }), true);
  assert.equal(isInCardinalDirection(from, { x: 4, y: 4 }), true, 'same tile is in reach');
  assert.equal(isInCardinalDirection(from, { x: 5, y: 5 }), false);
  assert.equal(isInCardinalDirection(from, { x: 4.5, y: 4 }), true, 'a fractional row still shares it');
});
