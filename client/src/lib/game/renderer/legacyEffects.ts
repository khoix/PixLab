/**
 * M8.3 — the legacy top-down view's own particle effects, owned by the renderer.
 *
 * `Level.particles` had two owners. `update()` spawns moth-trail particles,
 * which both renderers draw. `draw()` spawned three more — portal sparkle,
 * threat-sense and loot-sense — straight onto the same array, in **screen
 * pixels**, from inside the render pass.
 *
 * The perspective renderer already knew this was wrong and worked around it:
 * `perspectiveEffects.ts` skipped anything whose id matched those three
 * prefixes, because "legacy portal/sense particles used screen pixels and were
 * created by its draw pass". So in perspective view they were spawned every
 * frame, accumulated on the level, filtered out, and never drawn.
 *
 * They live here now. The engine's array keeps only what the engine spawns, and
 * the workaround in the perspective renderer goes away.
 *
 * ## The bug this fixes
 *
 * The rAF loop calls `draw()` while the run is paused but not `update()` —
 * deliberately, so the camera follows a canvas resize with the inventory open.
 * But `getGameNow()` freezes while paused, so a particle's age stopped
 * advancing and nothing ever expired, while the spawn roll kept firing once per
 * drawn frame.
 *
 * Measured, standing on a portal: 20 particles in steady state running, 75
 * after three seconds paused, climbing about 17 a second for as long as the
 * inventory stayed open — each one re-filtered and re-drawn every frame.
 *
 * `spawn` refuses while frozen, which is the honest reading of a paused run:
 * no simulated time passes, so no new effects begin.
 */

export interface LegacyEffect {
  id: string;
  /** Screen pixels, not tiles. These only ever feed the legacy 2D pass. */
  pos: { x: number; y: number };
  createdAt: number;
  lifetime: number;
  velocity?: { x: number; y: number };
}

export interface LegacyEffectField {
  effects: LegacyEffect[];
}

export function createLegacyEffectField(): LegacyEffectField {
  return { effects: [] };
}

export function clearLegacyEffects(field: LegacyEffectField): void {
  field.effects.length = 0;
}

/**
 * Add an effect unless the run is frozen.
 *
 * `frozen` is passed rather than read from the clock so the field stays
 * testable without the clock module, and so the caller keeps one source of
 * truth for what "paused" means.
 */
export function spawnLegacyEffect(
  field: LegacyEffectField,
  effect: LegacyEffect,
  frozen: boolean,
): void {
  if (frozen) return;
  field.effects.push(effect);
}

/**
 * Advance velocities and drop anything past its lifetime.
 *
 * Returns the survivors, which is what the draw pass iterates. Integration is a
 * flat per-call step rather than per-millisecond, matching what the inline code
 * did — it added the velocity once per drawn frame, so the effects have always
 * moved at frame rate rather than at wall-clock rate. Preserved deliberately;
 * changing it would alter how the sparkles look.
 */
export function stepLegacyEffects(field: LegacyEffectField, now: number): LegacyEffect[] {
  const survivors: LegacyEffect[] = [];
  for (const effect of field.effects) {
    if (now - effect.createdAt > effect.lifetime) continue;
    if (effect.velocity) {
      effect.pos.x += effect.velocity.x;
      effect.pos.y += effect.velocity.y;
    }
    survivors.push(effect);
  }
  field.effects = survivors;
  return survivors;
}

/**
 * Drop sense effects that have come back into view.
 *
 * Sense sparkles mark what the fog is hiding, so once the real sprite reads
 * again its sparkles have to go. Distance is in screen pixels against the
 * subject's screen position, as it was inline.
 */
export function clearEffectsNear(
  field: LegacyEffectField,
  prefix: string,
  subjects: readonly { x: number; y: number }[],
  radius: number,
): void {
  if (subjects.length === 0) return;
  field.effects = field.effects.filter((effect) => {
    if (!effect.id.startsWith(prefix)) return true;
    for (const subject of subjects) {
      const dx = effect.pos.x - subject.x;
      const dy = effect.pos.y - subject.y;
      if (Math.sqrt(dx * dx + dy * dy) < radius) return false;
    }
    return true;
  });
}

/** Effects carrying a given id prefix, for the pass that draws them. */
export function effectsWithPrefix(
  field: LegacyEffectField,
  ...prefixes: readonly string[]
): LegacyEffect[] {
  return field.effects.filter((effect) => prefixes.some((p) => effect.id.startsWith(p)));
}
