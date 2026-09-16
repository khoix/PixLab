import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entity, Level } from '../types';
import {
  WALL_PHASE_BASE,
  WALL_PHASE_PER_LEVEL,
  fireProjectile,
  makeProjectile,
  wallPhaseChance,
} from './projectileSpawn';

const shooter = (over: Partial<Entity> = {}): Entity =>
  ({
    id: 'enemy-7',
    type: 'enemy',
    mobSubtype: 'sniper',
    pos: { x: 4, y: 6 },
    hp: 10,
    damage: 9,
    attackCooldown: 2000,
    ...over,
  }) as Entity;

test('a shot carries the cadence it was fired at, not a default', () => {
  const p = makeProjectile({
    id: 'projectile-1',
    shooter: shooter(),
    velocity: { x: 1, y: 0 },
    now: 500,
    lifetimeMs: 3000,
  });
  assert.equal(p.cadenceMs, 2000);
  assert.equal(p.damage, 9);
  assert.equal(p.ownerId, 'enemy-7');
  assert.equal(p.createdAt, 500);
  assert.equal(p.lifetime, 3000);
  assert.equal(p.isBoss, false);
});

test('a shooter with no cadence configured falls back to one second', () => {
  const p = makeProjectile({
    id: 'p',
    shooter: shooter({ attackCooldown: undefined }),
    velocity: { x: 0, y: 1 },
    now: 0,
    lifetimeMs: 3000,
  });
  assert.equal(p.cadenceMs, 1000);
});

test('the position is copied, so the shot does not follow its shooter', () => {
  const firing = shooter();
  const p = makeProjectile({
    id: 'p',
    shooter: firing,
    velocity: { x: 1, y: 0 },
    now: 0,
    lifetimeMs: 3000,
  });
  firing.pos.x = 99;
  assert.deepEqual(p.pos, { x: 4, y: 6 });
});

test('a shot that cannot phase has no phase key at all', () => {
  const p = makeProjectile({
    id: 'p',
    shooter: shooter(),
    velocity: { x: 1, y: 0 },
    now: 0,
    lifetimeMs: 3000,
  });
  assert.equal('wallPhaseChance' in p, false, 'absent, not zero — stepProjectile tells them apart');
  assert.equal('isShadowPulse' in p, false);
});

test('phasing and the shadow pulse ride along when asked for', () => {
  const p = makeProjectile({
    id: 'p',
    shooter: shooter({ mobSubtype: 'moth' }),
    velocity: { x: 1, y: 0 },
    now: 0,
    lifetimeMs: 3000,
    wallPhaseChance: 0.1,
    isShadowPulse: true,
  });
  assert.equal(p.wallPhaseChance, 0.1);
  assert.equal(p.isShadowPulse, true);
});

test('a boss shot is marked as one', () => {
  const p = makeProjectile({
    id: 'p',
    shooter: shooter({ isBoss: true }),
    velocity: { x: 1, y: 0 },
    now: 0,
    lifetimeMs: 3000,
  });
  assert.equal(p.isBoss, true);
});

test('phase chance grows with the sector and stops at certainty', () => {
  assert.equal(wallPhaseChance(WALL_PHASE_BASE.moth, 0), 0.05);
  assert.equal(
    wallPhaseChance(WALL_PHASE_BASE.sniper, 10),
    0.1 + 10 * WALL_PHASE_PER_LEVEL,
  );
  assert.equal(wallPhaseChance(WALL_PHASE_BASE.bossZeus, 1000), 1, 'clamped, never above 1');
});

test('firing creates the array on the first shot and appends after', () => {
  const level = {} as Level;
  const first = fireProjectile(level, {
    id: 'p1',
    shooter: shooter(),
    velocity: { x: 1, y: 0 },
    now: 0,
    lifetimeMs: 3000,
  });
  assert.deepEqual(level.projectiles, [first]);

  const second = fireProjectile(level, {
    id: 'p2',
    shooter: shooter(),
    velocity: { x: -1, y: 0 },
    now: 10,
    lifetimeMs: 3000,
  });
  assert.deepEqual(level.projectiles, [first, second]);
});
