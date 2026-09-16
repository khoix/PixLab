import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTimedPhase,
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

test('a timed phase steps on exactly when its span is up', () => {
  const timings = { readyMs: 1000, telegraphMs: 400, executeMaxMs: 300, recoverMs: 600 };

  const telegraphing = enterPhase('telegraph', 0);
  assert.equal(advanceTimedPhase(telegraphing, 399, timings).phase, 'telegraph');
  assert.equal(advanceTimedPhase(telegraphing, 400, timings).phase, 'execute');

  const executing = enterPhase('execute', 1_000);
  assert.equal(advanceTimedPhase(executing, 1_299, timings).phase, 'execute');
  assert.equal(advanceTimedPhase(executing, 1_300, timings).phase, 'recover');

  const recovering = enterPhase('recover', 2_000);
  assert.equal(advanceTimedPhase(recovering, 2_599, timings).phase, 'recover');
  assert.equal(advanceTimedPhase(recovering, 2_600, timings).phase, 'ready');
});

test('ready never advances on a timer, however long it has waited', () => {
  // Starting a cycle is a decision each boss makes differently — Hades when the
  // player is in strike range, Ares when there is room to charge. A boss that
  // opened its cycle on a timeout would telegraph at nothing.
  const timings = { readyMs: 1000, telegraphMs: 400, executeMaxMs: 300, recoverMs: 600 };
  const resting = enterPhase('ready', 0);
  assert.equal(advanceTimedPhase(resting, 10_000, timings), resting, 'and it is the same object');
});

test('one advance is one phase — the cycle cannot skip recovery', () => {
  const timings = { readyMs: 0, telegraphMs: 10, executeMaxMs: 10, recoverMs: 10 };
  // A frame long enough to expire three phases still only moves one.
  const out = advanceTimedPhase(enterPhase('telegraph', 0), 10_000, timings);
  assert.equal(out.phase, 'execute');
  assert.equal(out.since, 10_000, 'and the new phase starts now, not when the old one should have ended');
});

test('advancing resets the hit count, so each execution lands once', () => {
  const timings = { readyMs: 0, telegraphMs: 10, executeMaxMs: 10, recoverMs: 10 };
  const spent = { ...enterPhase('execute', 0), hits: 1 };
  assert.equal(canDealDamage(spent), false, 'this execution has had its one hit');

  const recovered = advanceTimedPhase(spent, 100, timings);
  assert.equal(recovered.phase, 'recover');
  const rested = advanceTimedPhase(recovered, 200, timings);
  assert.equal(rested.phase, 'ready');
  assert.equal(advanceTimedPhase(rested, 9_999, timings).phase, 'ready', 'and it waits there');

  // The boss opens the next cycle itself; the machine only sequences it.
  const nextExecution = advanceTimedPhase(enterPhase('telegraph', 300), 400, timings);
  assert.equal(nextExecution.phase, 'execute');
  assert.equal(canDealDamage(nextExecution), true);
});
