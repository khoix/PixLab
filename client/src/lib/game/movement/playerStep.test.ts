import test from 'node:test';
import assert from 'node:assert/strict';
import type { Level, Position } from '../types';
import {
  advanceInterpolation,
  easeOutCubic,
  entersNewFootprintTile,
  footprintFor,
  hasLanded,
  resolvePlayerStep,
  shouldBufferDirection,
  type StepInput,
} from './playerStep';

/**
 * A level from ASCII, '#' for rock. Only the three fields `checkCollision`
 * reads are populated — the rest of `Level` is irrelevant to a step and
 * supplying it would only make these tests harder to read.
 */
const levelOf = (rows: string[]): Level =>
  ({
    width: rows[0].length,
    height: rows.length,
    tiles: rows.map((r) => [...r].map((c) => (c === '#' ? 'wall' : 'floor'))),
  }) as unknown as Level;

const OPEN = levelOf([
  '#####',
  '#...#',
  '#...#',
  '#...#',
  '#####',
]);

const step = (over: Partial<StepInput> = {}): StepInput => ({
  playerPos: { x: 2, y: 2 },
  direction: { x: 1, y: 0 },
  moveProgress: 1,
  moveTimer: 0,
  deltaTime: 16,
  moveDelay: 150,
  phasing: false,
  level: OPEN,
  ...over,
});

test('a step needs the previous one to have landed', () => {
  assert.equal(resolvePlayerStep(step({ moveProgress: 0.99 })).outcome, 'parked');
  assert.equal(resolvePlayerStep(step({ moveProgress: 1 })).outcome, 'waiting');
});

test('no input parks the timer at the delay rather than at zero', () => {
  // The rule the header calls out: parked *at* moveDelay, so the next frame
  // with input is already past the threshold and the step costs no extra wait.
  const parked = resolvePlayerStep(step({ direction: { x: 0, y: 0 }, moveTimer: 0 }));
  assert.equal(parked.outcome, 'parked');
  assert.equal(parked.moveTimer, 150);

  const next = resolvePlayerStep(step({ moveTimer: parked.moveTimer, deltaTime: 16 }));
  assert.equal(next.outcome, 'stepped', 'the first frame of input should move, not wait');
});

test('resetting the parked timer to zero would cost a whole delay — the regression, pinned', () => {
  const wrong = resolvePlayerStep(step({ moveTimer: 0, deltaTime: 16 }));
  assert.equal(wrong.outcome, 'waiting', 'from zero it takes moveDelay/deltaTime frames to move');
});

test('a step lands on the adjacent tile and resets the timer', () => {
  const result = resolvePlayerStep(step({ moveTimer: 150 }));
  assert.equal(result.outcome, 'stepped');
  assert.deepEqual(result.nextPos, { x: 3, y: 2 });
  assert.equal(result.moveTimer, 0);
});

test('the destination is a whole tile in each axis', () => {
  for (const dir of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
  ]) {
    const result = resolvePlayerStep(step({ moveTimer: 150, direction: dir }));
    assert.deepEqual(result.nextPos, { x: 2 + dir.x, y: 2 + dir.y });
    assert.ok(Number.isInteger(result.nextPos!.x) && Number.isInteger(result.nextPos!.y));
  }
});

test('rock blocks the step and keeps the timer hot', () => {
  const result = resolvePlayerStep(step({ moveTimer: 150, playerPos: { x: 3, y: 2 } }));
  assert.equal(result.outcome, 'blocked');
  assert.deepEqual(result.nextPos, { x: 4, y: 2 }, 'the blocked destination is still reported');
  assert.ok(result.moveTimer > 150, 'a blocked step retries next frame rather than waiting again');
});

test('phasing walks through rock', () => {
  const result = resolvePlayerStep(
    step({ moveTimer: 150, playerPos: { x: 3, y: 2 }, phasing: true }),
  );
  assert.equal(result.outcome, 'stepped');
  assert.deepEqual(result.nextPos, { x: 4, y: 2 });
});

test('the level edge blocks like rock', () => {
  const bare = levelOf(['...', '...', '...']);
  const result = resolvePlayerStep(
    step({ moveTimer: 150, playerPos: { x: 2, y: 1 }, level: bare }),
  );
  assert.equal(result.outcome, 'blocked');
});

test('interpolation eases out and finishes exactly on the destination', () => {
  const moveStartPos: Position = { x: 2, y: 2 };
  const playerPos: Position = { x: 3, y: 2 };
  let moveProgress = 0;
  let visualPos = moveStartPos;
  for (let frame = 0; frame < 10; frame++) {
    const out = advanceInterpolation({
      moveProgress,
      moveStartPos,
      playerPos,
      deltaTime: 16,
      moveDelay: 150,
    });
    assert.ok(out.visualPos.x >= visualPos.x, 'the step never moves backwards');
    moveProgress = out.moveProgress;
    visualPos = out.visualPos;
  }
  assert.equal(moveProgress, 1);
  assert.deepEqual(visualPos, { x: 3, y: 2 });
});

test('a landed player is drawn exactly where the simulation put it', () => {
  const out = advanceInterpolation({
    moveProgress: 1,
    moveStartPos: { x: 0, y: 0 },
    playerPos: { x: 7, y: 4 },
    deltaTime: 16,
    moveDelay: 150,
  });
  assert.deepEqual(out.visualPos, { x: 7, y: 4 });
  assert.equal(out.moveProgress, 1, 'a landed step does not keep accumulating');
});

test('progress clamps at 1 however large the frame', () => {
  const out = advanceInterpolation({
    moveProgress: 0.5,
    moveStartPos: { x: 0, y: 0 },
    playerPos: { x: 1, y: 0 },
    deltaTime: 10_000,
    moveDelay: 150,
  });
  assert.equal(out.moveProgress, 1);
  assert.deepEqual(out.visualPos, { x: 1, y: 0 });
});

test('the ease is the cubic the movement has always used', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5, 'ease-out covers most of the distance early');
});

test('a direction pressed mid-step is buffered, and one at rest is not', () => {
  assert.equal(shouldBufferDirection(0.4, { x: 1, y: 0 }), true);
  assert.equal(shouldBufferDirection(1, { x: 1, y: 0 }), false, 'a landed step acts immediately');
  assert.equal(shouldBufferDirection(0.4, { x: 0, y: 0 }), false, 'nothing to buffer');
  assert.equal(hasLanded(0.999), false);
  assert.equal(hasLanded(1), true);
});

test('footprints mark tiles entered, not frames spent', () => {
  assert.equal(entersNewFootprintTile(null, { x: 3, y: 2 }), true, 'the first step always marks');
  assert.equal(entersNewFootprintTile({ x: 3, y: 2 }, { x: 3, y: 2 }), false);
  assert.equal(entersNewFootprintTile({ x: 3, y: 2 }, { x: 4, y: 2 }), true);
  // Floored, so a fractional position inside the same tile is still the same tile.
  assert.equal(entersNewFootprintTile({ x: 3.2, y: 2.9 }, { x: 3.8, y: 2.1 }), false);
});

test('a footprint carries the step that made it', () => {
  const print = footprintFor({
    id: 'footprint-4',
    pos: { x: 3, y: 2 },
    direction: { x: 1, y: 0 },
    isLeftFoot: true,
    createdAt: 1000,
  });
  assert.deepEqual(print, {
    id: 'footprint-4',
    pos: { x: 3, y: 2 },
    direction: { x: 1, y: 0 },
    isLeftFoot: true,
    createdAt: 1000,
    lifetime: 3000,
  });
});
