import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import {
  FloatingTouchRecogniser,
  type FloatingTouchIntent,
} from '../../lib/game/touch/floatingTouchRecogniser';
import { DEFAULT_DRAG_SLOP_PX } from '../../lib/game/touch/touchSensitivity';

interface FloatingTouchControlProps {
  onMove: (dir: { x: number; y: number }) => void;
  /** Viewport coordinates of a tap that never became a drag. */
  onTap?: (clientX: number, clientY: number) => void;
  slopPx?: number;
  className?: string;
}

/**
 * Exhaustive on purpose: this used to route every non-`direction` intent to a
 * stop through a catch-all `else`, so a new intent kind would have been
 * swallowed as "stop moving" rather than handled.
 */
function applyIntents(
  intents: FloatingTouchIntent[],
  onMove: (dir: { x: number; y: number }) => void,
  onTap?: (clientX: number, clientY: number) => void,
): void {
  for (const intent of intents) {
    switch (intent.kind) {
      case 'direction':
        onMove(intent.direction);
        break;
      case 'tap':
        onTap?.(intent.x, intent.y);
        break;
      case 'clear':
        onMove({ x: 0, y: 0 });
        break;
    }
  }
}

export const FloatingTouchControl: React.FC<FloatingTouchControlProps> = ({ onMove, onTap, slopPx, className }) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const recogniserRef = useRef(new FloatingTouchRecogniser(slopPx ?? DEFAULT_DRAG_SLOP_PX));
  const onMoveRef = useRef(onMove);
  const onTapRef = useRef(onTap);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);

  useEffect(() => {
    recogniserRef.current.setSlopPx(slopPx ?? DEFAULT_DRAG_SLOP_PX);
  }, [slopPx]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const sampleFromEvent = (event: PointerEvent) => ({
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      layer.setPointerCapture(event.pointerId);
      applyIntents(recogniserRef.current.begin(sampleFromEvent(event)), onMoveRef.current, onTapRef.current);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!recogniserRef.current.isActive()) return;
      applyIntents(recogniserRef.current.move(sampleFromEvent(event)), onMoveRef.current, onTapRef.current);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (!recogniserRef.current.isActive()) return;
      applyIntents(recogniserRef.current.end(sampleFromEvent(event)), onMoveRef.current, onTapRef.current);
      if (layer.hasPointerCapture(event.pointerId)) {
        layer.releasePointerCapture(event.pointerId);
      }
    };

    const handlePointerCancel = () => {
      applyIntents(recogniserRef.current.cancel(), onMoveRef.current, onTapRef.current);
    };

    layer.addEventListener('pointerdown', handlePointerDown);
    layer.addEventListener('pointermove', handlePointerMove);
    layer.addEventListener('pointerup', handlePointerEnd);
    layer.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      layer.removeEventListener('pointerdown', handlePointerDown);
      layer.removeEventListener('pointermove', handlePointerMove);
      layer.removeEventListener('pointerup', handlePointerEnd);
      layer.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, []);

  return (
    <div
      ref={layerRef}
      data-testid="mobile-floating-touch-control"
      className={cn(
        'md:hidden absolute inset-0 z-[35] touch-none pointer-events-auto',
        'floating-touch-control',
        className,
      )}
      style={{ touchAction: 'none' }}
    />
  );
};
