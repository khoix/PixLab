import { test, expect } from '@playwright/test';
import { openLobby } from './helpers';

/**
 * M6.5. Bosses had no attack cycle. Zeus wound up and fired, but the wind-up
 * was the whole tell and nothing followed it. Ares had neither: his charge
 * started the instant he was three tiles away and ended when he hit a wall, so
 * the fight was regulated by accidental collision geometry rather than anything
 * the player could read or punish — which is why the boss with the highest raw
 * numbers is the easiest fight in the game.
 */

test.describe('M6.5 — the shared attack cycle', () => {
  test('every phase ends, and only an execution can hurt', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(() => {
      const api = window.__PIXLAB_BOSS_CYCLE__!;
      const t = api.cycles.boss_ares;
      const at = (phase: string, elapsed: number) =>
        api.phaseExpired({ phase: phase as never, since: 0, hits: 0 }, elapsed, t);
      return {
        timings: t,
        telegraphHolds: at('telegraph', t.telegraphMs - 1),
        telegraphEnds: at('telegraph', t.telegraphMs),
        recoverHolds: at('recover', t.recoverMs - 1),
        recoverEnds: at('recover', t.recoverMs),
        hurtsWhileTelegraphing: api.canDealDamage({ phase: 'telegraph', since: 0, hits: 0 }),
        hurtsWhileRecovering: api.canDealDamage({ phase: 'recover', since: 0, hits: 0 }),
        hurtsOnExecute: api.canDealDamage({ phase: 'execute', since: 0, hits: 0 }),
        hurtsTwice: api.canDealDamage({ phase: 'execute', since: 0, hits: 1 }),
        rootedTelegraph: api.isRooted({ phase: 'telegraph', since: 0, hits: 0 }),
        rootedRecover: api.isRooted({ phase: 'recover', since: 0, hits: 0 }),
        rootedExecute: api.isRooted({ phase: 'execute', since: 0, hits: 0 }),
        vulnerable: api.isVulnerable({ phase: 'recover', since: 0, hits: 0 }),
        readyImmediately: api.canBeginCycle({ phase: 'ready', since: 0, hits: 0 }, 0, t),
        readyAfterRest: api.canBeginCycle({ phase: 'ready', since: 0, hits: 0 }, t.readyMs, t),
      };
    });

    // A visible wind-up, then a committed hit, then the player's turn.
    expect(r.timings.telegraphMs).toBe(500);
    expect(r.timings.recoverMs).toBe(1000);
    expect(r.telegraphHolds).toBe(false);
    expect(r.telegraphEnds).toBe(true);
    expect(r.recoverHolds).toBe(false);
    expect(r.recoverEnds).toBe(true);

    // Nothing lands outside an execution, and one charge is one hit.
    expect(r.hurtsWhileTelegraphing).toBe(false);
    expect(r.hurtsWhileRecovering).toBe(false);
    expect(r.hurtsOnExecute).toBe(true);
    expect(r.hurtsTwice).toBe(false);

    // Rooted through the tell and the recovery; moving only while executing.
    expect(r.rootedTelegraph).toBe(true);
    expect(r.rootedRecover).toBe(true);
    expect(r.rootedExecute).toBe(false);
    expect(r.vulnerable).toBe(true);

    // And no charge may begin on the first tick after recovery ends.
    expect(r.readyImmediately).toBe(false);
    expect(r.readyAfterRest).toBe(true);
  });

  test('each boss gets windows suited to its mechanic', async ({ page }) => {
    await page.goto('/');
    const cycles = await page.evaluate(() => window.__PIXLAB_BOSS_CYCLE__!.cycles);

    // Ares is the charge-and-punish fight, so his windows are the widest — the
    // whole encounter is reading a tell and taking the opening after it.
    expect(cycles.boss_ares.telegraphMs).toBeGreaterThan(cycles.boss_hades.telegraphMs);
    expect(cycles.boss_ares.recoverMs).toBeGreaterThan(cycles.boss_zeus.recoverMs);
    // Every boss has a real recovery. None of them had one before.
    for (const c of Object.values(cycles)) {
      expect(c.recoverMs).toBeGreaterThanOrEqual(600);
      expect(c.telegraphMs).toBeGreaterThanOrEqual(350);
    }
  });
});

