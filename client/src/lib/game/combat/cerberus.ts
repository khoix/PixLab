/** Cerberus tri-bite combo timing tuned for mobile reaction windows (M6). */

export const CERBERUS_BITE_2_DELAY_MS = 300;
export const CERBERUS_BITE_3_DELAY_MS = 600;
export const CERBERUS_COMBO_RESET_MS = 900;
export const CERBERUS_COMBO_COOLDOWN_AFTER_MS = 1200;

export const CERBERUS_BITE_1_DAMAGE_WINDOW_MS = 150;
export const CERBERUS_BITE_2_DAMAGE_MIN_MS = 300;
export const CERBERUS_BITE_2_DAMAGE_WINDOW_MS = 150;
export const CERBERUS_BITE_3_DAMAGE_MIN_MS = 600;
export const CERBERUS_BITE_3_DAMAGE_WINDOW_MS = 150;

export function shouldAdvanceCerberusCombo(
  biteComboCount: number,
  timeSinceLastBite: number,
): number | null {
  if (biteComboCount === 1 && timeSinceLastBite >= CERBERUS_BITE_2_DELAY_MS) return 2;
  if (biteComboCount === 2 && timeSinceLastBite >= CERBERUS_BITE_3_DELAY_MS) return 3;
  if (biteComboCount === 3 && timeSinceLastBite >= CERBERUS_COMBO_RESET_MS) return 0;
  return null;
}

export function shouldCerberusBiteDamage(
  biteComboCount: number,
  timeSinceLastBite: number,
  lastDamageComboCount: number,
): boolean {
  if (biteComboCount <= lastDamageComboCount) return false;

  if (biteComboCount === 1 && timeSinceLastBite < CERBERUS_BITE_1_DAMAGE_WINDOW_MS) {
    return true;
  }
  if (
    biteComboCount === 2 &&
    timeSinceLastBite >= CERBERUS_BITE_2_DAMAGE_MIN_MS &&
    timeSinceLastBite < CERBERUS_BITE_2_DAMAGE_MIN_MS + CERBERUS_BITE_2_DAMAGE_WINDOW_MS
  ) {
    return true;
  }
  if (
    biteComboCount === 3 &&
    timeSinceLastBite >= CERBERUS_BITE_3_DAMAGE_MIN_MS &&
    timeSinceLastBite < CERBERUS_BITE_3_DAMAGE_MIN_MS + CERBERUS_BITE_3_DAMAGE_WINDOW_MS
  ) {
    return true;
  }
  return false;
}
