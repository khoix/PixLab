import { MODS } from './constants';

export interface ModifierSnapshot {
  enemyHp: number;
  coinMult: number;
  timerMult: number;
  visionMult: number;
  explosiveDeaths: boolean;
  autoReveal: boolean;
}

const DEFAULT_MODIFIERS: ModifierSnapshot = {
  enemyHp: 1,
  coinMult: 1,
  timerMult: 1,
  visionMult: 1,
  explosiveDeaths: false,
  autoReveal: false,
};

export function buildModifiers(activeModIds: string[]): ModifierSnapshot {
  const modifiers: ModifierSnapshot = { ...DEFAULT_MODIFIERS };

  activeModIds.forEach((modId) => {
    const mod = MODS.find((entry) => entry.id === modId);
    if (!mod?.modifiers) return;

    if (mod.modifiers.enemyHp !== undefined) {
      modifiers.enemyHp *= mod.modifiers.enemyHp;
    }
    if (mod.modifiers.coinMult !== undefined) {
      modifiers.coinMult *= mod.modifiers.coinMult;
    }
    if (mod.modifiers.timerMult !== undefined) {
      modifiers.timerMult *= mod.modifiers.timerMult;
    }
    if (mod.modifiers.visionMult !== undefined) {
      modifiers.visionMult *= mod.modifiers.visionMult;
    }
    if (mod.modifiers.explosiveDeaths) {
      modifiers.explosiveDeaths = true;
    }
    if (mod.modifiers.autoReveal) {
      modifiers.autoReveal = true;
    }
  });

  return modifiers;
}

export function initModifiersApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_MODS__ = {
    build: buildModifiers,
  };
}

declare global {
  interface Window {
    __PIXLAB_MODS__?: {
      build: typeof buildModifiers;
    };
  }
}
