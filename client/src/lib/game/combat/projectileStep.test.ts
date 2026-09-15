import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entity, Level, Projectile } from '../types';
import {
  PROJECTILE_SPEED,
  stepProjectile,
  type ProjectileStepInput,
} from './projectileStep';

const levelOf = (rows: string[]): Level =>
  ({
    width: rows[0].length,
    height: rows.length,
    tiles: rows.map((r) => [...r].map((c) => (c === '#' ? 'wall' : 'floor'))),
  }) as unknown as Level;

const OPEN = levelOf(['#####', '#...#', '#...#', '#...#', '#####']);

const shot = (over: Partial<Projectile> = {}): Projectile =>
  ({
    id: 'projectile-1',
    pos: { x: 1, y: 2 },
    velocity: { x: 1, y: 0 },
    damage: 5,
    ownerId: 'enemy-owner',
    cadenceMs: 1000,
    isBoss: false,
    lifetime: 3000,
    createdAt: 0,
    ...over,
  }) as Projectile;

const mob = (over: Partial<Entity> = {}): Entity =>
  ({ id: 'enemy-2', type: 'enemy', mobSubtype: 'drone', pos: { x: 3, y: 2 }, hp: 10, ...over }) as Entity;

const step = (over: Partial<ProjectileStepInput> = {}): ProjectileStepInput => ({
  projectile: shot(),
  now: 100,
  playerPos: { x: 9, y: 9 },
  entities: [],
  level: OPEN,
  lifetimeMs: 3000,
  ...over,
});

test('a shot past its lifetime never moves', () => {
  assert.deepEqual(stepProjectile(step({ now: 3001 })), { kind: 'expired' });
  assert.equal(stepProjectile(step({ now: 3000 })).kind, 'moved', 'exactly at it still flies');
});

test('an unobstructed shot advances one speed step', () => {
  const out = stepProjectile(step());
  assert.equal(out.kind, 'moved');
  assert.deepEqual(out.kind === 'moved' && out.pos, { x: 1 + PROJECTILE_SPEED, y: 2 });
});

test('the player is checked before anyone else — the order is the design', () => {
  // A mob and the player on the same point: the shot hits the player.
  const out = stepProjectile(
    step({
      projectile: shot({ pos: { x: 1.9, y: 2 } }),
      playerPos: { x: 2, y: 2 },
      entities: [mob({ pos: { x: 2, y: 2 } })],
    }),
  );
  assert.equal(out.kind, 'hitPlayer');
});

test('friendly fire takes the first mob that is not the owner', () => {
  const out = stepProjectile(
    step({
      projectile: shot({ pos: { x: 1.9, y: 2 }, ownerId: 'enemy-owner' }),
      entities: [
        mob({ id: 'enemy-owner', pos: { x: 2, y: 2 } }),
        mob({ id: 'enemy-victim', pos: { x: 2, y: 2 } }),
        mob({ id: 'enemy-later', pos: { x: 2, y: 2 } }),
      ],
    }),
  );
  assert.equal(out.kind, 'hitEnemy');
  assert.equal(out.kind === 'hitEnemy' && out.target.id, 'enemy-victim', 'the owner is skipped');
  assert.equal(out.kind === 'hitEnemy' && out.targetIndex, 1, 'and the index is where it was');
});

test('non-enemies are not shot', () => {
  const out = stepProjectile(
    step({
      projectile: shot({ pos: { x: 1.9, y: 2 } }),
      entities: [mob({ id: 'loot', type: 'item' as Entity['type'], pos: { x: 2, y: 2 } })],
    }),
  );
  assert.equal(out.kind, 'moved');
});

test('rock stops an ordinary shot', () => {
  const out = stepProjectile(step({ projectile: shot({ pos: { x: 3.9, y: 2 } }) }));
  assert.equal(out.kind, 'blocked');
});

test('a phasing bolt rolls once, and only when it would be stopped', () => {
  const draws: number[] = [];
  const rng = (value: number) => () => {
    draws.push(value);
    return value;
  };

  const through = stepProjectile(
    step({ projectile: shot({ pos: { x: 3.9, y: 2 }, wallPhaseChance: 0.25 }), rng: rng(0.24) }),
  );
  assert.equal(through.kind, 'moved', 'it keeps going from inside the wall');

  const stopped = stepProjectile(
    step({ projectile: shot({ pos: { x: 3.9, y: 2 }, wallPhaseChance: 0.25 }), rng: rng(0.25) }),
  );
  assert.equal(stopped.kind, 'blocked', 'the boundary fails the roll');
  assert.equal(draws.length, 2, 'one draw per blocked frame, and no more');
});

test('a bolt in open air takes no draw at all', () => {
  let draws = 0;
  const out = stepProjectile(
    step({
      projectile: shot({ wallPhaseChance: 0.25 }),
      rng: () => {
        draws++;
        return 0;
      },
    }),
  );
  assert.equal(out.kind, 'moved');
  assert.equal(draws, 0, 'the stream is shared — a shot that is not blocked must not touch it');
});

test('a zero phase chance is no chance, and takes no draw', () => {
  let draws = 0;
  const out = stepProjectile(
    step({
      projectile: shot({ pos: { x: 3.9, y: 2 }, wallPhaseChance: 0 }),
      rng: () => {
        draws++;
        return 0;
      },
    }),
  );
  assert.equal(out.kind, 'blocked');
  assert.equal(draws, 0);
});

test('without a level nothing blocks', () => {
  const out = stepProjectile(step({ projectile: shot({ pos: { x: 3.9, y: 2 } }), level: null }));
  assert.equal(out.kind, 'moved');
});
