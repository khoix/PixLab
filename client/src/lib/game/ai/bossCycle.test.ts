import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDealDamage,
  enterPhase,
  initialCycle,
  readCycle,
  writeCycle,
  type EntityCycleFields,
} from './bossCycle';

test('a mob that has never cycled reads as ready from now, not from spawn', () => {
  // Not stored at spawn on purpose: a boss asleep beyond the dormancy threshold
  // would otherwise wake with its whole rest period already elapsed and open
  // with an immediate telegraph.
  const fresh: EntityCycleFields = {};
  assert.deepEqual(readCycle(fresh, 5_000), initialCycle(5_000));
  assert.deepEqual(readCycle(fresh, 9_000), initialCycle(9_000));
});

test('the cycle round-trips through the entity', () => {
  const entity: EntityCycleFields = {};
  const executing = enterPhase('execute', 1_200);
  writeCycle(entity, executing);
  assert.deepEqual(entity, { bossPhase: 'execute', bossPhaseSince: 1_200, bossPhaseHits: 0 });
  assert.deepEqual(readCycle(entity, 4_000), executing, 'and `now` is ignored once a phase is stored');
});

test('a skipped frame does not restart the phase — the scheduler-safety property', () => {
  const entity: EntityCycleFields = {};
  writeCycle(entity, enterPhase('telegraph', 1_000));
  // The AI scheduler skips this mob for several frames; nothing writes to it.
  const afterSkips = readCycle(entity, 1_800);
  assert.equal(afterSkips.phase, 'telegraph');
  assert.equal(afterSkips.since, 1_000, 'elapsed time is real time, not processed time');
});

test('partial state falls back per field rather than dropping the phase', () => {
  const entity: EntityCycleFields = { bossPhase: 'recover' };
  assert.deepEqual(readCycle(entity, 700), { phase: 'recover', since: 700, hits: 0 });
});

test('hits ride along, so one execution can only land once', () => {
  const entity: EntityCycleFields = {};
  writeCycle(entity, enterPhase('execute', 0));
  assert.equal(canDealDamage(readCycle(entity, 0)), true);
  entity.bossPhaseHits = 1;
  assert.equal(canDealDamage(readCycle(entity, 0)), false);
});
