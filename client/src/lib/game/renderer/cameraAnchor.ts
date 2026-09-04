// Where the player's tile centre sits on screen. The camera is built around it,
// so anything that moves this value moves the whole world.
//
// The anchor used to be a plain fraction of the *live* canvas height. On a phone
// the run root is sized in `100dvh` (see `.run-active` in index.css), and `dvh`
// tracks the browser chrome: the moment the URL bar appears the canvas loses
// ~75 px, the anchor drops with it, and the world visibly jumps up. Tapping the
// in-game menu is exactly when a phone reveals that chrome, so the jump read as
// "the screen shifts when the game pauses" — but nothing about pausing caused
// it, and it happened mid-run too.
//
// The anchor is now measured against the tallest height seen at this viewport
// width instead, so chrome sliding in and out leaves the world where it is. A
// real resize — rotating the device, a desktop window drag — changes the width
// or exceeds the remembered height, and the anchor follows as it always did.

/**
 * Smallest gap, in px, to keep between the anchor and the bottom of a shrunken
 * viewport, so a very short window can never push the player off-screen.
 */
export const ANCHOR_BOTTOM_MARGIN_PX = 48;

export interface StableViewport {
  /** Width the remembered height belongs to; a change means a real resize. */
  width: number;
  /** Tallest logical height seen at that width. */
  height: number;
}

/** Fold a new frame's dimensions into the remembered viewport. */
export function trackStableViewport(
  current: StableViewport | null,
  logicalWidth: number,
  logicalHeight: number,
): StableViewport {
  if (!current || current.width !== logicalWidth) {
    return { width: logicalWidth, height: logicalHeight };
  }
  if (logicalHeight > current.height) {
    return { width: logicalWidth, height: logicalHeight };
  }
  return current;
}

/**
 * Anchor Y in px. Measured against the remembered height so browser chrome does
 * not move it, then clamped into the height actually on screen.
 */
export function resolveAnchorY(
  logicalHeight: number,
  stableHeight: number,
  anchorFraction: number,
): number {
  const target = Math.max(stableHeight, logicalHeight) * anchorFraction;
  const ceiling = Math.max(0, logicalHeight - ANCHOR_BOTTOM_MARGIN_PX);
  return Math.min(target, ceiling);
}

export function initCameraAnchorApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_CAMERA_ANCHOR__ = {
    trackStableViewport,
    resolveAnchorY,
    bottomMarginPx: ANCHOR_BOTTOM_MARGIN_PX,
  };
}

declare global {
  interface Window {
    __PIXLAB_CAMERA_ANCHOR__?: {
      trackStableViewport: typeof trackStableViewport;
      resolveAnchorY: typeof resolveAnchorY;
      bottomMarginPx: number;
    };
  }
}
