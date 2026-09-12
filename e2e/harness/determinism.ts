/**
 * Deterministic replay control for the live game (M8.0).
 *
 * M8 splits `GameCanvas.tsx` — 4,134 lines, of which `update()` is ~2,000 and
 * `draw()` ~1,020 — into an engine, a renderer and an input manager. The
 * milestone's own gate is "no regressions in manual smoke test (move, fight,
 * exit, boss, shop)", which cannot catch what that refactor actually risks: a
 * slightly different AI cadence, an off-by-one in a cooldown, a timer that
 * resumes from the wrong stamp. Those pass a smoke test and ruin a run.
 *
 * So this characterizes the monolith *before* it is touched: drive the real
 * game a fixed number of frames from a fixed seed, digest what came out, and
 * require every later stage to reproduce it exactly.
 *
 * It deliberately changes no production code. A harness that edits the thing it
 * is measuring is not a baseline, and the first extraction PR would inherit
 * whatever the harness had already altered.
 *
 * ## Why all three of RNG, clock and rAF have to be controlled
 *
 * The loop is `deltaTime = time - lastTime`, clamped to 100ms, where `time` is
 * the rAF timestamp. But the simulation does not run on `deltaTime` alone:
 * every cooldown, telegraph and lifetime is an absolute stamp from
 * `getGameNow()`, which reads `Date.now()`. Freezing one and not the other
 * gives a run where mobs move smoothly while their attack cycles stand still.
 * Both are driven from a single virtual clock here, advanced in lockstep.
 *
 * rAF is replaced by a *manual queue* rather than a timestamp shim. A shim over
 * the real rAF cannot guarantee one loop iteration per advance — two callbacks
 * can land on one virtual instant, and `update(0)` still moves absolute-stamp
 * state. The queue makes the frame count exact.
 */

/**
 * Installed on `window` by `installDeterminism`.
 *
 * Named `__PIXLAB_REPLAY__`, not `__PIXLAB_HARNESS__`: the app already owns that
 * one for the M6.4 balance harness (`lib/game/balanceHarness.ts:274`). The first
 * cut of this collided with it, and because the installer guards on "already
 * installed" it silently returned early and never patched anything — every
 * baseline would have recorded ordinary nondeterministic play.
 */
export interface HarnessApi {
  /** Advance exactly `frames` iterations, each `stepMs` of virtual time. */
  tick: (frames: number, stepMs: number) => void;
  /** Virtual milliseconds elapsed since install. */
  now: () => number;
  /** Frames actually driven, for asserting the loop was really running. */
  framesDriven: () => number;
  /** Hand control back to the browser; restores every patched global. */
  release: () => void;
}

declare global {
  interface Window {
    __PIXLAB_REPLAY__?: HarnessApi;
  }
}

/**
 * Seed `Math.random` alone, with nothing else patched.
 *
 * This has to run *before the page loads*, via `addInitScript`, because level
 * generation — the maze, the item drops, the mob roster — happens the moment a
 * sector is entered, long before the replay harness takes the frame queue.
 * Seeding only at install time left the world itself random: two runs of the
 * same scenario generated different mazes and different items, and the
 * reproducibility check caught it on the first comparison.
 *
 * Kept separate from `installDeterminism` so the clock and frame queue are not
 * taken during startup, which would starve React's first paint.
 */
export function seedRandomOnly(seed: number): void {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The seeded generator. mulberry32 — small, fast, and good enough that a
 * scenario exercises varied branches rather than the same one repeatedly.
 * Exactness matters here, not statistical quality: the same seed must give the
 * same stream in every browser, which rules out anything platform-dependent.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Runs **inside the page**. Serialized by Playwright, so it may not close over
 * anything from the spec file and must be self-contained.
 *
 * Install *after* the run has started. Taking the rAF queue during startup
 * would starve React's first paint and the level would never generate.
 */
export function installDeterminism(seed: number, startEpochMs?: number): void {
  if (window.__PIXLAB_REPLAY__) return;

  // --- seeded RNG ---------------------------------------------------------
  // ~60 `Math.random()` sites across `GameCanvas`, `engine.ts` and `items.ts`.
  // Replacing the global is the only way to reach all of them without editing
  // production code; threading an injected RNG through every call site is
  // M8.4-M8.6's job, not this milestone's.
  let a = seed >>> 0;
  const realRandom = Math.random;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // --- virtual clock ------------------------------------------------------
  // Continue from the real clock rather than jumping to a fixed epoch. The
  // first cut passed a hardcoded epoch and it silently broke the sector timer:
  // the timer had already stamped its start from the real `Date.now()` before
  // install, so an epoch in the past made elapsed negative and it clamped to
  // zero for the entire run. The recorded baseline showed a timer that never
  // ticked — a characterization of nothing.
  //
  // Stamps taken before install therefore stay valid afterwards, which is the
  // property that actually matters. Determinism comes from the step size being
  // fixed, not from the origin being round; the digest records
  // elapsed-since-install and never the epoch itself.
  const realDateNow = Date.now;
  let virtualNow = startEpochMs ?? realDateNow();
  const realPerfNow = performance.now.bind(performance);
  const perfOrigin = realPerfNow();
  const clockOrigin = virtualNow;

  Date.now = () => virtualNow;
  // `performance.now` is monotonic-from-origin, not epoch. The loop uses it
  // only to time itself for the perf monitor, so it is kept consistent with
  // the virtual clock rather than left to drift against it.
  performance.now = () => virtualNow - clockOrigin + perfOrigin;

  // --- manual rAF queue ---------------------------------------------------
  type FrameCb = (time: number) => void;
  let nextHandle = 1;
  let pending = new Map<number, FrameCb>();
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);

  window.requestAnimationFrame = (cb: FrameCb): number => {
    const handle = nextHandle++;
    pending.set(handle, cb);
    return handle;
  };
  window.cancelAnimationFrame = (handle: number): void => {
    pending.delete(handle);
  };

  let framesDriven = 0;

  window.__PIXLAB_REPLAY__ = {
    tick(frames: number, stepMs: number): void {
      for (let i = 0; i < frames; i++) {
        virtualNow += stepMs;
        // Drain a snapshot of the queue: each callback re-registers for the
        // next frame, and draining live would spin forever on the game loop.
        const batch = Array.from(pending.entries());
        pending = new Map();
        for (const [, cb] of batch) {
          // One throwing consumer must not strand the rest of the frame; the
          // draw loop already swallows internally and this mirrors that.
          try {
            cb(virtualNow);
          } catch {
            /* surfaced by the assertions, not here */
          }
        }
        framesDriven++;
      }
    },
    now: () => virtualNow - clockOrigin,
    framesDriven: () => framesDriven,
    release(): void {
      Math.random = realRandom;
      Date.now = realDateNow;
      performance.now = realPerfNow;
      window.requestAnimationFrame = realRaf;
      window.cancelAnimationFrame = realCancel;
      // Re-arm anything parked in the queue so the page animates again.
      for (const [, cb] of pending) realRaf(cb);
      pending = new Map();
      delete window.__PIXLAB_REPLAY__;
    },
  };
}
