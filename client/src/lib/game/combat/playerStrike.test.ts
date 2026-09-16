import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entity, Level } from '../types';
import {
  CRIT_DAMAGE_MULTIPLIER,
  DAGGER_BASE_CRIT_CHANCE,
  PLAYER_MELEE_RANGE_TILES,
  SPEAR_PIERCE_CHANCE,
  SPEAR_RANGE_TILES,
  resolveStrike,
  selectAttackableEnemies,
  weaponLevelFrom,
  weaponReachTiles,
} from './playerStrike';

const levelOf = (rows: string[]): Level =>
  ({
    width: rows[0].length,
    height: rows.length,
    tiles: rows.map((r) => [...r].map((c) => (c === '#' ? 'wall' : 'floor'))),
    losCache: undefined,
  }) as unknown as Level;

const enemy = (over: Partial<Entity> = {}): Entity =>
  ({ id: 'enemy-1', type: 'enemy', mobSubtype: 'drone', pos: { x: 3, y: 2 }, hp: 10, damage: 1, ...over }) as Entity;

/** A sequence standing in for the shared stream, so draw order is visible. */
const stream = (...values: number[]) => {
  let i = 0;
  const fn = () => values[i++] ?? 0;
  fn.drawn = () => i;
  return fn;
};

test('a weapon level comes off the name, and falls back to the sector', () => {
  assert.equal(weaponLevelFrom('Dagger of Power Lv7', 3), 7);
  assert.equal(weaponLevelFrom('dagger lv12', 3), 12, 'case-insensitive, as the drop names are');
  assert.equal(weaponLevelFrom('Dagger of Power', 3), 3, 'ordinary drops carry no level');
  assert.equal(weaponLevelFrom(null, 5), 5);
  assert.equal(weaponLevelFrom(undefined, 5), 5);
});

test('only the spear reaches further than melee', () => {
  assert.equal(weaponReachTiles('Spear'), SPEAR_RANGE_TILES);
  assert.equal(weaponReachTiles('spear'), SPEAR_RANGE_TILES);
  assert.equal(weaponReachTiles('Sword'), PLAYER_MELEE_RANGE_TILES);
  assert.equal(weaponReachTiles(null), PLAYER_MELEE_RANGE_TILES);
});

test('a plain swing is the weapon damage, no roll taken', () => {
  const rng = stream(0);
  const out = resolveStrike({
    weaponBaseName: 'Sword',
    weaponLevel: 4,
    baseDamage: 12,
    wallBetween: false,
    rng,
  });
  assert.deepEqual(out, { kind: 'hit', damage: 12, isCrit: false });
  assert.equal(rng.drawn(), 0, 'a weapon that cannot roll must not touch the stream');
});

test('a dagger crit triples, and its chance grows with the weapon level', () => {
  const crit = resolveStrike({
    weaponBaseName: 'Dagger',
    weaponLevel: 1,
    baseDamage: 10,
    wallBetween: false,
    rng: () => DAGGER_BASE_CRIT_CHANCE - 0.001,
  });
  assert.deepEqual(crit, { kind: 'hit', damage: 10 * CRIT_DAMAGE_MULTIPLIER, isCrit: true });

  const miss = resolveStrike({
    weaponBaseName: 'Dagger',
    weaponLevel: 1,
    baseDamage: 10,
    wallBetween: false,
    rng: () => DAGGER_BASE_CRIT_CHANCE,
  });
  assert.deepEqual(miss, { kind: 'hit', damage: 10, isCrit: false }, 'the boundary is exclusive');

  // At level 6 the chance is 10% + 5 * 2% = 20%, so a draw of 0.15 now crits.
  const levelled = resolveStrike({
    weaponBaseName: 'Dagger',
    weaponLevel: 6,
    baseDamage: 10,
    wallBetween: false,
    rng: () => 0.15,
  });
  assert.equal(levelled.kind === 'hit' && levelled.isCrit, true);
});

test('a dagger draws exactly once per enemy, crit or not', () => {
  const rng = stream(0.99, 0.99);
  resolveStrike({ weaponBaseName: 'Dagger', weaponLevel: 1, baseDamage: 10, wallBetween: false, rng });
  assert.equal(rng.drawn(), 1);
});

