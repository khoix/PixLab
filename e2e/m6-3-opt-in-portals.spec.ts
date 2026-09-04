import { test, expect, type Page } from '@playwright/test';
import { openLobby } from './helpers';

const TILE_SIZE = 32;

/**
 * Enter a sector once and put a portal where we want it. Portals only generate
 * in ~50% of sectors, so hunting for one meant reloading the title screen
 * repeatedly — slow, and flaky on a loaded machine.
 */
async function startSectorWithPortal(page: Page) {
  await openLobby(page);
  await page.evaluate(() => window.__PIXLAB_TEST__?.updateStats({ hp: 100_000, maxHp: 100_000 }));
  await page.getByTestId('enter-sector-button').click();
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(250);

  return page.evaluate(() => {
    const api = window.__PIXLAB_LEVEL__!;
    api.clearPortals();
    // A floor tile with room around it, so the 3x3 forgiveness square is real.
    const player = api.getPlayerPos();
    for (let r = 2; r <= 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.round(player.x) + dx;
          const y = Math.round(player.y) + dy;
          if (!api.isFloor(x, y)) continue;
          if (api.spawnPortal({ x, y })) return { x, y };
        }
      }
    }
    return null;
  });
}

async function standOnPortal(page: Page, pos: { x: number; y: number }) {
  await page.evaluate((p) => window.__PIXLAB_LEVEL__!.setPlayerPos(p), pos);
  await page.waitForTimeout(120);
}

/**
 * Viewport point for a tile offset from the player. The player is pinned to the
 * screen anchor, so its own tile sits under the anchor and whole-tile offsets
 * land on neighbours.
 */
async function screenPointForOffset(page: Page, dx: number, dy: number) {
  return page.evaluate(
    ({ dx, dy, tile }) => {
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      const anchorY = rect.width < 768 ? 0.43 : 0.5;
      return {
        x: rect.left + rect.width / 2 + dx * tile,
        y: rect.top + rect.height * anchorY + dy * tile,
      };
    },
    { dx, dy, tile: TILE_SIZE },
  );
}

test.describe('M6.3 — portals are opt-in', () => {
  test('walking onto a portal no longer teleports, and shows the prompt', async ({ page }) => {
    const portal = await startSectorWithPortal(page);
    expect(portal).not.toBeNull();
    await standOnPortal(page, portal!);

    const state = await page.evaluate(() => ({
      pos: window.__PIXLAB_LEVEL__!.getPlayerPos(),
      standing: window.__PIXLAB_LEVEL__!.isStandingOnPortal(),
    }));
    // Pre-M6.3 this position would already be the destination.
    expect(state.pos).toEqual(portal);
    expect(state.standing).toBe(true);
    await expect(page.getByTestId('portal-prompt')).toBeVisible();

    // Still there — no delayed teleport.
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerPos())).toEqual(portal);
  });

  test('a tap anywhere in the 3x3 around the portal enters it', async ({ page }) => {
    const portal = await startSectorWithPortal(page);
    expect(portal).not.toBeNull();

    for (const [dx, dy] of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      await standOnPortal(page, portal!);
      const point = await screenPointForOffset(page, dx, dy);
      const result = await page.evaluate((pt) => {
        const api = window.__PIXLAB_LEVEL__!;
        const before = api.getPlayerPos();
        const ok = api.tapAt(pt.x, pt.y);
        return { ok, before, after: api.getPlayerPos() };
      }, point);

      expect(result.ok, `offset ${dx},${dy} should enter`).toBe(true);
      expect(result.after).not.toEqual(result.before);
    }
  });

  test('pressing the prompt itself enters the portal', async ({ page }) => {
    const portal = await startSectorWithPortal(page);
    expect(portal).not.toBeNull();
    await standOnPortal(page, portal!);

    const prompt = page.getByTestId('portal-prompt');
    await expect(prompt).toBeVisible();
    // It has to be a hit target: with pointer-events:none the press fell through
    // to a tile several rows below the player, outside the forgiveness square.
    expect(await prompt.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none');

    const before = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerPos());
    await prompt.click();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerPos());

    expect(after).not.toEqual(before);
  });

  test('a tap outside the forgiveness square does not enter', async ({ page }) => {
    const portal = await startSectorWithPortal(page);
    expect(portal).not.toBeNull();
    await standOnPortal(page, portal!);

    const point = await screenPointForOffset(page, 3, 0);
    const result = await page.evaluate((pt) => {
      const api = window.__PIXLAB_LEVEL__!;
      const before = api.getPlayerPos();
      return { ok: api.tapAt(pt.x, pt.y), before, after: api.getPlayerPos() };
    }, point);

    expect(result.ok).toBe(false);
    expect(result.after).toEqual(result.before);
  });

  test('a tap while standing elsewhere does nothing', async ({ page }) => {
    const portal = await startSectorWithPortal(page);
    expect(portal).not.toBeNull();

    const moved = await page.evaluate((pos) => {
      const api = window.__PIXLAB_LEVEL__!;
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          if (api.isFloor(x, y) && Math.abs(x - pos.x) + Math.abs(y - pos.y) > 4) {
            api.setPlayerPos({ x, y });
            return true;
          }
        }
      }
      return false;
    }, portal!);
    test.skip(!moved, 'no distant floor tile found');
    await page.waitForTimeout(150);

    const point = await screenPointForOffset(page, 0, 0);
    const result = await page.evaluate((pt) => {
      const api = window.__PIXLAB_LEVEL__!;
      const before = api.getPlayerPos();
      return {
        standing: api.isStandingOnPortal(),
        ok: api.tapAt(pt.x, pt.y),
        before,
        after: api.getPlayerPos(),
      };
    }, point);

    expect(result.standing).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.after).toEqual(result.before);
    await expect(page.getByTestId('portal-prompt')).toHaveCount(0);
  });

  test('E enters the portal on desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'desktop key binding');
    const portal = await startSectorWithPortal(page);
    expect(portal).not.toBeNull();
    await standOnPortal(page, portal!);

    const before = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerPos());
    await page.keyboard.press('e');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__PIXLAB_LEVEL__!.getPlayerPos());
    expect(after).not.toEqual(before);
  });

  test('the destination is re-rolled on every entry', async ({ page }) => {
    const portal = await startSectorWithPortal(page);
    expect(portal).not.toBeNull();

    const point = await screenPointForOffset(page, 0, 0);
    const destinations = await page.evaluate(
      ({ pos, pt }) => {
        const api = window.__PIXLAB_LEVEL__!;
        const seen: string[] = [];
        for (let i = 0; i < 30; i++) {
          api.setPlayerPos(pos);
          if (!api.tapAt(pt.x, pt.y)) continue;
          const after = api.getPlayerPos();
          seen.push(`${after.x},${after.y}`);
        }
        return seen;
      },
      { pos: portal!, pt: point },
    );

    expect(destinations.length).toBeGreaterThan(20);
    // A destination fixed at generation would give exactly one distinct value.
    expect(new Set(destinations).size).toBeGreaterThan(1);
  });
});

