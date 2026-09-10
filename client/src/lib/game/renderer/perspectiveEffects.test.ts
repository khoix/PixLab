import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveEffects } from './perspectiveEffects';
import { PerspectiveFog } from './perspectiveFog';
import { createPerspectiveCamera } from './projection';
import { fogAlphaAtDistance } from './fogGradient';
import type { Level } from '../types';

const input = { player: { x: 12, y: 14 }, width: 800, height: 600, tileSize: 32, isMobile: false };
test('fog preserves the logical radial falloff, including reduced and zero vision', () => {
  const camera = createPerspectiveCamera(input), fog = new PerspectiveFog();
  for (const radius of [0, 1.75, 3.5, 1000]) {
    fog.prepare(camera, radius, 'low');
    for (const distance of [0, 1, 2, 3.5, 6]) for (const angle of [0, Math.PI / 2, Math.PI]) {
      const point = { x: camera.focus.x + Math.cos(angle) * distance, y: camera.focus.y + Math.sin(angle) * distance };
      assert.ok(Math.abs(fog.visibilityAt(point) - (1 - fogAlphaAtDistance(distance, radius))) < 1e-10);
    }
  }
});
test('following translation does not change footpoint visibility', () => {
  const fog = new PerspectiveFog();
  const a = fog.prepare(createPerspectiveCamera(input), 3.5, 'high').visibilityAt({ x: 13.5, y: 16.5 });
  const b = fog.prepare(createPerspectiveCamera({ ...input, player: { x: 112, y: 114 } }), 3.5, 'high')
    .visibilityAt({ x: 113.5, y: 116.5 });
  assert.equal(a, b);
});
test('effects retain world foot offsets, expire, pool records, and never mutate simulation', () => {
  const level = { footprints: [{ pos: { x: 2, y: 3 }, direction: { x: 1, y: 0 }, isLeftFoot: true, createdAt: 0, lifetime: 1000 }],
    particles: [{ id: 'moth', pos: { x: 4, y: 5 }, createdAt: 0, lifetime: 1000 },
      { id: 'portal-particle-old', pos: { x: 999, y: 999 }, createdAt: 0, lifetime: 1000 }],
    portals: [{ pos: { x: 6, y: 7 } }], afterimages: [], lightswitches: [] } as unknown as Level;
  const before = JSON.stringify(level), effects = new PerspectiveEffects();
  const first = effects.prepare(level, 500, 'low', []), foot = first[0];
  assert.equal(first.length, 2); assert.equal(foot.x, 2.5); assert.equal(foot.y, 3.35);
  assert.equal(effects.prepare(level, 600, 'low', [])[0], foot);
  assert.equal(effects.prepare(level, 1001, 'low', []).length, 0);
  assert.equal(effects.prepare(level, 500, 'high', []).length, 6);
  assert.equal(JSON.stringify(level), before);
});

test('vision debuffs and temporary reveals reach projection through the unchanged frame snapshot', async () => {
  const { buildDrawFrameSnapshot } = await import('./drawSnapshot');
  const { INITIAL_STATS } = await import('../constants');
  const base = { stats: INITIAL_STATS, loadout: { weapon: null, armor: null, utility: null }, activeMods: [],
    temporaryVisionBoost: null, lightswitchRevealEndTime: null, visionDebuffLevel: 0,
    logicalWidth: 800, logicalHeight: 600, tileSize: 32, isMobileViewport: false, now: 1000 };
  const normal = buildDrawFrameSnapshot(base), reduced = buildDrawFrameSnapshot({ ...base, visionDebuffLevel: 0.5 });
  assert.equal(reduced.fogRadius, normal.fogRadius / 2);
  const camera = createPerspectiveCamera(input), fog = new PerspectiveFog();
  const point = { x: camera.focus.x + normal.fogRadius / 64, y: camera.focus.y };
  assert.equal(fog.prepare(camera, normal.fogRadius / 32, 'high').visibilityAt(point), 1);
  assert.equal(fog.prepare(camera, reduced.fogRadius / 32, 'high').visibilityAt(point), 0);
  const reveal = buildDrawFrameSnapshot({ ...base, lightswitchRevealEndTime: 2000 });
  assert.equal(fog.prepare(camera, reveal.fogRadius / 32, 'low').visibilityAt(point), 1);
});
