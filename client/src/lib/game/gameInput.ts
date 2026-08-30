import { perfMonitor } from './perfMonitor';

export interface Direction {
  x: number;
  y: number;
}

export const gameInputDirectionRef: { current: Direction } = { current: { x: 0, y: 0 } };

/** Updates held direction; returns true when direction changed. */
export function setGameInputDirection(dir: Direction): boolean {
  if (
    gameInputDirectionRef.current.x === dir.x &&
    gameInputDirectionRef.current.y === dir.y
  ) {
    return false;
  }

  gameInputDirectionRef.current = { x: dir.x, y: dir.y };

  if (perfMonitor.isActive()) {
    perfMonitor.recordInputDirectionUpdate();
  }

  return true;
}

export function clearGameInputDirection(): void {
  setGameInputDirection({ x: 0, y: 0 });
}

export function initGameInput(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_GAME_INPUT__ = {
    setDirection: setGameInputDirection,
    getDirection: () => ({ ...gameInputDirectionRef.current }),
    clear: clearGameInputDirection,
  };
}

declare global {
  interface Window {
    __PIXLAB_GAME_INPUT__?: {
      setDirection: (dir: Direction) => boolean;
      getDirection: () => Direction;
      clear: () => void;
    };
  }
}
