import React, { useEffect, useRef } from 'react';
import { useGame } from '../../lib/store';
import { renderOperatorWithGear } from '../../lib/game/compendium';

/** Renders the operator loadout preview canvas (no card chrome). */
export const OperatorPreview: React.FC = () => {
  const { state } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const hasLegendary = [state.loadout.weapon, state.loadout.armor, state.loadout.utility]
      .some((item) => item?.rarity === 'legendary');
    let cancelled = false;
    let timer: number | undefined;

    const render = async () => {
      if (!canvasRef.current || cancelled) return;
      try {
        await renderOperatorWithGear(canvasRef.current, state.loadout, performance.now());
      } catch (err) {
        console.error('Failed to render operator:', err);
      }

      // The aura is static; this low-frequency refresh only drives the tiny
      // occasional legendary glimmer, avoiding a full 60 FPS redraw loop.
      if (hasLegendary && !cancelled) {
        timer = window.setTimeout(render, 250);
      }
    };

    void render();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [state.loadout]);

  return (
    <div className="flex justify-center" data-testid="operator-preview">
      <canvas
        ref={canvasRef}
        className="border border-primary/30 bg-black max-w-full"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};
