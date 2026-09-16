import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { openLobby } from './helpers';
import { installDeterminism, seedRandomOnly } from './harness/determinism';
import { normalizeSnapshot, type RawSnapshot, type RunSnapshot } from './harness/snapshot';
import { SCENARIOS, applyScenario, type Scenario } from './harness/scenario';

/**
 * M8.0 — characterization baselines for the pre-split engine.
 *
 * These are not assertions about correct behaviour. They are a record of what
 * the monolith *does*, so that M8.1-M8.7 can prove they changed nothing.
 *
 * Record a baseline:   UPDATE_BASELINE=1 npx playwright test e2e/m8-0-characterization.spec.ts --project=chromium-desktop
 * Check against it:    npx playwright test e2e/m8-0-characterization.spec.ts --project=chromium-desktop
 *
 * A diff here during M8 is a question, not a verdict: either the extraction
 * changed behaviour (fix the extraction) or it corrected a bug the baseline had
 * frozen in (re-record, and say so in the PR). Silently re-recording to get
 * green is the one use that defeats the milestone.
 *
 * Desktop only, and single-worker. The digest includes the sector timer, whose
 * limit is viewport-dependent (mobile gets +18% per M6), so a mobile baseline
 * would differ for a reason that has nothing to do with the engine.
 */

const BASELINE_DIR = path.join(process.cwd(), 'e2e', 'harness', 'baselines');
const UPDATE = process.env.UPDATE_BASELINE === '1';

