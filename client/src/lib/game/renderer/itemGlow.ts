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

/**
 * Icon edge before perspective scaling: 1.35x the 20px native bitmap.
 *
 * Set by eye on a device, in two steps. It sat at a flat 20px for a long time
 * without anyone choosing that — `drawIcon` ignored the size it was given and
 * blitted the bitmap at its native 20x20, which is also why raising this to 26
 * once changed nothing at all. With that fixed the value finally reached the
 * artwork, and 40 (double the old render) overshot: a drop came out wider than
 * the wall block beside it. 27 is two thirds of that.
 *
 * It is an edge in legacy-sprite units, the same units as TILE_SIZE, so the
 * ratio to a one-tile voxel is just ICON_SIZE / 32 — a drop now reads a little
 * under a block wide at any distance. The perspective pass multiplies it by the
 * projected scale, so drops shrink with depth rather than holding one size.
 *
 * `GLOW_RADIUS` is a multiple of this, so the rarity pool follows the icon.
 */
export const ICON_SIZE = 27;

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

/** Where a bitmap of `imageWidth` x `imageHeight` lands inside a `size` box. */
export interface IconFit { dx: number; dy: number; width: number; height: number }

/**
 * Fit an icon bitmap into a square box without distorting it.
 *
 * The drawing code used to blit the bitmap at its native size and ignore the
 * box entirely. That was invisible while the only caller asked for 20 and the
 * icons are 20x20, but it meant the perspective drop and the loot-sense marker
 * were pinned to a flat 20px at every depth, and that raising the icon size
 * changed nothing at all.
 *
 * Scaling by the longer edge keeps a non-square asset inside the box instead of
 * stretching it to fill; the remainder is split so the artwork stays centred.
 * Every icon shipped today is square, so this fills the box exactly — the
 * aspect ratio is held for the assets, not just assumed of them.
 */
export function fitIconBox(imageWidth: number, imageHeight: number, size: number): IconFit {
  const longest = Math.max(imageWidth, imageHeight);
  if (!(longest > 0) || !Number.isFinite(size)) return { dx: 0, dy: 0, width: 0, height: 0 };
  const fit = size / longest;
  const width = imageWidth * fit, height = imageHeight * fit;
  return { dx: (size - width) / 2, dy: (size - height) / 2, width, height };
}
