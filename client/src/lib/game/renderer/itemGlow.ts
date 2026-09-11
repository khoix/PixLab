// The look of a dropped item in the perspective view, as plain values.
//
// A drop used to be two voxel boxes: a dark base and a rarity-coloured slab on
// top. The slab's top face is a filled quad, and projected that is a hard-edged
// square — which is what showed under every item on the floor. Recolouring it
// does not help; a quad has edges whatever the fill. The rarity colour is now a
// radial pool of light on the ground instead, and the drop is its icon plus
// that pool.
//
// Kept apart from `perspectiveItems` for the same reason `fogGradient` is kept
// apart from `fogLayer`: the drawing code reaches `itemIcons`, which reads
// `import.meta.env`, and that cannot be imported outside Vite. These values
// have no imports at all, so they can be tested directly.

/** Icon edge before perspective scaling. Raised from 20 — drops read small. */
export const ICON_SIZE = 26;

/**
 * How high the icon sits above the floor. It was 0.18 to clear the voxel
 * plinth; with the plinth gone it drops closer to its own pool of light, so the
 * two read as one object rather than a sprite hovering over a stain.
 */
export const ICON_HOVER = 0.08;

/** Pool radius, as a multiple of the icon edge, so the two scale together. */
export const GLOW_RADIUS = 0.85;

/**
 * How far the pool is squashed vertically to lie in the ground plane. The
 * entity contact shadows use 0.6 for the same reason; a touch flatter reads
 * better under a small prop.
 */
export const GROUND_SQUASH = 0.55;

/**
 * Radial stops as `[offset, alpha]`.
 *
 * The shape of this table is the whole difference between a glow and the square
 * it replaced: a filled quad is one alpha with a hard boundary, this is a
 * falloff that reaches zero. The alphas must decrease and the last must be 0 —
 * anything else puts an edge back.
 */
export const GLOW_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.5],
  [0.4, 0.24],
  [0.75, 0.07],
  [1, 0],
];

/**
 * `#rrggbb` to `rgba(...)`.
 *
 * Every stop carries the same rgb, including the transparent one: fading to a
 * bare `transparent` interpolates through grey and leaves a dirty fringe.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
