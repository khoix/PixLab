import { test, expect } from '@playwright/test';

/**
 * M6.5. The five boss legendaries had no attack mechanics. `getItemBaseName`
 * returns "Stormbreaker", "Void Reaver" and so on, none of which matched a case
 * in `getAttackablePositions`, so all five fell through to the plain
 * four-cardinal pattern — the same shape as a starting sword, despite 50–70
 * base damage against a common weapon's 4–9.
 *
 * Beating a boss should change how the player fights, not only how hard they
 * hit. Each drop now keeps the shape of the fight it came from.
 */

const BOSS_WEAPONS = [
  { name: 'Stormbreaker', damage: 70 },
  { name: 'Bloodthirster', damage: 65 },
  { name: "Titan's Gauntlet", damage: 60 },
  { name: 'Void Reaver', damage: 55 },
  { name: 'Oblivion Blade', damage: 50 },
];

test.describe('M6.5 — boss drops fight differently', () => {
  test('each legendary has its own reach, and none is the default pattern', async ({ page }) => {
    await page.goto('/');
    const shapes = await page.evaluate((weapons) => {
      const engine = window.__PIXLAB_ENGINE__!;
      const level = engine.generateLevel(1, 31, 31);
      const at = (weapon: string | null) =>
        engine
          .getAttackablePositions({ x: 15, y: 15 }, weapon, level)
          .map((p) => `${p.x - 15},${p.y - 15}`)
          .sort();
      const out: Record<string, string[]> = { default: at(null), sword: at('Sword'), axe: at('Axe'), spear: at('Spear') };
      for (const w of weapons) out[w.name] = at(w.name);
      return out;
    }, BOSS_WEAPONS);

    // The starting weapons are unchanged.
    expect(shapes.default.length).toBe(4);
    expect(shapes.sword.length).toBe(4);
    expect(shapes.axe.length).toBe(8);
    expect(shapes.spear.length).toBe(8);

    for (const w of BOSS_WEAPONS) {
      const shape = shapes[w.name];
      // Not the plain four-cardinal fallback any more.
      expect(shape.length, `${w.name} reach`).toBeGreaterThan(4);
      expect(shape, `${w.name} is not the default`).not.toEqual(shapes.sword);
    }

    // And they are distinct from one another, not five names for one pattern.
    const signatures = BOSS_WEAPONS.map((w) => shapes[w.name].join('|'));
    expect(new Set(signatures).size).toBe(BOSS_WEAPONS.length);
  });

  test('reach is traded against damage rather than stacked on it', async ({ page }) => {
    await page.goto('/');
    const rows = await page.evaluate((weapons) => {
      const engine = window.__PIXLAB_ENGINE__!;
      const level = engine.generateLevel(1, 31, 31);
      return weapons.map((w) => ({
        name: w.name,
        damage: w.damage,
        tiles: engine.getAttackablePositions({ x: 15, y: 15 }, w.name, level).length,
      }));
    }, BOSS_WEAPONS);

    const hardest = rows.reduce((a, b) => (a.damage > b.damage ? a : b));
    const widest = rows.reduce((a, b) => (a.tiles > b.tiles ? a : b));
    // The heaviest hitter is not also the one that covers the most ground.
    expect(hardest.name).not.toBe(widest.name);
    expect(hardest.name).toBe('Stormbreaker');
    expect(widest.name).toBe('Oblivion Blade');
  });

  test('the patterns are the shapes they claim to be', async ({ page }) => {
    await page.goto('/');
    const shapes = await page.evaluate(() => {
      const engine = window.__PIXLAB_ENGINE__!;
      const level = engine.generateLevel(1, 31, 31);
      const at = (w: string) =>
        engine.getAttackablePositions({ x: 15, y: 15 }, w, level).map((p) => [p.x - 15, p.y - 15]);
      return {
        storm: at('Stormbreaker'),
        void: at('Void Reaver'),
        gauntlet: at("Titan's Gauntlet"),
        oblivion: at('Oblivion Blade'),
      };
    });

    // Stormbreaker is a lane: three tiles each way, four ways, nothing diagonal.
    expect(shapes.storm.length).toBe(12);
    expect(shapes.storm.every(([x, y]) => x === 0 || y === 0)).toBe(true);
    // Void Reaver reaches around cover: two tiles in all eight directions.
    expect(shapes.void.length).toBe(16);
    // Titan's Gauntlet is a slam: the block around the player, nothing beyond.
    expect(shapes.gauntlet.length).toBe(8);
    expect(shapes.gauntlet.every(([x, y]) => Math.abs(x) <= 1 && Math.abs(y) <= 1)).toBe(true);
    // Oblivion Blade is the widest arc in the game.
    expect(shapes.oblivion.length).toBe(24);
  });
});
