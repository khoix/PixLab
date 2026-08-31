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

interface ActiveTouch {
  originX: number;
  originY: number;
  startT: number;
  lastDirection: Direction | null;
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

/**
 * Refraction-style floating-origin recogniser for grid movement.
 * Touch-down sets origin silently; drag/swipe direction is relative to that point.
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

  begin(sample: PointerSample): FloatingTouchIntent[] {
    this.active = {
      originX: sample.x,
      originY: sample.y,
      startT: sample.t,
      lastDirection: null,
    };
    return [];
  }

  move(sample: PointerSample): FloatingTouchIntent[] {
    if (!this.active) return [];

    const dx = sample.x - this.active.originX;
    const dy = sample.y - this.active.originY;
    const direction = directionFromOffset(dx, dy, this.slopPx);
    if (!direction) return [];

    if (this.active.lastDirection && sameDirection(this.active.lastDirection, direction)) {
      return [];
    }

    this.active.lastDirection = direction;
    return [{ kind: 'direction', direction }];
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
  };
}

declare global {
  interface Window {
    __PIXLAB_FLOATING_TOUCH__?: {
      createRecogniser: (slopPx?: number) => FloatingTouchRecogniser;
      directionFromOffset: typeof directionFromOffset;
      DRAG_SLOP_PX: number;
      slopPxFromSensitivity?: (sensitivity: number) => number;
    };
  }
}
