import { perfMonitor } from './perfMonitor';

export interface Direction {
  x: number;
  y: number;
}

export const gameInputDirectionRef: { current: Direction } = { current: { x: 0, y: 0 } };
const gameInputBufferRef: { current: Direction | null } = { current: null };

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

export function bufferGameInputDirection(dir: Direction): void {
  if (dir.x === 0 && dir.y === 0) {
    gameInputBufferRef.current = null;
    return;
  }

  gameInputBufferRef.current = { x: dir.x, y: dir.y };
}

export function getBufferedGameInputDirection(): Direction | null {
  const buffered = gameInputBufferRef.current;
  return buffered ? { ...buffered } : null;
}

/** Promote buffered direction to active input; returns true if applied. */
export function applyBufferedGameInput(): boolean {
  if (!gameInputBufferRef.current) return false;
  const next = gameInputBufferRef.current;
  gameInputBufferRef.current = null;
  return setGameInputDirection(next);
}

export function clearGameInputDirection(): void {
  setGameInputDirection({ x: 0, y: 0 });
  gameInputBufferRef.current = null;
}

export function initGameInput(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_GAME_INPUT__ = {
    setDirection: setGameInputDirection,
    getDirection: () => ({ ...gameInputDirectionRef.current }),
    bufferDirection: bufferGameInputDirection,
    getBufferedDirection: getBufferedGameInputDirection,
    applyBuffered: applyBufferedGameInput,
    clear: clearGameInputDirection,
  };
}

declare global {
  interface Window {
    __PIXLAB_GAME_INPUT__?: {
      setDirection: (dir: Direction) => boolean;
      getDirection: () => Direction;
      bufferDirection: (dir: Direction) => void;
      getBufferedDirection: () => Direction | null;
      applyBuffered: () => boolean;
      clear: () => void;
    };
  }
}
