import type { Direction } from '../gameInput';
import { DEFAULT_DRAG_SLOP_PX, slopPxFromSensitivity } from './touchSensitivity';

export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

export type FloatingTouchIntent =
  | { kind: 'direction'; direction: Direction }
  | { kind: 'clear' };

/** Legacy default slop — use DEFAULT_DRAG_SLOP_PX from touchSensitivity. */
export const DRAG_SLOP_PX = DEFAULT_DRAG_SLOP_PX;

/**
 * Fraction of the drag slop a finger must travel away from a turn point before
 * the new heading commits. Below 1 so changing direction mid-stroke is a touch
 * snappier than the opening swipe, which is what a physical stick feels like.
 */
export const TURN_SLOP_RATIO = 0.75;

/**
 * Per-sample movement below this is treated as sensor noise and cannot open a
 * turn candidate. At 120 Hz a resting thumb still jitters by a pixel or so.
 */
export const TURN_MIN_INCREMENT_PX = 1.5;

/**
 * Holding still for this long re-anchors the origin where the finger stopped,
 * so the next push reads as a fresh swipe from that point.
 */
export const REST_MS = 150;

interface ActiveTouch {
  /** Touch-down point. Never moves — the origin does. */
  downX: number;
  downY: number;
  startT: number;
  /** Point the current direction of travel started from. Moves on turn or rest. */
  originX: number;
  originY: number;
  heldDirection: Direction | null;
  /** Previous sample, whether or not it counted as movement. */
  lastSample: PointerSample;
  /** Last sample that moved further than TURN_MIN_INCREMENT_PX. */
  lastMovingSample: PointerSample;
  /** Turn point being tested, set when the heading first deviates. */
  candidate: PointerSample | null;
  /** True once the current rest has already re-anchored, so it fires once. */
  restAnchored: boolean;
}

/** Pick 4-way direction from offset; dominant axis wins. */
export function directionFromOffset(dx: number, dy: number, slopPx = DEFAULT_DRAG_SLOP_PX): Direction | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < slopPx && ay < slopPx) return null;
  if (ax >= ay) {
    return { x: dx > 0 ? 1 : -1, y: 0 };
  }
  return { x: 0, y: dy > 0 ? 1 : -1 };
}

function sameDirection(a: Direction, b: Direction): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Dominant axis of a single step, or null when the step is within the noise floor. */
function stepDirection(dx: number, dy: number): Direction | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.sqrt(dx * dx + dy * dy) < TURN_MIN_INCREMENT_PX) return null;
  if (ax >= ay) return { x: dx > 0 ? 1 : -1, y: 0 };
  return { x: 0, y: dy > 0 ? 1 : -1 };
}

/**
 * Refraction-style floating-origin recogniser for grid movement.
 *
 * The origin is the point the *current* direction of travel began from, not
 * where the finger landed. Fixing it at touch-down meant an L-stroke — swipe
 * left, then up without lifting — kept reading "left" until the finger had
 * travelled a full slop width net upward from the original touch, so turning
 * mid-stroke felt stuck. The origin now moves forward when the heading changes
 * or after the finger rests, and only a lift stops movement.
 */
export class FloatingTouchRecogniser {
  private slopPx: number;
  private active: ActiveTouch | null = null;

  constructor(slopPx = DEFAULT_DRAG_SLOP_PX) {
    this.slopPx = slopPx;
  }

  setSlopPx(slopPx: number): void {
    this.slopPx = slopPx;
  }

  getSlopPx(): number {
    return this.slopPx;
  }

  /** Distance from a turn point needed to commit the new heading. */
  getTurnSlopPx(): number {
    return this.slopPx * TURN_SLOP_RATIO;
  }

  begin(sample: PointerSample): FloatingTouchIntent[] {
    this.active = {
      downX: sample.x,
      downY: sample.y,
      startT: sample.t,
      originX: sample.x,
      originY: sample.y,
      heldDirection: null,
      lastSample: sample,
      lastMovingSample: sample,
      candidate: null,
      restAnchored: false,
    };
    return [];
  }

