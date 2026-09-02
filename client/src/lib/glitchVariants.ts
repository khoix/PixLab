// Catalogue of broadcast glitch flavours used by the menu screens. Each maps to
// a CSS block in styles/ambience.css keyed on [data-glitch-variant].

export const GLITCH_VARIANTS = ['tear', 'roll', 'static', 'chroma', 'hsync'] as const;
export type GlitchVariant = (typeof GLITCH_VARIANTS)[number];

/** Per-variant on-screen time; varied so pulses don't feel metronomic. */
export const GLITCH_DURATION_MS: Record<GlitchVariant, number> = {
  /** Tear band + sync line sweep with a chromatic title split (the original). */
  tear: 380,
  /** Vertical hold slips: the picture rolls up and snaps back behind a blanking bar. */
  roll: 560,
  /** Burst of signal noise with a brightness/contrast flicker. */
  static: 320,
  /** Slow chromatic aberration drift that snaps back into register. */
  chroma: 720,
  /** Horizontal sync slip: block-noise strips and stepped sideways smear. */
  hsync: 460,
};

/** Gap between automatic pulses — lower and wider than the original 6–14 s. */
export const GLITCH_MIN_DELAY_MS = 9000;
export const GLITCH_MAX_DELAY_MS = 24000;
export const GLITCH_INITIAL_DELAY_MS = 3000;

export function pickGlitchVariant(
  previous: GlitchVariant | null,
  random: () => number = Math.random,
): GlitchVariant {
  const pool = previous ? GLITCH_VARIANTS.filter((v) => v !== previous) : [...GLITCH_VARIANTS];
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}

export function isGlitchVariant(value: unknown): value is GlitchVariant {
  return typeof value === 'string' && (GLITCH_VARIANTS as readonly string[]).includes(value);
}
