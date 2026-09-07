import { test, expect, type Page } from '@playwright/test';
import { startSectorRun } from './helpers';

/**
 * M6.7. Two ways a mob ended up inside a wall, neither of which it could get
 * out of.
 *
 * 1. A phasing mob may cut through rock for `PHASE_MAX_WALL_TILES` tiles. But
 *    `checkCollision` reports out-of-bounds and "wall" with the same boolean,
 *    so a step off the grid was charged to the wall budget and then refused by
 *    the bounds check — and because the counter only updates on a *committed*
 *    move, it never reset. Once the budget was spent inside the boundary ring,
 *    the mob retried the same blocked step forever.
 *
 * 2. The Mace pushed a mob by a fractional `0.5 + 0.1 × (level − 1)` tiles and
 *    validated only the destination's floored tile, so a mob shoved to
 *    x = 28.45 passed the check while its sprite — drawn from `pos.x * TILE_SIZE`
 *    — overlapped the wall at tile 29. Past a tile of distance it could also
 *    land beyond a wall it was never allowed to cross.
 */

/** A tiny hand-built level: solid border, open interior, one wall block. */
const FIXTURE = {
  width: 9,
  height: 9,
  // row 4 has a wall at x=5, so a push to the right from x=4 must stop at x=4.
  wallsAt: [[5, 4]] as Array<[number, number]>,
};

function buildLevel() {
  const { width, height, wallsAt } = FIXTURE;
  const tiles: string[][] = [];
  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      row.push(border ? 'wall' : 'floor');
    }
    tiles.push(row);
  }
  for (const [x, y] of wallsAt) tiles[y][x] = 'wall';
  return { width, height, tiles };
}

