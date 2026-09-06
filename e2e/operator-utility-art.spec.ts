import { test, expect } from '@playwright/test';

/**
 * The operator paper-doll's utility layer.
 *
 * `renderOperatorWithGear` composites seven layers over `operator.png`, each a
 * 256×256 transparent PNG pre-registered to the operator's body and drawn
 * full-canvas at 320×320. Layer 7 is the utility.
 *
 * That layer had never rendered. The code was complete — `getUtilitySubtype`
 * mapped all nine utility names onto four art subtypes, `getUtilityImagePath`
 * built the URL, and `compendium.ts` drew it on top — but
 * `imgs/compendium/ops/utility/` did not exist. Gear layers load with
 * `loadImage(path, silent = true)`, so the 404 was swallowed and the operator
 * rendered with weapon + armor only, whatever was equipped. Nothing failed;
 * nothing was ever drawn.
 *
 * So the first test here is the one that would have caught it: the art the code
 * already asks for must actually be reachable.
 */

const SUBTYPES = ['scope', 'thruster', 'scanner', 'amplifier'] as const;

/** Every utility in the game, and the art each one wears. */
const NAME_TO_SUBTYPE: Array<[string, string]> = [
  // Generated templates.
  ['Scope', 'scope'],
  ['Thruster', 'thruster'],
  ['Scanner', 'scanner'],
  ['Amplifier', 'amplifier'],
  // Boss drops.
  ['All-Seeing Eye', 'scope'],
  ['Chronos Watch', 'thruster'],
  ['Omniscient Lens', 'scope'],
  ['Quantum Accelerator', 'thruster'],
  ['Reality Shard', 'amplifier'],
  // Names as they actually reach the renderer: `generateItemName` appends an
  // "of X" suffix, and the UI carries a rarity prefix and a level suffix.
  ['Scope of Sight Lv7', 'scope'],
  ['Enhanced Amplifier of Precise Strike', 'amplifier'],
  ['Masterwork Thruster of Haste Lv12', 'thruster'],
  ['Legendary Scanner of the Seer', 'scanner'],
];

/**
 * Where each subtype's art sits on the 320px canvas.
 *
 * These are the ink bounds measured in the source 256×256 files, scaled by
 * 320/256 and padded by 6px for the bilinear upscale. A layer that composites
 * but lands in the wrong place would pass a "something changed" check and still
 * look broken, so the diff has to be inside the box the art was drawn for.
 */
const EXPECTED_REGION: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {
  scope: { x0: 155, y0: 85, x1: 183, y1: 106 },
  thruster: { x0: 114, y0: 85, x1: 211, y1: 134 },
  scanner: { x0: 201, y0: 109, x1: 242, y1: 164 },
  amplifier: { x0: 200, y0: 106, x1: 234, y1: 163 },
};

function utilityItem(name: string) {
  return {
    id: 'test-utility',
    name,
    type: 'utility' as const,
    rarity: 'epic' as const,
    stats: { vision: 2 },
    price: 10,
    description: 'E2e utility',
  };
}

