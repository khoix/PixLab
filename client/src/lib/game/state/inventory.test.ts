import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STATE_INVENTORY, type StateCell } from './inventory';

/**
 * The inventory is only worth having if it cannot drift from the component.
 *
 * So this does not check the table against itself — it re-runs the M8.1 sweep
 * against `GameCanvas.tsx` and asserts the recorded classification still
 * matches what the code does. Add a ref, move a write from `update()` into
 * `draw()`, or start writing a cell the table calls read-only, and this fails
 * until the classification is updated to say so.
 *
 * That matters most from M8.4 on: by then the engine is being carved out
 * against these buckets, and a stale bucket is a silent behaviour change.
 */

const SOURCE = path.join(process.cwd(), 'client', 'src', 'components', 'game', 'GameCanvas.tsx');
const lines = readFileSync(SOURCE, 'utf8').split('\n');

/**
 * Region bounds are found by anchor, not by line number, so ordinary edits to
 * the file do not silently move them.
 */
function anchor(pattern: RegExp, what: string): number {
  const at = lines.findIndex((l) => pattern.test(l));
  assert.notEqual(at, -1, `could not locate ${what} in GameCanvas.tsx`);
  return at + 1;
}

const UPDATE_START = anchor(/^\s*const update = \(deltaTime: number\) => \{/, 'update()');
const DRAW_START = anchor(/^\s*const draw = \(\) => \{/, 'draw()');
const DRAW_END = anchor(/^\s*updateFnRef\.current = update;/, 'the end of draw()');

function writesIn(ref: string, from: number, to: number): number {
  const assign = new RegExp(`${ref}\\.current(\\.\\w+)*\\s*(=[^=]|\\+=|-=|\\+\\+|--)`);
  const mutate = new RegExp(`${ref}\\.current(\\.\\w+)*\\.(set|clear|delete|push|add|splice|pop)\\(`);
  let n = 0;
  for (let i = from; i < to; i++) {
    const line = lines[i - 1];
    if (assign.test(line) || mutate.test(line)) n++;
  }
  return n;
}

const declared = lines
  .map((l) => /^\s*const (\w+Ref) = useRef/.exec(l)?.[1])
  .filter((n): n is string => !!n);

const byName = new Map<string, StateCell>(STATE_INVENTORY.map((c) => [c.name, c]));

test('every ref in GameCanvas is classified, and nothing is classified that is gone', () => {
  assert.ok(declared.length > 0, 'found no useRef declarations — the parse is broken');
  const missing = declared.filter((n) => !byName.has(n));
  const stale = STATE_INVENTORY.map((c) => c.name).filter((n) => !declared.includes(n));
  assert.deepEqual(missing, [], 'refs in GameCanvas.tsx with no entry in STATE_INVENTORY');
  assert.deepEqual(stale, [], 'entries in STATE_INVENTORY that no longer exist in GameCanvas.tsx');
});

test('the inventory has no duplicate entries', () => {
  assert.equal(byName.size, STATE_INVENTORY.length);
});

test('whatever update() writes is recorded as written by UPDATE', () => {
  for (const name of declared) {
    const cell = byName.get(name)!;
    const n = writesIn(name, UPDATE_START, DRAW_START);
    if (n > 0) {
      assert.ok(
        cell.writtenBy.includes('UPDATE'),
        `${name} is written ${n}x inside update() but its inventory entry does not say so`,
      );
    }
  }
});

test('whatever draw() writes is recorded as written by DRAW', () => {
  for (const name of declared) {
    const cell = byName.get(name)!;
    const n = writesIn(name, DRAW_START, DRAW_END);
    if (n > 0) {
      assert.ok(
        cell.writtenBy.includes('DRAW'),
        `${name} is written ${n}x inside draw() but its inventory entry does not say so`,
      );
    }
  }
});

test('a cell written by both update() and draw() is marked shared, never bucketed', () => {
  // This is the guard on M8.1's first finding. `levelRef` is written by both
  // today, because draw() runs the particle lifecycle. If M8.3 moves that loop
  // into update() the assertion still holds — it only ever forbids quietly
  // filing a two-writer cell under one seam.
  for (const name of declared) {
    const cell = byName.get(name)!;
    const inUpdate = writesIn(name, UPDATE_START, DRAW_START) > 0;
    const inDraw = writesIn(name, DRAW_START, DRAW_END) > 0;
    if (inUpdate && inDraw) {
      assert.equal(
        cell.seam,
        'shared',
        `${name} is written by both update() and draw(); it cannot belong to one seam`,
      );
    }
  }
});

test('a mirrored cell is never written by the engine', () => {
  // The `statsRef` trap, as an invariant. "Mirrored" means React writes it and
  // the engine reads it — one way. `statsRef` looked like this and is not:
  // update() writes it at five sites, so it is classified `shared`. If anyone
  // adds an engine write to a genuinely mirrored cell, this fails rather than
  // letting the next stage treat it as read-only input.
  for (const cell of STATE_INVENTORY) {
    if (cell.seam !== 'mirrored') continue;
    const n = writesIn(cell.name, UPDATE_START, DRAW_START);
    assert.equal(
      n,
      0,
      `${cell.name} is classified 'mirrored' but update() writes it ${n}x — it is bidirectional, like statsRef`,
    );
  }
});

test('render-seam cells are not written by update(), except the id counters', () => {
  // Three counters (afterimage, particle, footprint) are allocated by update()
  // for objects that are visual only. They are called out here rather than
  // silently exempted, because if a fourth appears it is worth a second look.
  const allocatedByEngine = new Set([
    'afterimageIdCounterRef',
    'particleIdCounterRef',
    'footprintIdCounterRef',
  ]);
  for (const cell of STATE_INVENTORY) {
    if (cell.seam !== 'render' || allocatedByEngine.has(cell.name)) continue;
    assert.equal(
      writesIn(cell.name, UPDATE_START, DRAW_START),
      0,
      `${cell.name} is classified 'render' but update() writes it`,
    );
  }
});

test('every entry carries a seam the split understands', () => {
  const seams = new Set(['engine', 'render', 'input', 'orchestration', 'mirrored', 'shared']);
  for (const cell of STATE_INVENTORY) {
    assert.ok(seams.has(cell.seam), `${cell.name} has an unknown seam ${cell.seam}`);
    assert.ok(Array.isArray(cell.writtenBy), `${cell.name} is missing writtenBy`);
  }
});