test.describe('M6.7 — containment (pure rules)', () => {
  test('knockback lands on whole tiles, on floor, and never through a wall', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate((level) => {
      const api = window.__PIXLAB_CONTAINMENT__!;
      const push = (from: { x: number; y: number }, dx: number, dy: number, dist: number) =>
        api.knockbackDestination(level as never, from, dx, dy, dist);

      return {
        // Straight into the wall block at (5,4): must stop on (4,4).
        intoWall: push({ x: 4, y: 4 }, 1, 0, 0.5),
        // A level-20 mace pushes ~2.4 tiles; it must still stop at the wall.
        intoWallHighLevel: push({ x: 4, y: 4 }, 1, 0, 2.4),
        // Into the boundary from the last open column (x=7): stops at 7.
        intoBoundary: push({ x: 7, y: 2 }, 1, 0, 2.4),
        // Open floor: a level-1 push travels a whole tile.
        openLevel1: push({ x: 2, y: 2 }, 1, 0, 0.5),
        // Open floor: a big push travels its full distance.
        openFar: push({ x: 1, y: 2 }, 1, 0, 3),
        // Diagonal input is quantised to the dominant axis.
        diagonal: push({ x: 2, y: 2 }, 3, 1, 1),
        // A zero vector is a no-op rather than a NaN.
        zero: push({ x: 3, y: 3 }, 0, 0, 2),
      };
    }, buildLevel());

    expect(result.intoWall).toEqual({ x: 4, y: 4 });
    expect(result.intoWallHighLevel).toEqual({ x: 4, y: 4 });
    expect(result.intoBoundary).toEqual({ x: 7, y: 2 });
    expect(result.openLevel1).toEqual({ x: 3, y: 2 });
    expect(result.openFar).toEqual({ x: 4, y: 2 });
    expect(result.diagonal).toEqual({ x: 3, y: 2 });
    expect(result.zero).toEqual({ x: 3, y: 3 });

    // Every result is integral — a fractional position is what let a sprite
    // hang into the neighbouring wall tile in the first place.
    for (const [name, pos] of Object.entries(result)) {
      expect(Number.isInteger(pos.x), `${name}.x = ${pos.x}`).toBe(true);
      expect(Number.isInteger(pos.y), `${name}.y = ${pos.y}`).toBe(true);
    }
  });

  test('a mob stranded in rock walks itself out to floor', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate((level) => {
      const api = window.__PIXLAB_CONTAINMENT__!;

      // Follow the escape one step at a time, the way the AI tick does. The
      // property that matters is not what the first step is — from the corner
      // it is necessarily onto the ring, since every cardinal neighbour of
      // (0,0) is ring — but that following it terminates on floor.
      const walkOut = (start: { x: number; y: number }) => {
        const path: Array<{ x: number; y: number }> = [];
        let at = { ...start };
        for (let i = 0; i <= api.maxEscapeRadius + 2; i++) {
          if (api.isFloorTile((level as never as { tiles: string[][] }).tiles as never, at.x, at.y)) {
            return { path, reachedFloor: true, at };
          }
          const step = api.nearestFloorStep(level as never, at);
          if (!step) return { path, reachedFloor: false, at };
          // Each step must be a cardinal neighbour and stay on the grid.
          const manhattan = Math.abs(step.x - at.x) + Math.abs(step.y - at.y);
          if (manhattan !== 1 || !api.inBounds(level as never, step.x, step.y)) {
            return { path, reachedFloor: false, at, badStep: step };
          }
          path.push(step);
          at = step;
        }
        return { path, reachedFloor: false, at };
      };

      return {
        inWallBlock: walkOut({ x: 5, y: 4 }),
        inBoundary: walkOut({ x: 0, y: 4 }),
        inCorner: walkOut({ x: 0, y: 0 }),
        onFloor: api.nearestFloorStep(level as never, { x: 3, y: 3 }),
        boundaryFlags: {
          corner: api.isBoundaryTile(level as never, 0, 0),
          edge: api.isBoundaryTile(level as never, 0, 4),
          interiorWall: api.isBoundaryTile(level as never, 5, 4),
          interiorFloor: api.isBoundaryTile(level as never, 3, 3),
        },
      };
    }, buildLevel());

    // Standing on floor is not an escape problem.
    expect(result.onFloor).toBeNull();

    for (const key of ['inWallBlock', 'inBoundary', 'inCorner'] as const) {
      const walk = result[key];
      console.log(
        `[m6.7] ${key}: ${walk.path.map((p) => `(${p.x},${p.y})`).join(' -> ') || '(none)'}` +
          ` reachedFloor=${walk.reachedFloor}`,
      );
      // The corner is the case that deadlocked: every cardinal neighbour of
      // (0,0) is also ring, so an escape that refuses to cross the ring has
      // nowhere to go.
      expect(walk.reachedFloor, `${key} never reached floor`).toBe(true);
      expect(walk.path.length).toBeGreaterThan(0);
      expect(walk.path.length).toBeLessThanOrEqual(FIXTURE.width);
    }

    // The interior wall block is not the boundary; the ring is.
    expect(result.boundaryFlags).toEqual({
      corner: true,
      edge: true,
      interiorWall: false,
      interiorFloor: false,
    });
  });
});

async function spawnAndSettle(page: Page, subtype: string, offsetX: number, offsetY: number) {
  return page.evaluate(
    ({ subtype, offsetX, offsetY }) => {
      const api = window.__PIXLAB_LEVEL__!;
      api.clearMobs();
      const p = api.getPlayerPos();
      return api.spawnMob(subtype as never, {
        x: Math.round(p.x + offsetX),
        y: Math.round(p.y + offsetY),
      });
    },
    { subtype, offsetX, offsetY },
  );
}