test.describe('Operator preview — utility layer', () => {
  test('the four utility layers the code asks for are actually reachable', async ({ page }) => {
    await page.goto('/');

    const results = await page.evaluate(async (subtypes) => {
      const map = await import('/src/lib/game/compendium-image-map.ts');
      const out: Array<{ subtype: string; url: string; status: number; w: number; h: number }> = [];
      for (const subtype of subtypes) {
        const url = map.getUtilityImagePath(subtype);
        const res = await fetch(url);
        let w = 0;
        let h = 0;
        if (res.ok) {
          const bitmap = await createImageBitmap(await res.blob());
          w = bitmap.width;
          h = bitmap.height;
          bitmap.close();
        }
        out.push({ subtype, url, status: res.status, w, h });
      }
      return out;
    }, SUBTYPES as unknown as string[]);

    for (const r of results) {
      expect(r.status, `${r.subtype} -> ${r.url}`).toBe(200);
      // The position inside the 256×256 frame is the anchor — art at any other
      // size would be registered to the wrong body.
      expect(`${r.subtype} ${r.w}x${r.h}`).toBe(`${r.subtype} 256x256`);
    }
  });

  test('every utility name in the game resolves to one of those four', async ({ page }) => {
    await page.goto('/');

    const resolved = await page.evaluate(async (pairs) => {
      const map = await import('/src/lib/game/compendium-image-map.ts');
      return pairs.map(([name]) => ({
        name,
        subtype: map.getUtilitySubtype({ name } as never),
      }));
    }, NAME_TO_SUBTYPE);

    for (let i = 0; i < NAME_TO_SUBTYPE.length; i++) {
      const [name, expected] = NAME_TO_SUBTYPE[i];
      // `getUtilitySubtype` falls back to 'scope' for anything unmapped, so a new
      // utility added without art would silently wear the Scope's eyepiece. This
      // asserts the mapping, not just that a file comes back.
      expect(`${name} -> ${resolved[i].subtype}`).toBe(`${name} -> ${expected}`);
    }

    const none = await page.evaluate(async () => {
      const map = await import('/src/lib/game/compendium-image-map.ts');
      return { subtype: map.getUtilitySubtype(null), path: map.getUtilityImagePath('none') };
    });
    expect(none.subtype).toBe('none');
    expect(none.path).toBe('');
  });

  test('layer 7 composites each subtype, in the place its art was drawn for', async ({ page }) => {
    test.slow();
    await page.goto('/');

    const results = await page.evaluate(async (names) => {
      const compendium = await import('/src/lib/game/compendium.ts');
      const SIZE = 320;

      const render = async (utility: unknown) => {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        await compendium.renderOperatorWithGear(canvas, {
          weapon: null,
          armor: null,
          utility: utility as never,
        });
        return canvas.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
      };

      // The same operator, with nothing equipped, is the reference.
      const bare = await render(null);

      const out: Array<{
        name: string;
        changed: number;
        x0: number;
        y0: number;
        x1: number;
        y1: number;
      }> = [];

      for (const name of names) {
        const withUtility = await render({
          id: 'test-utility',
          name,
          type: 'utility',
          rarity: 'epic',
          stats: { vision: 2 },
          price: 10,
          description: 'E2e utility',
        });

        let changed = 0;
        let x0 = SIZE;
        let y0 = SIZE;
        let x1 = -1;
        let y1 = -1;
        for (let i = 0; i < bare.length; i += 4) {
          if (
            Math.abs(bare[i] - withUtility[i]) > 8 ||
            Math.abs(bare[i + 1] - withUtility[i + 1]) > 8 ||
            Math.abs(bare[i + 2] - withUtility[i + 2]) > 8
          ) {
            const p = i / 4;
            const x = p % SIZE;
            const y = (p / SIZE) | 0;
            changed++;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
        out.push({ name, changed, x0, y0, x1, y1 });
      }
      return out;
    }, ['Scope', 'Thruster', 'Scanner', 'Amplifier']);

    for (const r of results) {
      const subtype = r.name.toLowerCase();
      const box = EXPECTED_REGION[subtype];
      console.log(
        `[operator] ${subtype}: ${r.changed} px changed, bounds x${r.x0}-${r.x1} y${r.y0}-${r.y1} ` +
          `(expected inside x${box.x0}-${box.x1} y${box.y0}-${box.y1})`,
      );

      // It drew something...
      expect(r.changed, `${subtype} composited nothing`).toBeGreaterThan(20);
      // ...and it drew it on the operator, not somewhere else on the canvas.
      expect(
        `${subtype} x${r.x0 >= box.x0} x${r.x1 <= box.x1} y${r.y0 >= box.y0} y${r.y1 <= box.y1}`,
      ).toBe(`${subtype} xtrue xtrue ytrue ytrue`);
    }

    // Distinct art per subtype: if three of the four silently fell through to the
    // `|| 'scope'` default, every diff would be identical.
    const footprints = new Set(results.map((r) => `${r.x0},${r.y0},${r.x1},${r.y1}`));
    expect(footprints.size).toBe(results.length);
  });

  test('an empty utility slot draws nothing', async ({ page }) => {
    await page.goto('/');

    const changed = await page.evaluate(async () => {
      const compendium = await import('/src/lib/game/compendium.ts');
      const SIZE = 320;
      const render = async (utility: unknown) => {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        await compendium.renderOperatorWithGear(canvas, {
          weapon: null,
          armor: null,
          utility: utility as never,
        });
        return canvas.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
      };
      const a = await render(null);
      const b = await render(null);
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
      }
      return n;
    });

    // Two bare renders must be identical — `getUtilitySubtype(null)` returns
    // 'none', which yields an empty path, so nothing is loaded and the default
    // 'scope' art can never leak onto an operator with an empty slot.
    expect(changed).toBe(0);
  });
});

test.describe('Operator preview — in the lobby', () => {
  test('the preview canvas renders with a utility equipped', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-run-button').click();
    await page.waitForURL('**/play**');

    await page.evaluate((item) => {
      // `addConsumable` is the generic ADD_ITEM hook; the payload decides the type.
      window.__PIXLAB_TEST__?.addConsumable(item as never);
      window.__PIXLAB_TEST__?.setLobbyTab('loadout');
    }, utilityItem('Scanner of the Seer'));

    const preview = page.getByTestId('operator-preview');
    await expect(preview).toBeVisible();
    await page.waitForTimeout(400);

    // The operator base itself must have loaded — a broken preview would show the
    // 'OPERATOR' text fallback on flat grey.
    const painted = await preview.locator('canvas').evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const d = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 24 || d[i + 1] > 24 || d[i + 2] > 24) lit++;
      }
      return { lit, w: canvas.width, h: canvas.height };
    });

    expect(painted.w).toBe(320);
    expect(painted.h).toBe(320);
    expect(painted.lit).toBeGreaterThan(1000);
  });
});
