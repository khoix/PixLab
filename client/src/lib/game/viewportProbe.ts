// Measuring the run screen's height over time.
//
// Reported symptom: during a long run the playfield creeps upward, leaving a
// growing black band at the bottom; going back to the main menu clears it.
//
// What the screenshots already establish, before any code was read:
//   - The HP row at the top stays pinned in every frame.
//   - The mobile SECTOR badge — a DOM element at `absolute bottom-[100px]` —
//     rises with the band.
//   - The bottom of all app content moved 2324 -> 2081 -> 1940 px across three
//     captures on one 1170x2532 device, so the band grew 207 -> 591 px.
//
// A canvas transform cannot move a DOM badge, and a page scroll would carry the
// top row away too. So the positioned ancestor is *getting shorter* — the
// `.run-screen` box itself. That narrows it a great deal but does not name the
// mechanism, and `.run-screen`'s height comes from a CSS `calc()` that nothing
// in JS writes.
//
// Rather than guess, this records the numbers. It is inert unless started, and
// the perf overlay shows the drift on screen because the device where this
// happens is a phone with no console.

export type ViewportSampleReason = 'interval' | 'resize' | 'visual-viewport' | 'manual';

export interface ViewportSample {
  /** ms since the probe started. */
  t: number;
  reason: ViewportSampleReason;
  innerWidth: number;
  innerHeight: number;
  /** documentElement.clientHeight — the layout viewport. */
  clientHeight: number;
  scrollY: number;
  /** visualViewport, which nothing in the app reads today. */
  vvWidth: number;
  vvHeight: number;
  vvOffsetTop: number;
  vvPageTop: number;
  vvScale: number;
  /** The box everything in a run is positioned against. */
  runScreenHeight: number;
  runScreenTop: number;
  runScreenBottom: number;
  canvasHeight: number;
  canvasTop: number;
  /** Resolved custom properties, so a bad calc() shows up directly. */
  runHeightVar: string;
  safeTop: string;
  safeBottom: string;
  dpr: number;
}

export interface ViewportSummary {
  samples: number;
  firstRunScreenHeight: number;
  lastRunScreenHeight: number;
  minRunScreenHeight: number;
  maxRunScreenHeight: number;
  /** Negative means the run screen has shrunk since the first sample. */
  driftPx: number;

  // The first device trace killed the "the run screen is getting shorter"
  // theory outright: height sat at 763px with driftPx 0 across a menu open,
  // while every element inside the run screen moved up together by ~47px —
  // exactly that phone's top inset. A translation, not a resize. So the box's
  // *position* has to be reported next to its size, or the overlay keeps
  // reading "no drift" through the very thing being chased.
  firstRunScreenTop: number;
  lastRunScreenTop: number;
  minRunScreenTop: number;
  maxRunScreenTop: number;
  /** Negative means the run screen has moved up since the first sample. */
  topShiftPx: number;

  /** The two things that can move it without resizing it. */
  lastScrollY: number;
  maxScrollY: number;
  lastVvOffsetTop: number;
  lastVvPageTop: number;

  elapsedMs: number;
}

const MAX_SAMPLES = 600;

function readNumberVar(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim() || '(unset)';
}

class ViewportProbe {
  private samples: ViewportSample[] = [];
  private startedAt = 0;
  private timer: number | null = null;
  private active = false;
  private listeners: Array<() => void> = [];

  isActive(): boolean {
    return this.active;
  }

