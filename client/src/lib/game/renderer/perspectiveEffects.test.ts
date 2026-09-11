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
  // 2 world effects plus one portal's sparks. The count is the top-down view's
  // steady state — 30% of frames at 60fps against a 1.25s mean life — so a
  // portal reads the same in both views rather than nearly inert in this one.
  assert.equal(effects.prepare(level, 500, 'high', []).length, 2 + 22);
  assert.equal(effects.prepare(level, 500, 'medium', []).length, 2 + 11);
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

test('portal sparks spread out and stagger instead of pulsing together', async () => {
  const { PerspectiveEffects } = await import('./perspectiveEffects');
  const level = { footprints: [], particles: [], afterimages: [], lightswitches: [],
    portals: [{ pos: { x: 10, y: 10 } }] } as unknown as Level;
  const effects = new PerspectiveEffects();
  const sparks = effects.prepare(level, 4321, 'high', []).slice();
  assert.equal(sparks.length, 22);

  // Radii from the portal centre, which is the thing that was wrong: the old
  // pass put every spark between 0.25 and 0.45 tiles out.
  const radii = sparks.map((s) => Math.hypot(s.x - 10.5, s.y - 10.5));
  assert.ok(Math.max(...radii) > 1, `sparks stay close in: max radius ${Math.max(...radii).toFixed(2)}`);
  assert.ok(Math.min(...radii) >= 0.25 - 1e-9, 'a spark started inside the rim');
  assert.ok(Math.max(...radii) <= 0.25 + 2.81 + 1e-9, 'a spark outran the top-down range');

  // Spread evenly around the portal, by octant rather than by quadrant: a
  // first cut of this drew bearings from a hash and passed a quadrant check
  // while visibly clumping — one octant took 6 sparks and two took 1, so the
  // portal spat mostly to its upper left. Even coverage is the property, and
  // only a bucket count fine enough to see it will hold.
  const octants = new Array(8).fill(0);
  for (const s of sparks) {
    const a = Math.atan2(s.y - 10.5, s.x - 10.5) + Math.PI * 2;
    octants[Math.floor((a % (Math.PI * 2)) / (Math.PI / 4))]++;
  }
  assert.ok(Math.min(...octants) >= 1, `an octant has no sparks: ${octants}`);
  assert.ok(Math.max(...octants) <= 4, `sparks clump into one bearing: ${octants}`);

  // Independent phases: one shared clock gave every spark the same alpha, so a
  // spread of them is what shows the periods are actually staggered.
  const alphas = sparks.map((s) => (s as unknown as { alpha: number }).alpha);
  assert.ok(new Set(alphas.map((a) => a.toFixed(2))).size > 10, 'sparks fade in lockstep');

  // Still pure: same clock in, same frame out.
  const again = new PerspectiveEffects().prepare(level, 4321, 'high', []);
  assert.deepEqual(again.map((s) => [s.x, s.y]), sparks.map((s) => [s.x, s.y]));
});
