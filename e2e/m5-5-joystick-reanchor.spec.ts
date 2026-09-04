import { test, expect, type Page } from '@playwright/test';

/**
 * Drive a standalone recogniser through a list of {x, y, t} samples and report
 * every direction it emitted, plus where the origin ended up. Mirrors the
 * synthetic-sample style of e2e/m5-floating-touch.spec.ts — no real pointer
 * events, so the pure turn logic is what is under test.
 */
async function runGesture(
  page: Page,
  samples: Array<{ x: number; y: number; t: number }>,
  slopPx?: number,
) {
  return page.evaluate(
    ({ samples, slopPx }) => {
      const api = window.__PIXLAB_FLOATING_TOUCH__!;
      const r = api.createRecogniser(slopPx);
      const directions: Array<{ x: number; y: number }> = [];
      const collect = (intents: ReturnType<typeof r.move>) => {
        for (const intent of intents) {
          if (intent.kind === 'direction') directions.push(intent.direction);
        }
      };
      collect(r.begin(samples[0]));
      for (let i = 1; i < samples.length; i++) collect(r.move(samples[i]));
      return {
        directions,
        origin: r.getOrigin(),
        touchDown: r.getTouchDown(),
        held: r.getHeldDirection(),
      };
    },
    { samples, slopPx },
  );
}

const LEFT = { x: -1, y: 0 };
const RIGHT = { x: 1, y: 0 };
const UP = { x: 0, y: -1 };

/** Straight run of samples between two points, one every `dt` ms. */
function leg(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t0: number,
  steps: number,
  dt = 16,
) {
  const out: Array<{ x: number; y: number; t: number }> = [];
  for (let i = 1; i <= steps; i++) {
    out.push({
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
      t: t0 + i * dt,
    });
  }
  return out;
}

