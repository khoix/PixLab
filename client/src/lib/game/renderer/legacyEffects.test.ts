import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearEffectsNear,
  clearLegacyEffects,
  createLegacyEffectField,
  effectsWithPrefix,
  spawnLegacyEffect,
  stepLegacyEffects,
  type LegacyEffect,
} from './legacyEffects';

const effect = (over: Partial<LegacyEffect> = {}): LegacyEffect => ({
  id: 'portal-particle-1',
  pos: { x: 0, y: 0 },
  createdAt: 0,
  lifetime: 1000,
  ...over,
});

test('a frozen run spawns nothing — the pause leak, as an assertion', () => {
  // Standing on a portal, the old code grew from 20 particles to 75 over three
  // paused seconds and kept climbing, because draw() still ran, the spawn roll
  // still fired, and getGameNow() was frozen so nothing aged out.
  const field = createLegacyEffectField();
  for (let i = 0; i < 200; i++) spawnLegacyEffect(field, effect({ id: `p-${i}` }), true);
  assert.equal(field.effects.length, 0);
});

test('a running one spawns normally', () => {
  const field = createLegacyEffectField();
  spawnLegacyEffect(field, effect(), false);
  assert.equal(field.effects.length, 1);
});

test('effects expire strictly past their lifetime', () => {
  const field = createLegacyEffectField();
  spawnLegacyEffect(field, effect({ id: 'a', createdAt: 0, lifetime: 100 }), false);
  assert.equal(stepLegacyEffects(field, 100).length, 1, 'exactly at lifetime still lives');
  assert.equal(stepLegacyEffects(field, 101).length, 0, 'past lifetime is dropped');
  assert.equal(field.effects.length, 0, 'and the field is compacted');
});

test('velocity integrates once per step, matching the inline behaviour', () => {
  const field = createLegacyEffectField();
  spawnLegacyEffect(
    field,
    effect({ pos: { x: 10, y: 20 }, velocity: { x: 2, y: -3 }, lifetime: 10_000 }),
    false,
  );
  stepLegacyEffects(field, 1);
  assert.deepEqual(field.effects[0].pos, { x: 12, y: 17 });
  stepLegacyEffects(field, 2);
  assert.deepEqual(field.effects[0].pos, { x: 14, y: 14 });
});

test('effects without a velocity stay put', () => {
  const field = createLegacyEffectField();
  spawnLegacyEffect(field, effect({ pos: { x: 5, y: 5 }, lifetime: 10_000 }), false);
  stepLegacyEffects(field, 1);
  assert.deepEqual(field.effects[0].pos, { x: 5, y: 5 });
});

test('sense effects near a subject that is visible again are dropped', () => {
  const field = createLegacyEffectField();
  spawnLegacyEffect(field, effect({ id: 'threatsense-sparkle-1', pos: { x: 100, y: 100 } }), false);
  spawnLegacyEffect(field, effect({ id: 'threatsense-sparkle-2', pos: { x: 400, y: 400 } }), false);
  spawnLegacyEffect(field, effect({ id: 'portal-particle-9', pos: { x: 100, y: 100 } }), false);

  clearEffectsNear(field, 'threatsense-sparkle-', [{ x: 105, y: 105 }], 48);

  const ids = field.effects.map((e) => e.id).sort();
  assert.deepEqual(ids, ['portal-particle-9', 'threatsense-sparkle-2'],
    'only the nearby sparkle goes; a portal particle at the same point is untouched');
});

test('clearEffectsNear with no subjects is a no-op', () => {
  const field = createLegacyEffectField();
  spawnLegacyEffect(field, effect({ id: 'threatsense-sparkle-1' }), false);
  clearEffectsNear(field, 'threatsense-sparkle-', [], 48);
  assert.equal(field.effects.length, 1);
});

test('effectsWithPrefix selects across several prefixes', () => {
  const field = createLegacyEffectField();
  for (const id of ['portal-particle-1', 'threatsense-sparkle-1', 'lootsense-sparkle-1', 'moth-3']) {
    spawnLegacyEffect(field, effect({ id }), false);
  }
  const sense = effectsWithPrefix(field, 'threatsense-sparkle-', 'lootsense-sparkle-');
  assert.deepEqual(sense.map((e) => e.id), ['threatsense-sparkle-1', 'lootsense-sparkle-1']);
  assert.equal(effectsWithPrefix(field, 'portal-particle-').length, 1);
});

test('clearing empties the field in place', () => {
  const field = createLegacyEffectField();
  spawnLegacyEffect(field, effect(), false);
  const sameArray = field.effects;
  clearLegacyEffects(field);
  assert.equal(field.effects.length, 0);
  assert.equal(field.effects, sameArray, 'cleared in place, so a held reference stays valid');
});
