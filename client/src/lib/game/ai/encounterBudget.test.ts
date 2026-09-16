import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTITY_CAP,
  planRoster,
  selectionCost,
  threatBudget,
} from './encounterBudget';

/**
 * M8.7 — the exit criterion that says engine tests must be able to drive
 * "seeded encounter generation without Canvas/DOM", as a test rather than a
 * claim. This file runs in node with no browser, no canvas and no React, and
 * the only source of randomness is the one passed in.
 */

/** mulberry32, the same generator the M8.0 replay harness seeds the page with. */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const TIER = [
  { subtype: 'drone', spawnWeight: 40 },
  { subtype: 'swarm', spawnWeight: 30 },
  { subtype: 'guardian', spawnWeight: 20 },
  { subtype: 'cerberus', spawnWeight: 10 },
];

test('the same seed plans the same sector, every time', () => {
  const first = planRoster(7, TIER, seeded(0xC0FFEE));
  const second = planRoster(7, TIER, seeded(0xC0FFEE));
  assert.deepEqual(first, second);
});

test('a different seed plans a different sector', () => {
  const a = planRoster(7, TIER, seeded(1));
  const b = planRoster(7, TIER, seeded(2));
  assert.notDeepEqual(a.selections, b.selections);
  assert.equal(a.budget, b.budget, 'but the budget is the sector, not the roll');
});

test('the budget is never overrun, across every sector in a run', () => {
  for (let level = 1; level <= 40; level++) {
    const plan = planRoster(level, TIER, seeded(level * 7919));
    assert.equal(plan.budget, threatBudget(level));
    assert.ok(
      plan.totalCost <= plan.budget,
      `sector ${level} spent ${plan.totalCost} of ${plan.budget}`,
    );
    assert.equal(
      plan.totalCost,
      plan.selections.reduce((n, s) => n + s.cost, 0),
      'and the total is the selections, not a separate tally',
    );
  }
});

test('an expensive mob is skipped, never sold at a discount', () => {
  // Budget for sector 1 is 3.7; a cerberus selection costs 2.5 and a drone 1.0.
  const plan = planRoster(1, TIER, seeded(42));
  for (const selection of plan.selections) {
    assert.equal(selection.cost, selectionCost(selection.subtype));
  }
  assert.ok(plan.totalCost <= threatBudget(1));
});

test('a swarm selection is priced and counted as the whole pack', () => {
  const swarmOnly = planRoster(20, [{ subtype: 'swarm', spawnWeight: 1 }], seeded(5));
  for (const selection of swarmOnly.selections) {
    assert.equal(selection.subtype, 'swarm');
    assert.ok(selection.entities > 1, 'a pack, not a body');
    assert.equal(selection.cost, selectionCost('swarm'));
  }
  assert.equal(
    swarmOnly.totalEntities,
    swarmOnly.selections.reduce((n, s) => n + s.entities, 0),
  );
});

test('the entity cap holds even where the budget would allow more', () => {
  // A very deep sector with the cheapest mob available: the budget stops
  // mattering and the performance ceiling takes over.
  const plan = planRoster(500, [{ subtype: 'swarm', spawnWeight: 1 }], seeded(9));
  assert.ok(plan.totalEntities <= ENTITY_CAP, `${plan.totalEntities} entities`);
});

test('nothing to pick means nothing planned, and no hang', () => {
  assert.deepEqual(planRoster(9, [], seeded(1)).selections, []);
  assert.deepEqual(
    planRoster(9, [{ subtype: 'drone', spawnWeight: 0 }], seeded(1)).selections,
    [],
    'zero total weight is the same as nothing available',
  );
});

test('a degenerate rng terminates rather than spinning', () => {
  // The guard exists because the loop `continue`s on a selection that would
  // overrun; an rng that keeps picking the dearest mob would otherwise spin.
  const plan = planRoster(3, TIER, () => 1);
  assert.ok(plan.totalCost <= plan.budget);
});
