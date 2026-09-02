/** Default user-facing sensitivity (50% ≈ legacy 12px slop). */
export const DEFAULT_TOUCH_SENSITIVITY = 0.5;

/** Slider max — 150% allows 50% more sensitivity than legacy 100%. */
export const MAX_TOUCH_SENSITIVITY = 1.5;

export const MIN_DRAG_SLOP_PX = 3;
export const MAX_DRAG_SLOP_PX = 20;
export const DEFAULT_DRAG_SLOP_PX = 12;

const BASE_MAX_SENSITIVITY = 1;
const BASE_MIN_SLOP_PX = 6;

/** Higher sensitivity → lower slop → direction registers sooner. */
export function slopPxFromSensitivity(sensitivity: number): number {
  const t = Math.min(MAX_TOUCH_SENSITIVITY, Math.max(0, sensitivity));
  if (t <= BASE_MAX_SENSITIVITY) {
    return MAX_DRAG_SLOP_PX - t * (MAX_DRAG_SLOP_PX - BASE_MIN_SLOP_PX);
  }
  const extra = (t - BASE_MAX_SENSITIVITY) / (MAX_TOUCH_SENSITIVITY - BASE_MAX_SENSITIVITY);
  return BASE_MIN_SLOP_PX - extra * (BASE_MIN_SLOP_PX - MIN_DRAG_SLOP_PX);
}

export function normalizeTouchSensitivity(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return DEFAULT_TOUCH_SENSITIVITY;
  return Math.min(MAX_TOUCH_SENSITIVITY, Math.max(0, value));
}

export function touchSensitivityPercent(sensitivity: number): number {
  return Math.round(normalizeTouchSensitivity(sensitivity) * 100);
}