test.describe('M6.7 — containment in a live sector', () => {
  test('a phase mob never comes to rest inside a wall', async ({ page }) => {
    test.slow();
    await startSectorRun(page);
    await page.evaluate(() => window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 }));
    await page.waitForTimeout(200);

    // Put a Phase right against the boundary — the case that stranded them —
    // and give it a long time to get itself into trouble.
    const placed = await page.evaluate(() => {
      const api = window.__PIXLAB_LEVEL__!;
      api.clearMobs();
      // The first interior tile beside the left wall, level with the player.
      const p = api.getPlayerPos();
      for (let y = 1; y < 29; y++) {
        if (api.isFloor(1, y)) {
          return api.spawnMob('phase' as never, { x: 1, y });
        }
      }
      return api.spawnMob('phase' as never, { x: Math.round(p.x) + 3, y: Math.round(p.y) });
    });
    expect(placed).not.toBeNull();

    // Sample where it is over several seconds of chasing.
    const samples: Array<{ x: number; y: number; onFloor: boolean; integral: boolean }> = [];
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(500);
      const s = await page.evaluate((id) => {
        const api = window.__PIXLAB_LEVEL__!;
        const e = api.getEntities().find((x) => x.id === id);
        if (!e) return null;
        return {
          x: e.pos.x,
          y: e.pos.y,
          onFloor: api.isFloor(Math.floor(e.pos.x), Math.floor(e.pos.y)),
          integral: Number.isInteger(e.pos.x) && Number.isInteger(e.pos.y),
        };
      }, placed);
      if (s) samples.push(s);
    }
    expect(samples.length).toBeGreaterThan(6);

    const inRock = samples.filter((s) => !s.onFloor);
    console.log(
      `[m6.7] phase: ${samples.length} samples, ${inRock.length} inside rock, ` +
        `last at (${samples[samples.length - 1].x}, ${samples[samples.length - 1].y})`,
    );

    // Phasing through rock is the mob's whole gimmick, so being inside a wall
    // in some samples is fine — never surfacing is not. The budget is 3 tiles,
    // and it must surface between runs.
    expect(inRock.length).toBeLessThan(samples.length);
    // And it must never be off the grid or on a fractional tile.
    for (const s of samples) {
      expect(s.integral, `phase at (${s.x}, ${s.y}) is not on a whole tile`).toBe(true);
    }
    // The last few samples must not all be the same tile inside rock — that is
    // the stall this milestone fixes.
    const tail = samples.slice(-6);
    const stalledInRock =
      tail.every((s) => !s.onFloor) &&
      new Set(tail.map((s) => `${s.x},${s.y}`)).size === 1;
    expect(stalledInRock, 'phase mob stalled inside a wall').toBe(false);
  });

  test('knockback leaves a mob on a whole floor tile, never inside a wall', async ({ page }) => {
    test.slow();
    await startSectorRun(page);
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
      // A high-level Mace is the widest push in the game.
      window.__PIXLAB_TEST__?.addConsumable({
        id: 'test-mace',
        name: 'Mace of Destruction Lv20',
        type: 'weapon',
        rarity: 'legendary',
        stats: { damage: 5 },
        price: 10,
        description: 'E2e mace',
      } as never);
    });
    await page.waitForTimeout(300);

    const id = await spawnAndSettle(page, 'drone', 1, 0);
    expect(id).not.toBeNull();

    // Swing repeatedly; each connect applies knockback.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(180);
    }

    const state = await page.evaluate(() => {
      const api = window.__PIXLAB_LEVEL__!;
      return api.getEntities().map((e) => ({
        x: e.pos.x,
        y: e.pos.y,
        onFloor: api.isFloor(Math.floor(e.pos.x), Math.floor(e.pos.y)),
        integral: Number.isInteger(e.pos.x) && Number.isInteger(e.pos.y),
      }));
    });

    console.log(`[m6.7] knockback: ${state.length} entities after 10 swings`);
    for (const e of state) {
      expect(e.onFloor, `entity at (${e.x}, ${e.y}) is inside a wall`).toBe(true);
      expect(e.integral, `entity at (${e.x}, ${e.y}) is off the tile grid`).toBe(true);
    }
  });
});
