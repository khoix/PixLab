import React, { useEffect, useState } from 'react';
import { perfMonitor, type PerfSnapshot } from '../../lib/game/perfMonitor';
import { getActiveRenderQuality } from '../../lib/game/renderQuality';
import { viewportProbe, type ViewportSummary } from '../../lib/game/viewportProbe';

interface PerfOverlayProps {
  visible: boolean;
}

export const PerfOverlay: React.FC<PerfOverlayProps> = ({ visible }) => {
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null);
  const [viewport, setViewport] = useState<ViewportSummary | null>(null);

  useEffect(() => {
    if (!visible) return;

    let frameId = 0;
    const tick = () => {
      setSnapshot(perfMonitor.getSnapshot());
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    // The viewport summary changes on the order of seconds, and reading layout
    // boxes every frame would itself perturb what it measures.
    const viewportTimer = window.setInterval(() => {
      setViewport(viewportProbe.getSummary());
    }, 1000);
    return () => {
      cancelAnimationFrame(frameId);
      window.clearInterval(viewportTimer);
    };
  }, [visible]);

  if (!visible || !snapshot) return null;

  return (
    <div
      data-testid="perf-overlay"
      className="pointer-events-none fixed top-2 left-2 z-[300] rounded border border-cyan-400/40 bg-black/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-cyan-200 shadow-lg"
      aria-hidden="true"
    >
      <div className="text-cyan-300 font-bold mb-1">PERF (M0)</div>
      <div>FPS: {snapshot.fps.toFixed(1)}</div>
      <div>Frame: {snapshot.avgFrameMs.toFixed(2)} ms</div>
      <div>Draw: {snapshot.avgDrawMs.toFixed(2)} ms (max {snapshot.maxDrawMs.toFixed(2)})</div>
      <div>Update: {snapshot.avgUpdateMs.toFixed(2)} ms (max {snapshot.maxUpdateMs.toFixed(2)})</div>
      <div>Entities: {snapshot.entityCount}</div>
      <div>Sector: {snapshot.sectorLevel}</div>
      <div>Loop restarts: {snapshot.loopRestarts}</div>
      <div>Input updates: {snapshot.inputDirectionUpdates}</div>
      <div>Samples: {snapshot.sampleCount}</div>
      <div>Quality: {getActiveRenderQuality()}</div>
      {viewport && (
        <div className="mt-1 border-t border-cyan-400/30 pt-1" data-testid="perf-overlay-viewport">
          <div className="text-cyan-300 font-bold">VIEWPORT (M5.7)</div>
          <div>Run screen: {viewport.lastRunScreenHeight}px</div>
          <div
            className={viewport.driftPx <= -8 ? 'text-red-300' : undefined}
            data-testid="perf-overlay-drift"
          >
            Drift: {viewport.driftPx > 0 ? '+' : ''}{viewport.driftPx}px
            {' '}(min {viewport.minRunScreenHeight}, max {viewport.maxRunScreenHeight})
          </div>
        </div>
      )}
    </div>
  );
};