test('a spear through rock lands at half damage, one time in ten', () => {
  const through = resolveStrike({
    weaponBaseName: 'Spear',
    weaponLevel: 1,
    baseDamage: 20,
    wallBetween: true,
    rng: () => SPEAR_PIERCE_CHANCE - 0.001,
  });
  assert.deepEqual(through, { kind: 'pierced', damage: 10 });

  const blocked = resolveStrike({
    weaponBaseName: 'Spear',
    weaponLevel: 1,
    baseDamage: 20,
    wallBetween: true,
    rng: () => SPEAR_PIERCE_CHANCE,
  });
  assert.deepEqual(blocked, { kind: 'missed' }, 'the boundary fails the roll, as before');
});

test('a spear with a clear line is an ordinary swing and takes no roll', () => {
  const rng = stream(0);
  const out = resolveStrike({
    weaponBaseName: 'Spear',
    weaponLevel: 9,
    baseDamage: 20,
    wallBetween: false,
    rng,
  });
  assert.deepEqual(out, { kind: 'hit', damage: 20, isCrit: false });
  assert.equal(rng.drawn(), 0);
});

test('a dagger never rolls the pierce, and a spear never rolls a crit', () => {
  // One draw each at most: the two weapons cannot interleave on one enemy.
  const daggerThroughWall = stream(0.01);
  const out = resolveStrike({
    weaponBaseName: 'Dagger',
    weaponLevel: 1,
    baseDamage: 10,
    // A caller only sets this for a spear; assert the guard holds anyway.
    wallBetween: true,
    rng: daggerThroughWall,
  });
  assert.equal(out.kind, 'hit');
  assert.equal(daggerThroughWall.drawn(), 1, 'the single draw was the crit roll');
});

test('selection is the union of discs around each attackable tile', () => {
  // Worth stating because it surprises: the reach is measured from every tile
  // the weapon covers, not from the player. A bare sword covers the four
  // cardinals and reaches 1.5 from each, so a diagonal neighbour is in range
  // via the cardinal beside it.
  const open = levelOf(['#####', '#...#', '#...#', '#...#', '#####']);
  const entities = [
    enemy({ id: 'cardinal', pos: { x: 3, y: 2 } }),
    enemy({ id: 'diagonal', pos: { x: 3, y: 3 } }),
    enemy({ id: 'boss', type: 'boss_enemy', pos: { x: 2, y: 3 } }),
    enemy({ id: 'item', type: 'item' as Entity['type'], pos: { x: 3, y: 2 } }),
  ];
  const picked = selectAttackableEnemies({
    from: { x: 2, y: 2 },
    weaponBaseName: 'Sword',
    entities,
    level: open,
  }).map((e) => e.id);

  assert.deepEqual(picked, ['cardinal', 'diagonal', 'boss'], 'enemies only, bosses included');
});

test('a spear reaches down a line where a sword falls short', () => {
  const corridor = levelOf([
    '########',
    '########',
    '#......#',
    '########',
    '########',
  ]);
  const from = { x: 2, y: 2 };
  const target = [enemy({ id: 'three-away', pos: { x: 5, y: 2 } })];

  // Sword: covered tiles stop at (3,2), and 1.5 from there is not (5,2).
  assert.equal(
    selectAttackableEnemies({ from, weaponBaseName: 'Sword', entities: target, level: corridor }).length,
    0,
  );
  // Spear: covers two tiles along the row and reaches 2.0 from each.
  assert.equal(
    selectAttackableEnemies({ from, weaponBaseName: 'Spear', entities: target, level: corridor }).length,
    1,
  );
});

test('rock ends a sword swing, and lets a spear through to be rolled for', () => {
  // The filter is final: an enemy it rejects is never handed to resolveStrike,
  // which is why the spear has to be let past here rather than there.
  const blocked = levelOf([
    '#####',
    '#####',
    '#.#.#',
    '#####',
    '#####',
  ]);
  const from = { x: 1, y: 2 };
  const behindRock = [enemy({ id: 'walled-off', pos: { x: 3, y: 2 } })];

  assert.equal(
    selectAttackableEnemies({ from, weaponBaseName: 'Sword', entities: behindRock, level: blocked }).length,
    0,
  );
  assert.equal(
    selectAttackableEnemies({ from, weaponBaseName: 'Spear', entities: behindRock, level: blocked }).length,
    1,
    'in range and behind rock: the pierce roll decides, not the filter',
  );
});