test.describe('M6.3 — tap recognition', () => {
  test('a quick still press is a tap; a hold or a drag is not', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_FLOATING_TOUCH__!;
      const kinds = (intents: Array<{ kind: string }>) => intents.map((i) => i.kind);

      const quick = api.createRecogniser(12);
      quick.begin({ x: 100, y: 100, t: 0 });
      const quickOut = kinds(quick.end({ x: 101, y: 100, t: 200 }));

      const hold = api.createRecogniser(12);
      hold.begin({ x: 100, y: 100, t: 0 });
      const holdOut = kinds(hold.end({ x: 100, y: 100, t: 400 }));

      const dragged = api.createRecogniser(12);
      dragged.begin({ x: 100, y: 100, t: 0 });
      dragged.move({ x: 140, y: 100, t: 60 });
      const dragOut = kinds(dragged.end({ x: 140, y: 100, t: 120 }));

      return { quickOut, holdOut, dragOut, tapMaxMs: api.TAP_MAX_MS };
    });

    expect(result.tapMaxMs).toBe(250);
    expect(result.quickOut).toEqual(['tap', 'clear']);
    // Too slow to be a tap — and still clears, so no direction sticks.
    expect(result.holdOut).toEqual(['clear']);
    // Travelled past slop: that was a move.
    expect(result.dragOut).toEqual(['clear']);
  });
});

test.describe('M6.3 — portal destination odds', () => {
  test('with no items the near-exit share stays 5%, not the old 35%', async ({ page }) => {
    await page.goto('/');
    const stats = await page.evaluate(() => {
      const size = 21;
      const tiles = Array.from({ length: size }, () => Array.from({ length: size }, () => 'floor'));
      const exitPos = { x: 1, y: 1 };
      const portalPos = { x: 10, y: 10 };
      const candidates: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (x !== exitPos.x || y !== exitPos.y) candidates.push({ x, y });
        }
      }
      const nearExit = (p: { x: number; y: number }) =>
        Math.abs(p.x - exitPos.x) + Math.abs(p.y - exitPos.y) <= 3;

      const sample = (itemPositions: Array<{ x: number; y: number }>) => {
        const ctx = { tiles, width: size, height: size, exitPos, itemPositions, candidates, portalPos } as never;
        const trials = 4000;
        let hits = 0;
        for (let i = 0; i < trials; i++) {
          if (nearExit(window.__PIXLAB_ENGINE__!.rollPortalDestination(ctx))) hits++;
        }
        return hits / trials;
      };

      return { withoutItems: sample([]), withItems: sample([{ x: 18, y: 18 }]) };
    });

    // Old behaviour: a sub-0.30 roll fell through into the near-exit branch when
    // the level had no items, making this ~0.35.
    expect(stats.withoutItems).toBeGreaterThan(0.02);
    expect(stats.withoutItems).toBeLessThan(0.09);
    expect(stats.withItems).toBeGreaterThan(0.02);
    expect(stats.withItems).toBeLessThan(0.09);
  });
});
