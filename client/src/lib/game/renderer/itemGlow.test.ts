import { strict as assert } from 'node:assert';
import test from 'node:test';
import { GLOW_RADIUS, GLOW_STOPS, ICON_SIZE, withAlpha } from './itemGlow';

/**
 * A dropped item used to sit on a voxel slab whose top face was filled with the
 * flat rarity colour. Projected, a filled quad is a hard-edged square, and that
 * is what showed under every drop. The colour now comes from a radial pool on
 * the floor instead.
 *
 * These assert the property that distinguishes the two, rather than any
 * particular look: a glow is a falloff that reaches zero, a quad is one alpha
 * with a boundary.
 */

test('the glow falls off to nothing, so it has no edge', () => {
  assert.ok(GLOW_STOPS.length >= 3, 'two stops is a ramp, not a falloff');

  const offsets = GLOW_STOPS.map(([offset]) => offset);
  const alphas = GLOW_STOPS.map(([, alpha]) => alpha);

  assert.equal(offsets[0], 0, 'the pool has to start at its centre');
  assert.equal(offsets[offsets.length - 1], 1, 'and run to the full radius');
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i] > offsets[i - 1], `offset ${i} does not advance`);
    assert.ok(alphas[i] < alphas[i - 1], `alpha ${i} does not fade`);
  }

  // The one that matters: a stop table ending anywhere above zero draws a disc
  // with a visible rim, which is the square problem in a rounder shape.
  assert.equal(alphas[alphas.length - 1], 0, 'the outer stop must be transparent');
  assert.ok(alphas[0] > 0 && alphas[0] <= 0.6, 'the centre should read as light, not paint');
});

test('the pool is wide enough to sit under the icon rather than behind it', () => {
  // Radius is a multiple of the icon edge, so the two scale together with
  // perspective and the glow never shrinks into a dot on a distant drop.
  assert.ok(GLOW_RADIUS > 0.5, 'a pool narrower than half the icon reads as a shadow');
  assert.ok(GLOW_RADIUS <= 1.5, 'and a very wide one washes the floor out');
  assert.ok(ICON_SIZE >= 24, 'icons were raised from 20; keep them legible on a phone');
});

test('stops keep the rarity hue while fading, including at zero', () => {
  // Fading to a bare `transparent` interpolates through grey on some engines
  // and leaves a dirty fringe, so every stop carries the same rgb.
  assert.equal(withAlpha('#ffd700', 0.5), 'rgba(255, 215, 0, 0.5)');
  assert.equal(withAlpha('#ffd700', 0), 'rgba(255, 215, 0, 0)');
  assert.equal(withAlpha('#2196f3', 0.24), 'rgba(33, 150, 243, 0.24)');
  assert.equal(withAlpha('#9e9e9e', 1), 'rgba(158, 158, 158, 1)');
});
