import { test, expect } from '@playwright/test';
import { openLobby } from './helpers';
import { installDeterminism, seedRandomOnly } from './harness/determinism';

const SEED = 0x5eed0001;
const SECTOR = 1;

const CASES: Array<number> = [0, 0, 800, 2500];
CASES.forEach((before, idx) => {
  test(`burst #${idx} before=${before}`, async ({ page }) => {
    test.slow();
    await page.addInitScript(`(${seedRandomOnly.toString()})(${SEED});`);
    await page.addInitScript(`window.__install = ${installDeterminism.toString()};`);
    await openLobby(page);
    await page.evaluate((lvl) => {
      window.__PIXLAB_TEST__?.setCurrentLevel(lvl);
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    }, SECTOR);
    if (before) await page.waitForTimeout(before);
    await page.evaluate((seed) => {
      (window as unknown as { __install: typeof installDeterminism }).__install(seed);
      window.__PIXLAB_REPLAY__!.beginWorldSetup(seed);
      // Observe, do not change: log every generateLevel entry with the draw
      // offset inside its burst and which burst it belongs to.
      const inner = Math.random;
      const w = window as unknown as { __LOG: string[] };
      w.__LOG = [];
      let burst = 0;
      let open = false;
      let offset = 0;
      let wasGen = false;
      Math.random = () => {
        if (!open) {
          open = true;
          burst++;
          offset = 0;
          queueMicrotask(() => {
            open = false;
          });
        }
        const stack = new Error().stack ?? '';
        const isGen = stack.includes('generateLevel');
        if (isGen && !wasGen) {
          const who = stack.includes('GameCanvas') ? 'GameCanvas' : stack.includes('Game.tsx') ? 'Game.tsx' : '?';
          w.__LOG.push(`burst=${burst} offset=${offset} caller=${who}`);
        }
        wasGen = isGen;
        offset++;
        return inner();
      };
    }, SEED);
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    const log = await page.evaluate(() => (window as unknown as { __LOG: string[] }).__LOG);
    console.log(`BURSTLOG before=${before}`);
    for (const l of log) console.log(`   ${l}`);
    expect(log.length).toBeGreaterThan(0);
  });
});
