// The fog falloff, in one place.
//
// `fogLayer` builds the radial gradient from these stops, and the threat-sense
// marker decides from them whether a mob is legible without help. Those two had
// no relationship before, which is how the marker ended up covering the whole
// lit disc: its gate was `distance > fogRadius`, and `fogRadius` is where the
// fog first becomes *fully* opaque — not where it starts to hide anything.

/**
 * Gradient stops as `[t, alpha]`, where `t` is the canvas gradient parameter.
 *
 * The gradient's inner circle sits at `0.5 × radius`, so `t` maps to distance
 * as `r = radius × (0.5 + 0.5t)`.
 */
export const FOG_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.4, 0.1],
  [0.6, 0.3],
  [0.8, 0.6],
  [0.95, 0.9],
  [1, 1],
];

/** Where the gradient's inner (fully clear) circle sits, as a fraction of radius. */
export const FOG_INNER_FRACTION = 0.5;

/** How opaque the fog is over a mob at `distance` from the player, 0–1. */
export function fogAlphaAtDistance(distance: number, radius: number): number {
  if (radius <= 0) return 1;
  const fraction = distance / radius;
  if (fraction <= FOG_INNER_FRACTION) return 0;
  if (fraction >= 1) return 1;

  // Back out the gradient parameter, then interpolate between the stops.
  const t = (fraction - FOG_INNER_FRACTION) / (1 - FOG_INNER_FRACTION);
  for (let i = 1; i < FOG_STOPS.length; i++) {
    const [prevT, prevAlpha] = FOG_STOPS[i - 1];
    const [nextT, nextAlpha] = FOG_STOPS[i];
    if (t <= nextT) {
      const span = nextT - prevT;
      const ratio = span === 0 ? 0 : (t - prevT) / span;
      return prevAlpha + (nextAlpha - prevAlpha) * ratio;
    }
  }
  return 1;
}

/**
 * How much fog a mob can sit under and still read as itself.
 *
 * 0.35 lands just past the 0.3 stop at `0.8 × radius`: inside that the sprite's
 * own colours carry, beyond it the mob is being swallowed and needs the marker.
 */
export const MARKER_FOG_ALPHA = 0.35;

/**
 * True when threat-sense should stamp its marker over a mob.
 *
 * Below the threshold the player can already see the actual mob — its silhouette,
 * its colour, its health bar — and painting an opaque red disc on top only takes
 * that away.
 */
export function needsThreatMarker(distance: number, fogRadius: number): boolean {
  return fogAlphaAtDistance(distance, fogRadius) >= MARKER_FOG_ALPHA;
}

/** The distance at which the marker starts, for culling and for tests. */
export function markerStartDistance(fogRadius: number): number {
  if (fogRadius <= 0) return 0;
  let lo = 0;
  let hi = fogRadius;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fogAlphaAtDistance(mid, fogRadius) >= MARKER_FOG_ALPHA) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function initFogGradientApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_FOG_GRADIENT__ = {
    fogAlphaAtDistance,
    needsThreatMarker,
    markerStartDistance,
    markerFogAlpha: MARKER_FOG_ALPHA,
    stops: FOG_STOPS.map((s) => [s[0], s[1]] as [number, number]),
    innerFraction: FOG_INNER_FRACTION,
  };
}

declare global {
  interface Window {
    __PIXLAB_FOG_GRADIENT__?: {
      fogAlphaAtDistance: typeof fogAlphaAtDistance;
      needsThreatMarker: typeof needsThreatMarker;
      markerStartDistance: typeof markerStartDistance;
      markerFogAlpha: number;
      stops: Array<[number, number]>;
      innerFraction: number;
    };
  }
}
