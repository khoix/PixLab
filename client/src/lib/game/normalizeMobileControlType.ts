export type MobileControlType = 'dpad' | 'floating';

/** Map legacy save values to current control types. */
export function normalizeMobileControlType(value: string | undefined): MobileControlType {
  if (value === 'dpad') return 'dpad';
  if (value === 'floating' || value === 'joystick' || value === 'touchpad') return 'floating';
  return 'floating';
}
