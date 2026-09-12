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
  /**
   * Restart the RNG stream from a seed, without touching the clock or queue.
   *
   * The harness has to be installed early — the moment the canvas exists — so
   * the game stops advancing on real rAF while the scenario is being set up.
   * But re-seeding must happen with no await between it and the first tick, or
   * a real timer draws in the gap. Those two requirements pull apart, so
   * seeding is separable from installing.
   */
  reseed: (seed: number) => void;
  /**
   * Restart the stream at the start of every synchronous burst of draws.
   *
   * `Game.tsx:708` calls `generateLevel(state.currentLevel, 30, 30, ...)` in
   * its **render body**, unconditionally — a full 30x30 maze carve, roster and
   * item roll, ~18,500 `Math.random()` calls, thrown away on every render of
   * the page. So the stream position when the canvas finally generates the
   * real level depends on how many times React happened to render the lobby
   * first, which is wall-clock dependent: a probe with an 800ms pause before
   * entry consumed 18,227 draws where no pause consumed 36,753, and the two
   * runs produced different mazes from the same seed.
   *
   * That is why the baselines recorded here did not reproduce on CI: a slower
   * runner renders a different number of times and generates a different
   * world. Re-seeding once before entry cannot fix it — the offset accrues
   * *after* the seed.
   *
   * In this mode the stream is restarted at the first draw of every
   * `generateLevel` call, so all of them return the identical level and the
   * render count stops mattering.
   *
   * Two coarser anchors were tried first and both cost a CI round.
   *
   * Per *burst* was the first. A probe located the two generation calls
   * exactly: entering immediately puts them in two bursts (the second at
   * offset 0 of burst 2), an 800ms pause puts them in one (the second at
   * offset 11,232). React's render phase and its scheduled passive-effect
   * flush share a task or do not, depending on timing — two worlds, one seed.
   *
   * Per *entry into* `generateLevel` was the second, detected as a draw with
   * it on the stack following one without. That is only a boundary when
   * something else draws in between, and whether anything does is itself
   * timing-dependent. Called back to back the two generations hashed
   * 83b9b02d and 1c9ec8c9 — different worlds, one anchor fired for the pair.
   *
   * So the boundary is the entry *draw site*: the first `Math.random` of a
   * generation always comes from the same source line (the maze-carve loop,
   * or the arena's first draw on a boss sector), and that line's draws are
   * contiguous. Arriving there from anywhere else is a new call, whether or
   * not anything drew in between. `installDeterminism`'s self-check asserts
   * two back-to-back generations come out identical.
   *
   * Only for world setup. Leaving it on during the driven frames would restart
   * the stream every frame and the simulation would repeat itself.
   */
  beginWorldSetup: (seed: number) => void;
  /**
   * Return to one continuous stream, and report how many `generateLevel` calls
   * were anchored.
   *
   * The count is asserted by the spec. The anchor recognizes a generation by
   * finding `generateLevel` in the stack, so if that name ever stops appearing
   * — a minified build, a rename — the harness would silently go back to
   * recording whichever world the render count happened to produce. A count of
   * zero is the signal that it has, and it should fail the run rather than
   * quietly re-record. The exact number is not asserted: it is the render count,
   * which is the very thing being made not to matter.
   */
  endWorldSetup: () => number;
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
  const draw = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // World-setup anchoring — off unless `beginWorldSetup` turns it on. See the
  // note on `beginWorldSetup` for why level generation needs it.
  let worldSetup = false;
  let worldSeed = seed >>> 0;
  let burstOpen = false;
  let insideGeneration = false;
  let generationsSeeded = 0;
  // The source location of the first draw of a generation — the maze-carve
  // line for a normal sector, the arena's first draw for a boss one.
  let entrySite: string | null = null;
  let previousSite = '';
  const realStackLimit = Error.stackTraceLimit;
  Math.random = () => {
    if (worldSetup) {
      if (!burstOpen) {
        burstOpen = true;
        insideGeneration = false;
        a = worldSeed;
        // Closes when the JS stack empties.
        queueMicrotask(() => {
          burstOpen = false;
          insideGeneration = false;
        });
      }
      // The precise anchor: the first draw of each `generateLevel` call.
      //
      // Burst boundaries alone are not enough, and a probe showed why. The two
      // `generateLevel` calls that run between seeding and sector entry land in
      // two bursts when entry is immediate (second call at offset 0 of burst 2)
      // and in ONE burst after an 800ms pause (second call at offset 11,232 of
      // burst 1). React's render phase and its scheduled passive-effect flush
      // share a task or do not, depending on timing — so a per-burst reseed
      // gives two different worlds for the same seed, which is the divergence
      // that survived the first fix and still failed `idle` on CI.
      //
      // Anchoring per call makes every `generateLevel` start from the same
      // seed, so all of them return the identical level and it no longer
      // matters which one the canvas keeps or how many ran first.
      Error.stackTraceLimit = 30;
      const stack = new Error().stack ?? '';
      Error.stackTraceLimit = realStackLimit;
      const inGeneration = stack.includes('generateLevel');
      if (inGeneration) {
        // The frame directly below this shim: "    at generateLevel (…:38:48)".
        // Line 0 is "Error", line 1 is the shim itself.
        const shim = stack.indexOf('\n');
        const callerStart = stack.indexOf('\n', shim + 1);
        const callerEnd = stack.indexOf('\n', callerStart + 1);
        const site =
          callerStart < 0 ? '' : stack.slice(callerStart + 1, callerEnd < 0 ? undefined : callerEnd);
        // Entering `generateLevel` from outside is the obvious boundary; the
        // one that matters is arriving back at the *entry* draw site with the
        // previous draw somewhere else, which is what two back-to-back calls
        // look like when nothing else draws in between.
        if (entrySite === null || !insideGeneration || (site === entrySite && previousSite !== entrySite)) {
          if (entrySite === null) entrySite = site;
          a = worldSeed;
          generationsSeeded++;
        }
        previousSite = site;
      } else {
        previousSite = '';
      }
      insideGeneration = inGeneration;
    }
    return draw();
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
    reseed(seed: number): void {
      worldSetup = false;
      burstOpen = false;
      insideGeneration = false;
      entrySite = null;
      previousSite = '';
      Error.stackTraceLimit = realStackLimit;
      a = seed >>> 0;
    },
    beginWorldSetup(seed: number): void {
      worldSeed = seed >>> 0;
      a = worldSeed;
      worldSetup = true;
      burstOpen = false;
      insideGeneration = false;
      generationsSeeded = 0;
      entrySite = null;
      previousSite = '';
    },
    endWorldSetup(): number {
      worldSetup = false;
      burstOpen = false;
      insideGeneration = false;
      entrySite = null;
      previousSite = '';
      Error.stackTraceLimit = realStackLimit;
      return generationsSeeded;
    },
    now: () => virtualNow - clockOrigin,
    framesDriven: () => framesDriven,
    release(): void {
      Error.stackTraceLimit = realStackLimit;
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