async function readBaseline(name: string): Promise<RunSnapshot[] | null> {
  const file = path.join(BASELINE_DIR, `${name}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8')) as RunSnapshot[];
}

async function writeBaseline(name: string, snapshots: RunSnapshot[]): Promise<void> {
  await mkdir(BASELINE_DIR, { recursive: true });
  await writeFile(
    path.join(BASELINE_DIR, `${name}.json`),
    `${JSON.stringify(snapshots, null, 2)}\n`,
    'utf8',
  );
}

/** Drive one scenario end to end and return its sampled snapshots. */
async function runScenario(page: import('@playwright/test').Page, scenario: Scenario) {
  // Seeded before the page loads, so the maze, item drops and mob roster are
  // generated from the scenario's seed rather than from real entropy. Seeding
  // only at install time left the world random between runs.
  await page.addInitScript(`(${seedRandomOnly.toString()})(${scenario.seed});`);
  await page.addInitScript(`window.__install = ${installDeterminism.toString()};`);
  await openLobby(page);
  await page.evaluate((lvl) => {
    window.__PIXLAB_TEST__?.setCurrentLevel(lvl);
    // A level-1 loadout dies in seconds at sector 20, and a dead player runs a
    // different branch. The characterization needs the sector to stay live for
    // the whole window, so hp is raised out of the way. Damage still lands and
    // still shows up in the hp series — it just cannot end the run early.
    window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
  }, scenario.sector);
  // Freeze BEFORE the sector goes live, while still in the lobby.
  //
  // Freezing after entry was not enough. Between the canvas appearing and the
  // harness taking the frame queue, the game ran at real speed — and clearing
  // mobs afterwards does not undo what that window left behind: attack
  // cooldowns, particles, projectiles and timer stamps all persist in refs the
  // test hooks cannot reach. `melee` reproduced two runs in four, because its
  // mobs start adjacent and a few stray live frames are several points of hp.
  //
  // With the queue taken first, entering the sector still generates the level
  // (React and generation are synchronous, neither needs rAF) but the loop
  // cannot advance a single frame until the driver says so. There is no live
  // window at all.
  await page.evaluate((seed) => {
    (window as unknown as { __install: typeof installDeterminism }).__install(seed);
  }, scenario.seed);

  // Re-seeding once here is not enough, and the first CI run proved it: the
  // baselines reproduced perfectly on this machine and generated a different
  // *world* on the runner — different items, then, once `idle` stopped failing
  // early and the rest actually ran, a different maze, which is why `pursuit`
  // showed mobs that never reached the player.
  //
  // `Game.tsx:708` calls `generateLevel(state.currentLevel, 30, 30, ...)` in
  // its render body. Every render of the page carves a 30x30 maze, rolls a
  // roster and rolls items — about 18,500 `Math.random()` draws — and discards
  // all of it. So the stream position at the moment the canvas generates the
  // real level is a function of how many times React happened to render first,
  // and that is wall-clock dependent: a probe measured 36,753 draws between
  // seeding and entry with no pause and 18,227 with an 800ms one, giving two
  // different mazes from one seed.
  //
  // World-setup mode restarts the stream at the first draw of every
  // `generateLevel` call, so each one returns the identical level and it stops
  // mattering how many ran or which the canvas kept.
  //
  // Anchoring on the synchronous burst was tried first and was too coarse — it
  // got six scenarios reproducing on CI but still failed `idle`. A probe then
  // located both generation calls exactly: entering immediately puts them in
  // two bursts (the second starting at offset 0 of burst 2), while an 800ms
  // pause puts them in one (the second starting at offset 11,232). React's
  // render phase and its scheduled passive-effect flush share a task or do not,
  // depending on timing. Per-call anchoring has no such seam.
  await page.evaluate((seed) => window.__PIXLAB_REPLAY__!.beginWorldSetup(seed), scenario.seed);

  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas').waitFor({ state: 'visible' });

  // Close world setup and read what generation produced, *before* the scenario
  // replaces the roster with its own mobs. Everything below this line is the
  // scenario's doing; everything above it is `generateLevel`'s, and this is the
  // only chance to record it.
  //
  // The anchor recognizes a generation by finding `generateLevel` in the stack.
  // If that ever stops matching — a minified build, a rename — the harness
  // would go quietly back to recording whichever world the render count
  // happened to produce, and the baselines would become a description of this
  // machine again without anything turning red. Fail loudly instead.
  const generated = await page.evaluate(() => {
    const setup = window.__PIXLAB_REPLAY__!.endWorldSetup();
    const level = window.__PIXLAB_LEVEL__!;
    const exit = level.getExitPos();
    let h = 2166136261;
    for (const e of level.getEntities()) {
      for (const ch of `${e.mobSubtype}@${e.pos.x},${e.pos.y}:${e.hp}|`) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
      }
    }
    return {
      generations: setup.generations,
      generationDraws: setup.drawsInLastGeneration,
      rosterHash: (h >>> 0).toString(16),
      exit: exit ? `${exit.x},${exit.y}` : 'none',
    };
  });
  expect(
    generated.generations,
    'world-setup anchor never fired — level generation was not seeded',
  ).toBeGreaterThan(0);
  // Recorded but not asserted. The count is a property of the harness's
  // boundary detection rather than of the game, and it differed across
  // machines while every behavioural field matched — so it belongs in the
  // report, not in the gate.
  test.info().annotations.push({
    type: 'generation',
    description: `${scenario.name}: ${generated.generations} anchored, ${generated.generationDraws} draws in the first`,
  });

  const placed = await applyScenario(page, scenario);
  expect(placed, `scenario ${scenario.name} placed no mobs`).toBe(scenario.mobs.length);

  // A scenario that keeps the generated roster asserts nothing above — `placed`
  // is 0 by design — so check the world is actually populated. Otherwise an
  // empty boss arena would record a baseline of nothing and pass forever.
  const population = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getEntities().length);
  if (scenario.keepGeneratedRoster) {
    expect(population, `${scenario.name} expected a generated roster`).toBeGreaterThan(0);
  } else {
    expect(population, `${scenario.name} roster does not match its placements`).toBe(placed);
  }

  // Every frame and every sample is taken inside ONE synchronous page call.
  //
  // The previous driver ticked a batch, awaited a snapshot, ticked again. Each
  // await is a real round-trip during which the browser runs real timers — and
  // rAF is virtualized here but setTimeout/setInterval are not. Something on a
  // real timer draws from the shared Math.random in those gaps, so the stream
  // was offset by a variable number of values and the same scenario produced
  // different runs: draw counts came back [0,0,2,2,4,4,5] one run and
  // [2,2,4,4,5,5,6] the next, and mob positions drifted with them.
  //
  // With no awaits mid-run there are no gaps for a timer to land in.
  const raws = (await page.evaluate(
    ([frames, step, sampleEvery, track, seed, generatedWorld]) => {
      const replay = window.__PIXLAB_REPLAY__!;
      // Restart the stream here, with no await between this and the last tick,
      // so a real timer firing during setup cannot offset the simulation's
      // draws. The harness itself was installed earlier, to stop the clock.
      //
      // `reseed` also leaves world-setup mode, in case a scenario skipped the
      // explicit `endWorldSetup`. The simulation wants one continuous stream —
      // re-anchoring mid-run would make frames repeat each other's values and
      // the run would stop being a run.
      replay.reseed(seed as number);
      const level = window.__PIXLAB_LEVEL__!;
      const input = window.__PIXLAB_GAME_INPUT__;

      const segments = track as Array<{ frames: number; dir: { x: number; y: number } }>;
      const cycle = segments.reduce((sum, seg) => sum + seg.frames, 0);
      const out: RawSnapshot[] = [];

      // FNV-1a over the 30x30 grid. Computed in the page because `isWall` is
      // the only tile accessor the test hooks expose.
      const mazeDigest = () => {
        let h = 2166136261;
        let floors = 0;
        for (let y = 0; y < 30; y++) {
          for (let x = 0; x < 30; x++) {
            const wall = level.isWall(x, y);
            if (!wall) floors++;
            h ^= wall ? 49 : 48;
            h = Math.imul(h, 16777619);
          }
        }
        const extra = generatedWorld as { rosterHash: string; exit: string };
        return {
          mazeHash: (h >>> 0).toString(16),
          floorCount: floors,
          exit: extra.exit,
          rosterHash: extra.rosterHash,
        };
      };

      const read = (frame: number): RawSnapshot => ({
        frame,
        virtualMs: replay.now(),
        world: mazeDigest(),
        player: { ...level.getPlayerPos(), hp: level.getPlayerHp() },
        entities: level.getEntities().map((e) => ({
          id: e.id,
          subtype: e.mobSubtype,
          type: e.type,
          x: e.pos.x,
          y: e.pos.y,
          hp: e.hp,
          bossPhase: e.bossPhase,
        })),
        pressure: level.getPressureStats(),
        items: level.getItems().map((i) => ({ x: i.pos.x, y: i.pos.y, name: i.item.name })),
        portals: level.getPortals().map((p) => ({ x: p.pos.x, y: p.pos.y })),
        timerElapsedMs: window.__PIXLAB_TIMER__?.getElapsedMs() ?? -1,
        timerPaused: window.__PIXLAB_TIMER__?.isPaused() ?? false,
      });

      for (let f = 0; f < (frames as number); f++) {
        if (input && cycle > 0) {
          let at = f % cycle;
          for (const seg of segments) {
            if (at < seg.frames) {
              input.setDirection(seg.dir);
              break;
            }
            at -= seg.frames;
          }
        }
        replay.tick(1, step as number);
        if ((f + 1) % (sampleEvery as number) === 0) out.push(read(f + 1));
      }
      input?.clear();
      return out;
    },
    [
      scenario.frames,
      scenario.stepMs,
      scenario.sampleEvery,
      scenario.input ?? [],
      scenario.seed,
      generated,
    ] as const,
  )) as RawSnapshot[];

  const snapshots: RunSnapshot[] = [];
  let previousElapsed: number | undefined;
  for (const raw of raws) {
    snapshots.push(normalizeSnapshot(raw, previousElapsed));
    previousElapsed = raw.timerElapsedMs;
  }

  const actuallyDriven = await page.evaluate(() => window.__PIXLAB_REPLAY__!.framesDriven());
  expect(actuallyDriven, 'harness did not drive the frames it was asked to').toBe(scenario.frames);

  await page.evaluate(() => window.__PIXLAB_REPLAY__!.release());
  return snapshots;
}

test.describe('M8.0 — pre-split characterization', () => {
  // Not `serial`. It was, and that cost a CI cycle: when `idle` failed, the
  // other seven scenarios on each project were skipped rather than run, so a
  // 21-minute round reported one data point instead of fourteen. Nothing here
  // needs serial — each test opens its own page and seeds itself, and the
  // determinism no longer depends on the machine being unloaded.
  test.describe.configure({ mode: 'default' });

  for (const scenario of SCENARIOS) {
    test(`${scenario.name} reproduces its baseline`, async ({ page }) => {
      test.slow();
      const snapshots = await runScenario(page, scenario);

      if (UPDATE) {
        await writeBaseline(scenario.name, snapshots);
        test.info().annotations.push({
          type: 'baseline',
          description: `recorded ${snapshots.length} samples for ${scenario.name}`,
        });
        return;
      }

      const baseline = await readBaseline(scenario.name);
      expect(
        baseline,
        `no baseline for "${scenario.name}" — record one with UPDATE_BASELINE=1`,
      ).not.toBeNull();
      expect(snapshots).toEqual(baseline);
    });
  }

  test('the harness actually controls time, rng and frames', async ({ page }) => {
    test.slow();
    // The guard on the guard. If determinism silently stopped working, every
    // baseline above would still pass by recording the same drifting garbage
    // twice in a row — so the control itself is asserted directly.
    await page.addInitScript(`window.__install = ${installDeterminism.toString()};`);
    await openLobby(page);
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(600);

    const probe = await page.evaluate(() => {
      (window as unknown as { __install: (s: number, e?: number) => void }).__install(42);
      const h = window.__PIXLAB_REPLAY__!;

      // The clock only moves when the harness moves it.
      const beforeDate = Date.now();
      const idleWait = Date.now() - beforeDate;

      // The same seed yields the same stream.
      const first = [Math.random(), Math.random(), Math.random()];
      h.release();
      (window as unknown as { __install: (s: number, e?: number) => void }).__install(42);
      const second = [Math.random(), Math.random(), Math.random()];

      const h2 = window.__PIXLAB_REPLAY__!;
      const t0 = Date.now();
      h2.tick(10, 16);
      const advanced = Date.now() - t0;
      const frames = h2.framesDriven();
      h2.release();

      // The property every baseline rests on: `generateLevel` must be a pure
      // function of the seed, however many times it runs and whatever runs
      // between the calls. Two coarser anchors passed the checks above and
      // still recorded a machine-specific world — the second of them because
      // back-to-back calls with nothing drawing in between look like one long
      // call. Assert it directly rather than discovering it on a runner: with
      // the entry-site anchor these three hash the same, with the previous
      // rule the second differs from the first.
      (window as unknown as { __install: (s: number, e?: number) => void }).__install(1234);
      const h3 = window.__PIXLAB_REPLAY__!;
      const gen = window.__PIXLAB_ENGINE__!.generateLevel;
      const hashLevel = (lvl: { tiles: string[][] }) => {
        let x = 2166136261;
        for (const row of lvl.tiles)
          for (const t of row) {
            x ^= t.charCodeAt(0);
            x = Math.imul(x, 16777619);
          }
        return (x >>> 0).toString(16);
      };
      // Stats and loadout are passed because `engine.ts:250` gates a whole
      // branch on them — `useEconomyIndex: !!(playerStats && loadout)` — and a
      // bare `gen(5, 30, 30)` never reaches it. A self-check that exercises a
      // narrower path than the real call is a self-check with a hole in it.
      const stats = { hp: 1e6, maxHp: 1e6, damage: 10, defense: 0, speed: 1, vision: 5, coins: 0, level: 1 };
      const loadout = { weapon: null, armor: null, utility: null };
      const once = () => hashLevel(gen(5, 30, 30, stats as never, loadout as never) as never);
      h3.beginWorldSetup(777);
      const backToBack = [once(), once()];
      Math.random(); // a foreign draw between calls, the case that used to hide the bug
      backToBack.push(once());
      const anchored = h3.endWorldSetup().generations;
      h3.release();

      return {
        idleWait,
        first,
        second,
        advanced,
        frames,
        backToBack,
        anchored,
        afterRelease: !window.__PIXLAB_REPLAY__,
      };
    });

    expect(probe.idleWait, 'wall clock leaked into the virtual clock').toBe(0);
    expect(probe.backToBack, 'two generations from one seed disagreed').toEqual([
      probe.backToBack[0],
      probe.backToBack[0],
      probe.backToBack[0],
    ]);
    expect(probe.anchored, 'world-setup anchored fewer calls than were made').toBe(3);
    expect(probe.second, 'same seed produced a different stream').toEqual(probe.first);
    expect(probe.advanced, '10 frames of 16ms should be exactly 160ms').toBe(160);
    expect(probe.frames).toBe(10);
    expect(probe.afterRelease, 'release() left the harness installed').toBe(true);
  });
});
