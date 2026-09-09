import assert from 'node:assert/strict';
import test from 'node:test';
import type { Entity, MobSubtype } from '../types';
import { billboardLayout, entityAppearance, projectedDirection } from './entityBillboard';
import { createPerspectiveCamera, tileCenter, worldToScreen } from './projection';
import { compareWorldOrder } from './worldGeometry';

const camera = createPerspectiveCamera({ player: { x: 15.25, y: 15.75 }, width: 800, height: 600,
  isMobile: false, tileSize: 32 });
const mob = (mobSubtype: MobSubtype) => ({ mobSubtype, pos: { x: 15, y: 15 }, isBoss: mobSubtype.startsWith('boss_') } as Entity);
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('every subtype rests its semantic foot on the projected ground, independent of glow', () => {
  for (const subtype of ['phase', 'charger', 'turret', 'sniper', 'moth', 'guardian', 'swarm', 'boss_ares'] as MobSubtype[]) {
    const entity = mob(subtype), before = JSON.stringify(entity), art = entityAppearance(entity);
    for (const y of [10.1, 15.9, 20]) {
      const foot = { x: 15.5, y }, p = billboardLayout(camera, foot, art)!;
      close(p.centerY + art.bottom * p.scale, worldToScreen(camera, foot)!.y);
      close(p.topY, p.centerY - art.top * p.scale);
    }
    assert.equal(JSON.stringify(entity), before);
  }
  assert.ok(entityAppearance(mob('phase')).bottom > entityAppearance(mob('phase')).size / 2);
  close(entityAppearance(mob('moth')).bottom, 14 / 3);
});

test('billboard size and overlay anchors follow depth without tilting the body', () => {
  const art = entityAppearance(mob('charger'));
  const far = billboardLayout(camera, { x: 15.5, y: 10.5 }, art)!;
  const near = billboardLayout(camera, { x: 15.5, y: 20.5 }, art)!;
  assert.ok(near.scale > far.scale * 1.5);
  assert.ok(near.footY - near.topY > far.footY - far.topY);
  assert.ok(near.barWidth >= far.barWidth);
});

test('interpolated player feet stay exactly on the camera anchor during movement and mobile resizing', () => {
  for (const width of [393, 800]) for (const y of [15, 15.1, 15.45, 16]) {
    const c = createPerspectiveCamera({ player: { x: 15.2, y }, width, height: 600,
      stableHeight: 675, tileSize: 32, isMobile: width < 768 });
    const p = billboardLayout(c, c.focus, entityAppearance(null))!;
    close(p.x, c.anchor.x); close(p.footY, c.anchor.y);
  }
});

test('cardinal aiming uses projected direction including off-center depth convergence', () => {
  for (const x of [12, camera.focus.x, 19]) {
    const foot = { x, y: 15.5 };
    const n = projectedDirection(camera, foot, { x: 0, y: -1 })!;
    const s = projectedDirection(camera, foot, { x: 0, y: 1 })!;
    const e = projectedDirection(camera, foot, { x: 1, y: 0 })!;
    const w = projectedDirection(camera, foot, { x: -1, y: 0 })!;
    assert.ok(n.y < 0 && s.y > 0 && e.x > 0 && w.x < 0);
    close(e.y, 0); close(w.y, 0);
    if (x !== camera.focus.x) assert.equal(Math.sign(n.x), Math.sign(camera.focus.x - x));
  }
  assert.equal(projectedDirection(camera, camera.focus, { x: 0, y: 0 }), null);
});

test('fractional entity motion crosses the same deterministic wall depth order', () => {
  const wall = { ...tileCenter({ x: 15, y: 15 }), orderId: 42 };
  const behind = { x: 15.5, y: 15.49, orderId: 1000 };
  const front = { ...behind, y: 15.51 };
  assert.ok(compareWorldOrder(camera, behind, wall) < 0);
  assert.ok(compareWorldOrder(camera, front, wall) > 0);
  assert.equal(compareWorldOrder(camera, wall, wall), 0);
});
