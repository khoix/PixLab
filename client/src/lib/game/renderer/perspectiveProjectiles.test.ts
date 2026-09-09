import assert from 'node:assert/strict';
import test from 'node:test';
import type { Projectile } from '../types';
import { PerspectiveProjectiles } from './perspectiveProjectiles';
import { createPerspectiveCamera, perspectiveScale, worldToScreen } from './projection';
import { compareWorldOrder } from './worldGeometry';

const shot = (id: string, x: number, y: number) => ({ id, pos: { x, y }, velocity: { x: 1, y: 0 },
  damage: 3, ownerId: 'boss', cadenceMs: 1000, lifetime: 3000, createdAt: 10, isBoss: true } satisfies Projectile);
const camera = createPerspectiveCamera({ player: { x: 12, y: 14 }, width: 800, height: 600,
  tileSize: 32, isMobile: false });

test('projectile submission preserves fractional trajectories, state, and stable records across reordering', () => {
  const adapter = new PerspectiveProjectiles(), a = shot('a', 12.25, 10.75), b = shot('b', 12, 12);
  const before = JSON.stringify([a, b]);
  const first = adapter.prepare([a, b], 'high'), record = first[0], id = record.orderId;
  assert.equal(record.x, 12.75); assert.equal(record.y, 11.25);
  assert.equal(JSON.stringify([a, b]), before);
  a.pos.x += 0.125;
  const moved = adapter.prepare([b, a], 'low')[1];
  assert.equal(moved, record); assert.equal(moved.orderId, id);
  assert.equal(moved.x, 12.875);
  assert.ok(worldToScreen(camera, moved)!.x > worldToScreen(camera, { x: 12.75, y: 11.25 })!.x);
  assert.equal(adapter.prepare([], 'low').length, 0);
});

test('near shots scale up and cross the same wall order as the rest of the world', () => {
  const adapter = new PerspectiveProjectiles();
  const entries = adapter.prepare([shot('far', 12, 10), shot('near', 12, 12)], 'high');
  const wall = { x: 12.5, y: 11.5, orderId: 1 };
  assert.ok(perspectiveScale(camera, entries[1])! > perspectiveScale(camera, entries[0])!);
  assert.ok(compareWorldOrder(camera, entries[0], wall) < 0);
  assert.ok(compareWorldOrder(camera, entries[1], wall) > 0);
});