  move(sample: PointerSample): FloatingTouchIntent[] {
    const active = this.active;
    if (!active) return [];

    // Hold the previous sample: it is the turn point a candidate anchors to,
    // and it must not be clobbered before that.
    const prev = active.lastSample;
    const step = stepDirection(sample.x - prev.x, sample.y - prev.y);
    active.lastSample = sample;

    if (!step) {
      // Still within the noise floor: the finger is resting. Re-anchor once, so
      // the next deliberate push starts fresh from where it stopped. The held
      // direction survives — only lifting stops movement.
      if (!active.restAnchored && sample.t - active.lastMovingSample.t >= REST_MS) {
        active.originX = active.lastMovingSample.x;
        active.originY = active.lastMovingSample.y;
        active.candidate = null;
        active.restAnchored = true;
      }
      return [];
    }

    active.lastMovingSample = sample;
    active.restAnchored = false;

    // No heading yet: measure from the origin exactly as a first swipe does.
    if (!active.heldDirection) {
      const direction = directionFromOffset(sample.x - active.originX, sample.y - active.originY, this.slopPx);
      if (!direction) return [];
      active.heldDirection = direction;
      active.candidate = null;
      return [{ kind: 'direction', direction }];
    }

    // Still travelling the held heading — any pending turn was a wobble.
    if (sameDirection(step, active.heldDirection)) {
      active.candidate = null;
      return [];
    }

    // Heading deviated. Start measuring from the turn point.
    if (!active.candidate) {
      active.candidate = { x: prev.x, y: prev.y, t: prev.t };
    }

    const turned = directionFromOffset(
      sample.x - active.candidate.x,
      sample.y - active.candidate.y,
      this.getTurnSlopPx(),
    );
    if (!turned || sameDirection(turned, active.heldDirection)) return [];

    active.originX = active.candidate.x;
    active.originY = active.candidate.y;
    active.heldDirection = turned;
    active.candidate = null;
    return [{ kind: 'direction', direction: turned }];
  }

  end(_sample: PointerSample): FloatingTouchIntent[] {
    this.active = null;
    return [{ kind: 'clear' }];
  }

  cancel(): FloatingTouchIntent[] {
    this.active = null;
    return [{ kind: 'clear' }];
  }

  getOrigin(): { x: number; y: number } | null {
    if (!this.active) return null;
    return { x: this.active.originX, y: this.active.originY };
  }

  /** Where the finger first landed. Unlike the origin, this never moves. */
  getTouchDown(): { x: number; y: number } | null {
    if (!this.active) return null;
    return { x: this.active.downX, y: this.active.downY };
  }

  getHeldDirection(): Direction | null {
    return this.active ? this.active.heldDirection : null;
  }

  isActive(): boolean {
    return this.active !== null;
  }
}

export function initFloatingTouchApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_FLOATING_TOUCH__ = {
    createRecogniser: (slopPx?: number) => new FloatingTouchRecogniser(slopPx ?? DEFAULT_DRAG_SLOP_PX),
    directionFromOffset,
    DRAG_SLOP_PX: DEFAULT_DRAG_SLOP_PX,
    slopPxFromSensitivity,
    TURN_SLOP_RATIO,
    TURN_MIN_INCREMENT_PX,
    REST_MS,
  };
}

declare global {
  interface Window {
    __PIXLAB_FLOATING_TOUCH__?: {
      createRecogniser: (slopPx?: number) => FloatingTouchRecogniser;
      directionFromOffset: typeof directionFromOffset;
      DRAG_SLOP_PX: number;
      slopPxFromSensitivity?: (sensitivity: number) => number;
      TURN_SLOP_RATIO: number;
      TURN_MIN_INCREMENT_PX: number;
      REST_MS: number;
    };
  }
}
