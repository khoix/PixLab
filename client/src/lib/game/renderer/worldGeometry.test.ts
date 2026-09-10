import assert from 'node:assert/strict';
import test from 'node:test';
import type { Level, TileType } from '../types';
import { createPerspectiveCamera, screenToGround, visiblePlaneBounds, worldToScreen, writeCameraVertex } from './projection';
import { ProjectedPolygon } from './projectedPolygon';
import { compareWorldOrder, WALL_SIDE, WorldTopology } from './worldGeometry';

const input = { player: { x: 20, y: 20 }, width: 800, height: 600, isMobile: false, tileSize: 32 };
const camera = createPerspectiveCamera(input);
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const level = (tiles: TileType[][]): Level => ({ width: tiles[0].length, height: tiles.length, tiles } as Level);

test('wall elevation raises geometry and uses the same perspective as ground', () => {
  const point = { x: 22, y: 19 };
  const base = worldToScreen(camera, point)!;
  const top = worldToScreen(camera, point, 1)!;
  assert.ok(top.y < base.y);
  assert.ok(top.x - camera.anchor.x > base.x - camera.anchor.x);
  const inverse = screenToGround(camera, top, 1)!;
  close(inverse.x, point.x); close(inverse.y, point.y);
  const vertex = new Float64Array(3);
  writeCameraVertex(camera, point.x, point.y, 1, vertex, 0);
  close(camera.anchor.x + camera.focalLength * vertex[0] / vertex[2], top.x);
  close(camera.anchor.y + camera.focalLength * vertex[1] / vertex[2], top.y);
});

test('adjacent projected wall tops share exactly the same edge', () => {
  const v = new Float64Array(18);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) writeCameraVertex(camera, 19 + x, 20 + y, 1, v, (y * 3 + x) * 3);
  const a = new ProjectedPolygon(), b = new ProjectedPolygon();
  assert.ok(a.project(camera, v, [0, 1, 4, 3]));
  assert.ok(b.project(camera, v, [1, 2, 5, 4]));
  assert.deepEqual([...a.points.slice(2, 4)], [...b.points.slice(0, 2)]);
  assert.deepEqual([...a.points.slice(4, 6)], [...b.points.slice(6, 8)]);
});

test('quads crossing near/far planes clip to finite polygons instead of disappearing', () => {
  const c = createPerspectiveCamera({ ...input, height: 4000 });
  const poly = new ProjectedPolygon(), v = new Float64Array(12);
  for (const depths of [[1, 3], [47, 49]]) {
    // Camera-space rectangle crossing the requested plane, centered in view.
    v.set([-0.5, -0.5, depths[0], 0.5, -0.5, depths[0], 0.5, 0.5, depths[1], -0.5, 0.5, depths[1]]);
    assert.ok(poly.project(c, v, [0, 1, 2, 3]));
    assert.ok(poly.count >= 3);
    assert.ok([...poly.points.slice(0, poly.count * 2)].every(Number.isFinite));
  }
  v.set([-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1]);
  assert.equal(poly.project(c, v, [0, 1, 2, 3]), false);
});

test('culling retains visible ground and wall tops, including a viewport crossing the horizon', () => {
  const bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  for (const height of [300, 800, 4000]) {
    const c = createPerspectiveCamera({ ...input, height });
    for (const z of [0, 1]) {
      visiblePlaneBounds(c, z, bounds);
      for (let y = -50; y < 34; y += 0.73) for (let x = 0; x < 40; x += 1.3) {
        const p = worldToScreen(c, { x, y }, z);
        if (!p || p.x < 0 || p.x > c.width || p.y < 0 || p.y > c.height) continue;
        assert.ok(x >= bounds.minX - 1e-8 && x <= bounds.maxX + 1e-8);
        assert.ok(y >= bounds.minY - 1e-8 && y <= bounds.maxY + 1e-8);
      }
    }
  }
});

test('shared internal wall faces are removed; openings expose the new boundary', () => {
  const l = level([['floor', 'floor', 'floor'], ['floor', 'wall', 'wall'], ['floor', 'floor', 'floor']]);
  const topology = new WorldTopology(), bounds = { minX: 0, minY: 0, maxX: 3, maxY: 3 };
  topology.sync(l, bounds);
  assert.equal(topology.exposed[4] & WALL_SIDE.east, 0);
  assert.equal(topology.exposed[5] & WALL_SIDE.west, 0);
  const records = topology.records, kinds = topology.kinds;
  topology.sync(l, bounds);
  assert.equal(topology.builds, 1);
  assert.equal(topology.records, records);
  l.tiles[1][2] = 'exit';
  topology.sync(l, bounds);
  assert.ok(topology.exposed[4] & WALL_SIDE.east);
  assert.equal(topology.exposed[5], 0);
  assert.equal(topology.kinds[5], 2);
  assert.equal(topology.kinds, kinds);
  assert.equal(topology.edits, 1);
});

test('new levels of the same dimensions rebuild static topology', () => {
  const topology = new WorldTopology(), bounds = { minX: 0, minY: 0, maxX: 2, maxY: 1 };
  topology.sync(level([['wall', 'floor']]), bounds);
  topology.sync(level([['floor', 'wall']]), bounds);
  assert.deepEqual([...topology.kinds], [0, 1]);
  assert.equal(topology.builds, 2);
});

test('wall/entity ordering is deterministic, far-to-near and lateral-far-to-close', () => {
  const entries = [{ x: 20.5, y: 22, orderId: 4 }, { x: 20.5, y: 18, orderId: 1 },
    { x: 20.5, y: 20, orderId: 3 }, { x: 15.5, y: 20, orderId: 2 }];
  const sorted = entries.sort((a, b) => compareWorldOrder(camera, a, b));
  assert.deepEqual(sorted.map(e => e.orderId), [1, 2, 3, 4]);
  assert.ok(compareWorldOrder(camera, { x: 20, y: 20, orderId: 8 }, { x: 20, y: 20, orderId: 9 }) < 0);
});
