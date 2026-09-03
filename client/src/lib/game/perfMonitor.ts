import { syncPerfOverlayFromUrl } from './perfFlags';

const SAMPLE_WINDOW = 120;

export interface PerfSnapshot {
  fps: number;
  avgFrameMs: number;
  avgDrawMs: number;
  avgUpdateMs: number;
  maxDrawMs: number;
  maxUpdateMs: number;
  entityCount: number;
  loopRestarts: number;
  inputDirectionUpdates: number;
  sampleCount: number;
  sectorLevel: number;
  timestamp: number;
}

export interface PlaytestSectorNote {
  level: number;
  cleared: boolean;
  timeToExitSec: number | null;
}

class PerfMonitor {
  private active = false;
  private frameSamples: number[] = [];
  private drawSamples: number[] = [];
  private updateSamples: number[] = [];
  private maxDrawMs = 0;
  private maxUpdateMs = 0;
  private entityCount = 0;
  private loopRestarts = 0;
  private inputDirectionUpdates = 0;
  private sectorLevel = 0;
  private sectorStartMs: number | null = null;
  private playtestNotes: PlaytestSectorNote[] = [];

  enable(): void {
    this.active = true;
  }

  disable(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  recordLoopRestart(): void {
    if (!this.active) return;
    this.loopRestarts += 1;
  }

  recordInputDirectionUpdate(): void {
    if (!this.active) return;
    this.inputDirectionUpdates += 1;
  }

  setEntityCount(count: number): void {
    if (!this.active) return;
    this.entityCount = count;
  }

  setSectorLevel(level: number): void {
    if (!this.active) return;
    this.sectorLevel = level;
    this.sectorStartMs = performance.now();
  }

  recordSectorClear(level: number, cleared: boolean): void {
    if (!this.active) return;
    const elapsedSec =
      this.sectorStartMs === null ? null : (performance.now() - this.sectorStartMs) / 1000;
    const existing = this.playtestNotes.find((note) => note.level === level);
    if (existing) {
      existing.cleared = cleared;
      existing.timeToExitSec = elapsedSec;
      return;
    }
    this.playtestNotes.push({ level, cleared, timeToExitSec: elapsedSec });
  }

  recordFrame(frameMs: number, drawMs: number, updateMs: number): void {
    if (!this.active) return;

    this.pushSample(this.frameSamples, frameMs);
    this.pushSample(this.drawSamples, drawMs);
    this.pushSample(this.updateSamples, updateMs);
    this.maxDrawMs = Math.max(this.maxDrawMs, drawMs);
    this.maxUpdateMs = Math.max(this.maxUpdateMs, updateMs);
  }

  getSnapshot(): PerfSnapshot {
    const avgFrameMs = this.average(this.frameSamples);
    return {
      fps: avgFrameMs > 0 ? 1000 / avgFrameMs : 0,
      avgFrameMs,
      avgDrawMs: this.average(this.drawSamples),
      avgUpdateMs: this.average(this.updateSamples),
      maxDrawMs: this.maxDrawMs,
      maxUpdateMs: this.maxUpdateMs,
      entityCount: this.entityCount,
      loopRestarts: this.loopRestarts,
      inputDirectionUpdates: this.inputDirectionUpdates,
      sampleCount: this.frameSamples.length,
      sectorLevel: this.sectorLevel,
      timestamp: Date.now(),
    };
  }

  getPlaytestNotes(): PlaytestSectorNote[] {
    return [...this.playtestNotes];
  }

  resetSamples(): void {
    this.frameSamples = [];
    this.drawSamples = [];
    this.updateSamples = [];
    this.maxDrawMs = 0;
    this.maxUpdateMs = 0;
    this.loopRestarts = 0;
    this.inputDirectionUpdates = 0;
  }

  private pushSample(buffer: number[], value: number): void {
    buffer.push(value);
    if (buffer.length > SAMPLE_WINDOW) {
      buffer.shift();
    }
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}

export const perfMonitor = new PerfMonitor();

export function initPerfMonitoring(): void {
  if (syncPerfOverlayFromUrl()) {
    perfMonitor.enable();
  }

  if (typeof window !== 'undefined') {
    window.__PIXLAB_PERF__ = {
      getSnapshot: () => perfMonitor.getSnapshot(),
      getPlaytestNotes: () => perfMonitor.getPlaytestNotes(),
      resetSamples: () => perfMonitor.resetSamples(),
      isActive: () => perfMonitor.isActive(),
    };
  }
}

declare global {
  interface Window {
    __PIXLAB_PERF__?: {
      getSnapshot: () => PerfSnapshot;
      getPlaytestNotes: () => PlaytestSectorNote[];
      resetSamples: () => void;
      isActive: () => boolean;
    };
  }
}
