import assert from 'node:assert/strict';
import test from 'node:test';
import { trackStableViewport } from './cameraAnchor';
import {
  clientToCanvas, createPerspectiveCamera, perspectiveScale, projectedTileCorners,
  screenToGround, screenToTile, tileCenter, worldDepth, worldToScreen,
} from './projection';

const input = { player: { x: 20, y: 20 }, width: 800, height: 600, isMobile: false, tileSize: 32 };
const camera = createPerspectiveCamera(input);
function close(a: number, b: number): void { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); }

test('near tiles and sprites are visibly larger than distant ones', () => {
  const near = tileCenter({ x: 20, y: 24 });
  const far = tileCenter({ x: 20, y: 16 });
  assert.ok(perspectiveScale(camera, near)! > perspectiveScale(camera, far)! * 1.5);
  const n = projectedTileCorners(camera, { x: 20, y: 24 })!;
  const f = projectedTileCorners(camera, { x: 20, y: 16 })!;
  assert.ok(n[1].x - n[0].x > f[1].x - f[0].x);
  assert.ok(n[3].y - n[0].y > f[3].y - f[0].y);
  assert.ok(worldDepth(camera, far) > worldDepth(camera, near));
});

test('horizontal rows stay horizontal and a tile has a wider near edge', () => {
  for (const y of [12, 20, 28]) {
    const left = worldToScreen(camera, { x: 15, y })!;
    const right = worldToScreen(camera, { x: 25, y })!;
    close(left.y, right.y);
    assert.ok(right.x > left.x);
  }
  const [tl, tr, br, bl] = projectedTileCorners(camera, { x: 20, y: 20 })!;
  close(tl.y, tr.y);
  close(bl.y, br.y);
  assert.ok(br.x - bl.x > tr.x - tl.x);
});

test('depth recedes upward toward one central vanishing point', () => {
  const vanishingY = camera.anchor.y - camera.focalLength * camera.sinPitch / camera.cosPitch;
  for (const x of [16, 25]) {
    const near = worldToScreen(camera, { x, y: 20 })!;
    const far = worldToScreen(camera, { x, y: 5 })!;
    assert.ok(far.y < near.y);
    assert.ok(Math.abs(far.x - camera.anchor.x) < Math.abs(near.x - camera.anchor.x));
    // Both points lie on the same line through the vanishing point.
    close((near.x - camera.anchor.x) / (near.y - vanishingY),
      (far.x - camera.anchor.x) / (far.y - vanishingY));
  }
});

test('world/screen/world round trips fractional and negative coordinates across pitches', () => {
  for (const pitchDegrees of [30, 60, 80]) {
    const c = createPerspectiveCamera({ ...input, settings: { pitchDegrees } });
    for (const x of [-5.7, 0, 20.5, 32.25]) {
      for (const y of [-10.2, 16.25, 20.5, 25.4]) {
        const screen = worldToScreen(c, { x, y })!;
        const ground = screenToGround(c, screen)!;
        close(ground.x, x);
        close(ground.y, y);
      }
    }
  }
});

test('tile centers pick their original tile, including negative indices', () => {
  for (const tile of [{ x: 20, y: 20 }, { x: 12, y: 5 }, { x: -2, y: -3 }]) {
    assert.deepEqual(screenToTile(camera, worldToScreen(camera, tileCenter(tile))!), tile);
  }
});

test('interpolated player remains at anchor and camera follows translation exactly', () => {
  for (const player of [{ x: 20, y: 20 }, { x: 20.125, y: 20.875 }, { x: 120, y: 40 }]) {
    const c = createPerspectiveCamera({ ...input, player });
    assert.deepEqual(worldToScreen(c, tileCenter(player)), c.anchor);
    const relative = worldToScreen(c, { x: c.focus.x + 2, y: c.focus.y - 3 })!;
    const original = worldToScreen(camera, { x: camera.focus.x + 2, y: camera.focus.y - 3 })!;
    close(relative.x, original.x);
    close(relative.y, original.y);
  }
});

test('mobile chrome preserves anchor and perspective scale; rotation and short windows re-anchor', () => {
  let vp = trackStableViewport(null, 393, 727);
  const build = (height: number) => createPerspectiveCamera({ ...input, width: 393, height,
    stableHeight: vp.height, isMobile: true });
  const full = build(727);
  vp = trackStableViewport(vp, 393, 652);
  const small = build(652);
  assert.deepEqual(small.anchor, full.anchor);
  assert.deepEqual(worldToScreen(full, { x: 23, y: 16 }), worldToScreen(small, { x: 23, y: 16 }));
  vp = trackStableViewport(vp, 727, 393);
  const rotated = createPerspectiveCamera({ ...input, width: vp.width, height: vp.height,
    stableHeight: vp.height, isMobile: true });
  close(rotated.anchor.y, 393 * 0.43);
  close(build(60).anchor.y, 12);
});

test('invalid rays, clipped geometry and nonfinite inputs never produce bogus picks', () => {
  const horizon = camera.anchor.y - camera.focalLength * camera.sinPitch / camera.cosPitch;
  for (const y of [horizon, horizon - 1, horizon + 0.001]) {
    assert.equal(screenToGround(camera, { x: 400, y }), null);
  }
  for (const y of [camera.focus.y + 100, camera.focus.y - 100]) {
    assert.equal(worldToScreen(camera, { x: 20, y }), null);
  }
  assert.equal(projectedTileCorners(camera, { x: 20, y: 32 }), null);
  assert.equal(worldToScreen(camera, { x: NaN, y: 20 }), null);
  assert.equal(screenToGround(camera, { x: Infinity, y: 20 }), null);
  assert.throws(() => createPerspectiveCamera({ ...input, settings: { pitchDegrees: 90 } }), RangeError);
  assert.throws(() => createPerspectiveCamera({ ...input, settings: { nearDepthTiles: 9 } }), RangeError);
});

test('client picks account for canvas offsets and CSS scaling independently of DPR', () => {
  const rect = { left: 10, top: 25, width: 400, height: 300 };
  const screen = clientToCanvas({ x: 210, y: 175 }, rect, camera)!;
  assert.deepEqual(screen, camera.anchor);
  assert.deepEqual(screenToTile(camera, screen), input.player);
  assert.equal(clientToCanvas({ x: 9, y: 175 }, rect, camera), null);
  assert.equal(clientToCanvas({ x: 410, y: 175 }, rect, camera), null);
  assert.equal(clientToCanvas({ x: 210, y: 175 }, { ...rect, width: 0 }, camera), null);
});

test('focal length and camera distance control framing without moving the anchor', () => {
  const zoomed = createPerspectiveCamera({ ...input, settings: { focalLengthTiles: 24 } });
  close(perspectiveScale(zoomed, zoomed.focus)!, 2 * perspectiveScale(camera, camera.focus)!);
  const closer = createPerspectiveCamera({ ...input, settings: { distanceTiles: 4 } });
  close(perspectiveScale(closer, closer.focus)!, 2 * perspectiveScale(camera, camera.focus)!);
  assert.deepEqual(worldToScreen(closer, closer.focus), camera.anchor);
});
