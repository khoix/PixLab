import React, { useEffect, useState } from 'react';
import { perfMonitor, type PerfSnapshot } from '../../lib/game/perfMonitor';
import { getActiveRenderQuality } from '../../lib/game/renderQuality';

interface PerfOverlayProps {
  visible: boolean;
}

export const PerfOverlay: React.FC<PerfOverlayProps> = ({ visible }) => {
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    if (!visible) return;

    let frameId = 0;
    const tick = () => {
      setSnapshot(perfMonitor.getSnapshot());
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
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
      <div>Update: {snapshot.avgUpdateMs.toFixed(2)} ms</div>
      <div>Entities: {snapshot.entityCount}</div>
      <div>Sector: {snapshot.sectorLevel}</div>
      <div>Loop restarts: {snapshot.loopRestarts}</div>
      <div>Input updates: {snapshot.inputDirectionUpdates}</div>
      <div>Samples: {snapshot.sampleCount}</div>
      <div>Quality: {getActiveRenderQuality()}</div>
    </div>
  );
};
