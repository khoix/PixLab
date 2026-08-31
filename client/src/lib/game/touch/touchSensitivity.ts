/** Default user-facing sensitivity (50% ≈ legacy 12px slop). */
export const DEFAULT_TOUCH_SENSITIVITY = 0.5;

export const MIN_DRAG_SLOP_PX = 6;
export const MAX_DRAG_SLOP_PX = 20;
export const DEFAULT_DRAG_SLOP_PX = 12;

/** Higher sensitivity → lower slop → direction registers sooner. */
export function slopPxFromSensitivity(sensitivity: number): number {
  const t = Math.min(1, Math.max(0, sensitivity));
  return MAX_DRAG_SLOP_PX - t * (MAX_DRAG_SLOP_PX - MIN_DRAG_SLOP_PX);
}

export function normalizeTouchSensitivity(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return DEFAULT_TOUCH_SENSITIVITY;
  return Math.min(1, Math.max(0, value));
}