test.describe('M5.5 — floating joystick re-anchors on direction change', () => {
  test('L-stroke without pausing emits left then up, origin moves to the corner', async ({ page }) => {
    await page.goto('/');
    const down = { x: 200, y: 400, t: 0 };
    const corner = { x: 140, y: 400 };
    const result = await runGesture(
      page,
      [down, ...leg(down, corner, 0, 6), ...leg(corner, { x: 140, y: 300 }, 96, 10)],
      12,
    );

    expect(result.directions).toEqual([LEFT, UP]);
    // The origin followed the turn; the touch-down point did not.
    expect(result.origin!.x).toBeCloseTo(corner.x, 0);
    expect(result.origin!.y).toBeCloseTo(corner.y, 0);
    expect(result.touchDown).toEqual({ x: 200, y: 400 });
    expect(result.held).toEqual(UP);
  });

  test('the same L-stroke with a 300ms pause at the corner behaves identically', async ({ page }) => {
    await page.goto('/');
    const down = { x: 200, y: 400, t: 0 };
    const corner = { x: 140, y: 400 };
    // Hold still at the corner: samples keep arriving, the finger does not move.
    const held = [0, 100, 200, 300].map((offset) => ({ ...corner, t: 96 + offset }));
    const result = await runGesture(
      page,
      [down, ...leg(down, corner, 0, 6), ...held, ...leg(corner, { x: 140, y: 300 }, 400, 10)],
      12,
    );

    expect(result.directions).toEqual([LEFT, UP]);
    expect(result.origin!.x).toBeCloseTo(corner.x, 0);
    expect(result.origin!.y).toBeCloseTo(corner.y, 0);
  });

  test('reversing along the held axis commits the opposite direction', async ({ page }) => {
    await page.goto('/');
    const down = { x: 200, y: 400, t: 0 };
    const turn = { x: 140, y: 400 };
    const result = await runGesture(
      page,
      [down, ...leg(down, turn, 0, 6), ...leg(turn, { x: 220, y: 400 }, 96, 10)],
      12,
    );

    // Moving back past the touch-down point reads as right, not as "return to
    // centre" — the origin is the corner now.
    expect(result.directions).toEqual([LEFT, RIGHT]);
    expect(result.held).toEqual(RIGHT);
  });

  test('cross-axis wobble during a straight drag never commits a turn', async ({ page }) => {
    await page.goto('/');
    const samples: Array<{ x: number; y: number; t: number }> = [{ x: 300, y: 300, t: 0 }];
    for (let i = 1; i <= 24; i++) {
      samples.push({ x: 300 - i * 5, y: 300 + (i % 2 === 0 ? 2 : -2), t: i * 16 });
    }
    const result = await runGesture(page, samples, 12);

    expect(result.directions).toEqual([LEFT]);
    expect(result.held).toEqual(LEFT);
  });

  test('a slow curve commits once, not once per sample', async ({ page }) => {
    await page.goto('/');
    // Heading rotates from due-left toward due-up a few degrees per sample.
    const samples: Array<{ x: number; y: number; t: number }> = [{ x: 300, y: 300, t: 0 }];
    let x = 300;
    let y = 300;
    for (let i = 1; i <= 40; i++) {
      const angle = Math.PI + (i * Math.PI) / 80; // 180° → 270°
      x += Math.cos(angle) * 4;
      y += Math.sin(angle) * 4;
      samples.push({ x, y, t: i * 16 });
    }
    const result = await runGesture(page, samples, 12);

    expect(result.directions.length).toBe(2);
    expect(result.directions[0]).toEqual(LEFT);
    expect(result.directions[1]).toEqual(UP);
  });

  test('resting re-anchors the origin without stopping movement', async ({ page }) => {
    await page.goto('/');
    const restPoint = { x: 240, y: 400 };
    const result = await page.evaluate((rest) => {
      const api = window.__PIXLAB_FLOATING_TOUCH__!;
      const r = api.createRecogniser(12);
      r.begin({ x: 300, y: 400, t: 0 });
      // Drag left far enough to commit.
      for (let i = 1; i <= 5; i++) r.move({ x: 300 - i * 12, y: 400, t: i * 16 });
      const heldBeforeRest = r.getHeldDirection();
      const originBeforeRest = r.getOrigin();
      // Hold still well past REST_MS.
      r.move({ ...rest, t: 200 });
      r.move({ ...rest, t: 400 });
      return {
        heldBeforeRest,
        originBeforeRest,
        heldAfterRest: r.getHeldDirection(),
        originAfterRest: r.getOrigin(),
        restMs: api.REST_MS,
      };
    }, restPoint);

    expect(result.restMs).toBe(150);
    expect(result.heldBeforeRest).toEqual(LEFT);
    // Origin followed the finger to where it stopped...
    expect(result.originAfterRest!.x).toBeCloseTo(restPoint.x, 0);
    expect(result.originAfterRest!.y).toBeCloseTo(restPoint.y, 0);
    expect(result.originAfterRest).not.toEqual(result.originBeforeRest);
    // ...but the character keeps walking. Only lifting stops it.
    expect(result.heldAfterRest).toEqual(LEFT);
  });

  test('after a rest, a fresh push commits from the rest point at the normal slop', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_FLOATING_TOUCH__!;
      const r = api.createRecogniser(12);
      const directions: Array<{ x: number; y: number }> = [];
      const collect = (intents: ReturnType<typeof r.move>) => {
        for (const i of intents) if (i.kind === 'direction') directions.push(i.direction);
      };
      r.begin({ x: 300, y: 400, t: 0 });
      for (let i = 1; i <= 5; i++) collect(r.move({ x: 300 - i * 12, y: 400, t: i * 16 }));
      // Rest at (240,400).
      collect(r.move({ x: 240, y: 400, t: 300 }));
      // Now push up 14px from the rest point — over the 12px slop.
      collect(r.move({ x: 240, y: 386, t: 320 }));
      return { directions, origin: r.getOrigin() };
    });

    expect(result.directions).toEqual([LEFT, UP]);
    expect(result.origin).toEqual({ x: 240, y: 400 });
  });

  test('turn slop is 0.75 of drag slop and scales across the sensitivity range', async ({ page }) => {
    await page.goto('/');
    const ratios = await page.evaluate(() => {
      const api = window.__PIXLAB_FLOATING_TOUCH__!;
      const at = (sensitivity: number) => {
        const slop = api.slopPxFromSensitivity!(sensitivity);
        const r = api.createRecogniser(slop);
        return { slop, turn: r.getTurnSlopPx() };
      };
      return { ratio: api.TURN_SLOP_RATIO, min: at(0), mid: at(1), max: at(1.5) };
    });

    expect(ratios.ratio).toBe(0.75);
    expect(ratios.min).toEqual({ slop: 20, turn: 15 });
    expect(ratios.mid).toEqual({ slop: 6, turn: 4.5 });
    expect(ratios.max).toEqual({ slop: 3, turn: 2.25 });
  });

  test('turns commit at both slop extremes', async ({ page }) => {
    await page.goto('/');
    const down = { x: 300, y: 400, t: 0 };
    const corner = { x: 200, y: 400 };
    const gesture = [down, ...leg(down, corner, 0, 8), ...leg(corner, { x: 200, y: 280 }, 128, 12)];

    // Least sensitive (20px slop, 15px turn slop).
    const coarse = await runGesture(page, gesture, 20);
    expect(coarse.directions).toEqual([LEFT, UP]);

    // Most sensitive (3px slop, 2.25px turn slop).
    const fine = await runGesture(page, gesture, 3);
    expect(fine.directions).toEqual([LEFT, UP]);
  });

  test('sensor noise alone never opens a turn', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const api = window.__PIXLAB_FLOATING_TOUCH__!;
      const r = api.createRecogniser(12);
      const directions: Array<{ x: number; y: number }> = [];
      r.begin({ x: 300, y: 300, t: 0 });
      for (let i = 1; i <= 5; i++) r.move({ x: 300 - i * 12, y: 300, t: i * 16 });
      // Sub-pixel jitter on the cross axis, under TURN_MIN_INCREMENT_PX.
      for (let i = 1; i <= 30; i++) {
        const intents = r.move({ x: 240, y: 300 + (i % 2 === 0 ? 1 : -1), t: 80 + i * 4 });
        for (const intent of intents) if (intent.kind === 'direction') directions.push(intent.direction);
      }
      return { directions, held: r.getHeldDirection(), noiseFloor: api.TURN_MIN_INCREMENT_PX };
    });

    expect(result.noiseFloor).toBe(1.5);
    expect(result.directions).toEqual([]);
    expect(result.held).toEqual(LEFT);
  });
});
