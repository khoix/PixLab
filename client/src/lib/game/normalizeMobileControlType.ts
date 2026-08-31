export type MobileControlType = 'dpad' | 'touchpad' | 'floating';

/** Map legacy save values to current control types. */
export function normalizeMobileControlType(value: string | undefined): MobileControlType {
  if (value === 'touchpad') return 'touchpad';
  if (value === 'floating' || value === 'joystick') return 'floating';
  return 'dpad';
}