  start(intervalMs = 1000): void {
    if (this.active || typeof window === 'undefined') return;
    this.active = true;
    this.startedAt = Date.now();
    this.samples = [];
    this.sample('manual');

    this.timer = window.setInterval(() => this.sample('interval'), intervalMs);

    const onResize = () => this.sample('resize');
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.listeners.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    });

    // Nothing else in the app observes visualViewport. On iOS it is the thing
    // that moves when the keyboard, the toolbar or a focus-scroll happens, so
    // it is the first place to look.
    const vv = window.visualViewport;
    if (vv) {
      const onVv = () => this.sample('visual-viewport');
      vv.addEventListener('resize', onVv);
      vv.addEventListener('scroll', onVv);
      this.listeners.push(() => {
        vv.removeEventListener('resize', onVv);
        vv.removeEventListener('scroll', onVv);
      });
    }
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.listeners.forEach((off) => off());
    this.listeners = [];
  }

  reset(): void {
    this.samples = [];
    this.startedAt = Date.now();
  }

  sample(reason: ViewportSampleReason = 'manual'): ViewportSample | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;

    const runScreen = document.querySelector('.run-screen') as HTMLElement | null;
    const canvas = document.querySelector('canvas.game-canvas') as HTMLElement | null;
    const runBox = runScreen?.getBoundingClientRect();
    const canvasBox = canvas?.getBoundingClientRect();
    const rootStyles = getComputedStyle(document.documentElement);
    const vv = window.visualViewport;

    const entry: ViewportSample = {
      t: Date.now() - this.startedAt,
      reason,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollY: window.scrollY,
      vvWidth: vv ? Math.round(vv.width) : -1,
      vvHeight: vv ? Math.round(vv.height) : -1,
      vvOffsetTop: vv ? Math.round(vv.offsetTop) : -1,
      vvPageTop: vv ? Math.round(vv.pageTop) : -1,
      vvScale: vv ? Number(vv.scale.toFixed(3)) : -1,
      runScreenHeight: runBox ? Math.round(runBox.height) : -1,
      runScreenTop: runBox ? Math.round(runBox.top) : -1,
      runScreenBottom: runBox ? Math.round(runBox.bottom) : -1,
      canvasHeight: canvasBox ? Math.round(canvasBox.height) : -1,
      canvasTop: canvasBox ? Math.round(canvasBox.top) : -1,
      runHeightVar: readNumberVar(rootStyles, '--run-height'),
      safeTop: readNumberVar(rootStyles, '--safe-top'),
      safeBottom: readNumberVar(rootStyles, '--safe-bottom'),
      dpr: window.devicePixelRatio,
    };

    this.samples.push(entry);
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    return entry;
  }

  getSamples(): ViewportSample[] {
    return this.samples.slice();
  }

  /** Only samples where the run screen actually existed. */
  private runSamples(): ViewportSample[] {
    return this.samples.filter((s) => s.runScreenHeight > 0);
  }

  getSummary(): ViewportSummary | null {
    const runs = this.runSamples();
    if (runs.length === 0) return null;
    const heights = runs.map((s) => s.runScreenHeight);
    const first = heights[0];
    const last = heights[heights.length - 1];
    const tops = runs.map((s) => s.runScreenTop);
    const firstTop = tops[0];
    const lastTop = tops[tops.length - 1];
    const latest = runs[runs.length - 1];
    return {
      samples: runs.length,
      firstRunScreenHeight: first,
      lastRunScreenHeight: last,
      minRunScreenHeight: Math.min(...heights),
      maxRunScreenHeight: Math.max(...heights),
      driftPx: last - first,
      firstRunScreenTop: firstTop,
      lastRunScreenTop: lastTop,
      minRunScreenTop: Math.min(...tops),
      maxRunScreenTop: Math.max(...tops),
      topShiftPx: lastTop - firstTop,
      lastScrollY: latest.scrollY,
      maxScrollY: Math.max(...runs.map((s) => s.scrollY)),
      lastVvOffsetTop: latest.vvOffsetTop,
      lastVvPageTop: latest.vvPageTop,
      elapsedMs: latest.t - runs[0].t,
    };
  }

  /** One line per sample, for pasting out of a device. */
  toCsv(): string {
    const header = [
      't', 'reason', 'innerHeight', 'clientHeight', 'scrollY',
      'vvHeight', 'vvOffsetTop', 'vvPageTop', 'vvScale',
      'runScreenHeight', 'runScreenTop', 'runScreenBottom',
      'canvasHeight', 'canvasTop', 'runHeightVar', 'safeTop', 'safeBottom', 'dpr',
    ].join(',');
    const rows = this.samples.map((s) => [
      s.t, s.reason, s.innerHeight, s.clientHeight, s.scrollY,
      s.vvHeight, s.vvOffsetTop, s.vvPageTop, s.vvScale,
      s.runScreenHeight, s.runScreenTop, s.runScreenBottom,
      s.canvasHeight, s.canvasTop, s.runHeightVar, s.safeTop, s.safeBottom, s.dpr,
    ].join(','));
    return [header, ...rows].join('\n');
  }
}

export const viewportProbe = new ViewportProbe();

export function initViewportProbe(autoStart: boolean): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_VIEWPORT__ = {
    start: (intervalMs?: number) => viewportProbe.start(intervalMs),
    stop: () => viewportProbe.stop(),
    reset: () => viewportProbe.reset(),
    sample: () => viewportProbe.sample('manual'),
    getSamples: () => viewportProbe.getSamples(),
    getSummary: () => viewportProbe.getSummary(),
    toCsv: () => viewportProbe.toCsv(),
    isActive: () => viewportProbe.isActive(),
  };

  if (autoStart) viewportProbe.start();
}

declare global {
  interface Window {
    __PIXLAB_VIEWPORT__?: {
      start: (intervalMs?: number) => void;
      stop: () => void;
      reset: () => void;
      sample: () => ViewportSample | null;
      getSamples: () => ViewportSample[];
      getSummary: () => ViewportSummary | null;
      toCsv: () => string;
      isActive: () => boolean;
    };
  }
}
