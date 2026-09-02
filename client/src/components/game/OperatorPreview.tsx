import React, { useEffect, useRef } from 'react';
import { useGame } from '../../lib/store';
import { renderOperatorWithGear } from '../../lib/game/compendium';

/** Renders the operator loadout preview canvas (no card chrome). */
export const OperatorPreview: React.FC = () => {
  const { state } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderOperatorWithGear(canvasRef.current, state.loadout).catch((err) => {
      console.error('Failed to render operator:', err);
    });
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
