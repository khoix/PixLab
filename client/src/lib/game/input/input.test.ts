import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_DIRECTIONS,
  directionForKey,
  directionFromHeldKeys,
  isMovementKey,
} from './keyboardDirection';
import {
  PORTAL_TAP_FORGIVENESS_TILES,
  legacyScreenToTile,
  portalAt,
  portalDestinationCandidates,
  tapHitsPortal,
} from './portalTap';

// --- keyboard ---------------------------------------------------------------

test('the twelve keys Game.tsx bound are all still bound, and nothing else is', () => {
  // The exact set the two inline lists agreed on before extraction. If a
  // binding is added, this fails and someone has to confirm both the keydown
  // and keyup paths still want it.
  assert.deepEqual(
    Object.keys(KEY_DIRECTIONS).sort(),
    ['A', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'D', 'S', 'W', 'a', 'd', 's', 'w'],
  );
});

test('arrows and WASD agree, in both cases', () => {
  for (const [keys, expected] of [
    [['ArrowUp', 'w', 'W'], { x: 0, y: -1 }],
    [['ArrowDown', 's', 'S'], { x: 0, y: 1 }],
    [['ArrowLeft', 'a', 'A'], { x: -1, y: 0 }],
    [['ArrowRight', 'd', 'D'], { x: 1, y: 0 }],
  ] as const) {
    for (const key of keys) assert.deepEqual(directionForKey(key), expected, key);
  }
});

test('non-movement keys command nothing', () => {
  for (const key of ['Tab', 'Escape', ' ', 'q', 'Shift', 'ArrowUpLeft', '']) {
    assert.equal(directionForKey(key), null, key);
    assert.equal(isMovementKey(key), false, key);
  }
});

test('isMovementKey covers exactly the mapped keys', () => {
  // The keyup path used a hand-written Set. Deriving it from the same table is
  // the point of the extraction, so assert they cannot disagree.
  for (const key of Object.keys(KEY_DIRECTIONS)) assert.ok(isMovementKey(key), key);
});

test('directionForKey hands back a copy, not the shared table entry', () => {
  const dir = directionForKey('w')!;
  dir.x = 99;
  assert.deepEqual(directionForKey('w'), { x: 0, y: -1 });
});

test('directionFromHeldKeys combines and cancels — the fix this stage does not adopt', () => {
  assert.deepEqual(directionFromHeldKeys([]), { x: 0, y: 0 });
  assert.deepEqual(directionFromHeldKeys(['d']), { x: 1, y: 0 });
  assert.deepEqual(directionFromHeldKeys(['d', 'w']), { x: 1, y: -1 });
  assert.deepEqual(directionFromHeldKeys(['a', 'd']), { x: 0, y: 0 });
  assert.deepEqual(directionFromHeldKeys(['d', 'Tab']), { x: 1, y: 0 });
});

// --- portal tap -------------------------------------------------------------

const portalLevel = {
  portals: [
    { id: 'p1', pos: { x: 4, y: 7 }, exitPos: { x: 0, y: 0 } },
    { id: 'p2', pos: { x: 10, y: 2 }, exitPos: { x: 0, y: 0 } },
  ],
} as never;

test('portalAt matches on the floored tile, so mid-step positions still count', () => {
  assert.equal(portalAt(portalLevel, { x: 4, y: 7 })?.id, 'p1');
  assert.equal(portalAt(portalLevel, { x: 4.9, y: 7.4 })?.id, 'p1');
  assert.equal(portalAt(portalLevel, { x: 10, y: 2 })?.id, 'p2');
  assert.equal(portalAt(portalLevel, { x: 5, y: 7 }), null);
});

test('portalAt tolerates a missing level or portal list', () => {
  assert.equal(portalAt(null, { x: 0, y: 0 }), null);
  assert.equal(portalAt({} as never, { x: 0, y: 0 }), null);
});

test('tapHitsPortal accepts the 3x3 around the portal and nothing further', () => {
  const portal = { x: 4, y: 7 };
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      assert.ok(tapHitsPortal({ x: 4 + dx, y: 7 + dy }, portal), `${dx},${dy}`);
    }
  }
  for (const tile of [{ x: 2, y: 7 }, { x: 6, y: 7 }, { x: 4, y: 5 }, { x: 4, y: 9 }]) {
    assert.equal(tapHitsPortal(tile, portal), false, JSON.stringify(tile));
  }
  assert.equal(PORTAL_TAP_FORGIVENESS_TILES, 1);
});

test('portal destinations are floor tiles minus the exit', () => {
  const level = {
    width: 3,
    height: 3,
    exitPos: { x: 2, y: 2 },
    tiles: [
      ['floor', 'wall', 'floor'],
      ['wall', 'floor', 'floor'],
      ['floor', 'floor', 'floor'],
    ],
  } as never;
  const candidates = portalDestinationCandidates(level);
  assert.deepEqual(candidates, [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 0, y: 2 },
    { x: 1, y: 2 },
  ]);
  assert.ok(!candidates.some((c) => c.x === 2 && c.y === 2), 'the exit must never be a destination');
});

test('legacyScreenToTile floors after applying the camera offset', () => {
  assert.deepEqual(legacyScreenToTile({ x: 0, y: 0 }, { x: 0, y: 0 }, 32), { x: 0, y: 0 });
  assert.deepEqual(legacyScreenToTile({ x: 31, y: 31 }, { x: 0, y: 0 }, 32), { x: 0, y: 0 });
  assert.deepEqual(legacyScreenToTile({ x: 32, y: 0 }, { x: 0, y: 0 }, 32), { x: 1, y: 0 });
  assert.deepEqual(legacyScreenToTile({ x: 10, y: 10 }, { x: 64, y: 96 }, 32), { x: 2, y: 3 });
});