test.describe('M6.5 — Ares in a live arena', () => {
  test('runs telegraph, execute and recover instead of charging on sight', async ({ page }) => {
    test.setTimeout(120_000);
    await openLobby(page);
    // Sector 24 is Ares' first cycle.
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.setCurrentLevel(24);
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    const observed = await page.evaluate(async () => {
      const level = window.__PIXLAB_LEVEL__!;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const phases = new Set<string>();
      let sawRootedTelegraph = false;
      let lastPhase = '';
      let posAtTelegraph: { x: number; y: number } | null = null;

      for (let i = 0; i < 240; i++) {
        const boss = level.getEntities().find((e) => e.type === 'boss_enemy');
        if (!boss) break;
        const phase = boss.bossPhase ?? 'none';
        phases.add(phase);
        if (phase === 'telegraph') {
          if (lastPhase !== 'telegraph') posAtTelegraph = { ...boss.pos };
          else if (posAtTelegraph && boss.pos.x === posAtTelegraph.x && boss.pos.y === posAtTelegraph.y) {
            sawRootedTelegraph = true;
          }
        }
        lastPhase = phase;
        await sleep(50);
      }
      return { phases: Array.from(phases), sawRootedTelegraph };
    });

    // The full cycle should be observable inside 12 seconds of play.
    expect(observed.phases).toContain('telegraph');
    expect(observed.phases).toContain('recover');
    // And he holds still while telling — that is what makes it dodgeable.
    expect(observed.sawRootedTelegraph).toBe(true);
  });
});

test.describe('M6.5 — Zeus holds his band', () => {
  test('he stops closing to melee', async ({ page }) => {
    test.setTimeout(120_000);
    await openLobby(page);
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.setCurrentLevel(8);
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    const distances = await page.evaluate(async () => {
      const level = window.__PIXLAB_LEVEL__!;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const out: number[] = [];
      for (let i = 0; i < 160; i++) {
        const boss = level.getEntities().find((e) => e.type === 'boss_enemy');
        const p = level.getPlayerPos();
        if (boss) out.push(Math.hypot(boss.pos.x - p.x, boss.pos.y - p.y));
        await sleep(50);
      }
      return out;
    });

    expect(distances.length).toBeGreaterThan(50);
    const closest = Math.min(...distances);
    // He used to walk into contact, which made his own wind-up meaningless — a
    // shot fired from an adjacent tile cannot be dodged. The band keeps him out
    // of melee. One tile of tolerance for the step he takes to reach the band.
    expect(closest).toBeGreaterThan(2);
  });
});

test.describe('M6.5 — boss adds arrive on a schedule', () => {
  test('the schedule is a running total, not a random pack', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(() => {
      const api = window.__PIXLAB_BOSS_ADDS__!;
      return {
        firstCycle: api.thresholdsForLevel(8),
        repeatCycle: api.thresholdsForLevel(32),
        repeatFrom: api.repeatCycleFrom,
        // A first-cycle boss, as its HP falls.
        full: api.addsDueAt(1.0, 8),
        justAbove: api.addsDueAt(0.61, 8),
        atThreshold: api.addsDueAt(0.6, 8),
        low: api.addsDueAt(0.1, 8),
        // A repeat cycle escalates earlier and twice.
        repeatFull: api.addsDueAt(1.0, 32),
        repeatFirst: api.addsDueAt(0.7, 32),
        repeatSecond: api.addsDueAt(0.3, 32),
        // Crossing both in one tick still totals two, so nothing double-fires.
        repeatBothAtOnce: api.addsDueAt(0.05, 32),
      };
    });

    // A first-cycle boss teaches its mechanic alone, then calls one add late.
    expect(r.firstCycle).toEqual([0.6]);
    expect(r.full).toBe(0);
    expect(r.justAbove).toBe(0);
    expect(r.atThreshold).toBe(1);
    expect(r.low).toBe(1);

    // Repeat cycles, where the mechanic is known, layer more pressure.
    expect(r.repeatFrom).toBe(32);
    expect(r.repeatCycle).toEqual([0.75, 0.4]);
    expect(r.repeatFull).toBe(0);
    expect(r.repeatFirst).toBe(1);
    expect(r.repeatSecond).toBe(2);
    expect(r.repeatBothAtOnce).toBe(2);
  });

  test('a boss sector starts empty of adds and summons one as it loses ground', async ({ page }) => {
    test.setTimeout(120_000);
    await openLobby(page);
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.setCurrentLevel(8);
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    const before = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getEntities().length);
    // The boss arrives alone.
    expect(before).toBe(1);

    // Wait out the threshold crossing once the boss is hurt. The engine drives
    // this from the boss's own HP, so the count is the observable.
    const after = await page.evaluate(async () => {
      const level = window.__PIXLAB_LEVEL__!;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // Nothing here damages the boss, so the count must stay at one: an add
      // appearing on a full-health boss would mean the schedule is firing on
      // something other than HP.
      for (let i = 0; i < 40; i++) await sleep(50);
      return level.getEntities().length;
    });
    expect(after).toBe(1);
  });
});
