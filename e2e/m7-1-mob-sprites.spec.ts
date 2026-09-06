import { test, expect } from '@playwright/test';
import { openLobby } from './helpers';

/**
 * M7.1. M7 flattened `update()` to ~0.3 ms whatever the mob count, which left
 * drawing as the only thing still scaling with population: 2.7 → 3.5 ms from 8
 * to 62 mobs, most of it per-entity path building and `shadowBlur` — which
 * forces a blur filter on every call.
 *
 * A mob's appearance is a pure function of subtype, size, colour, quality and
 * whether it is mid-charge, so it is rendered once per distinct look and
 * blitted thereafter. The parts that are not pure — the attack telegraph, the
 * hit flash, the health bar — stayed in the entity loop as live overlays.
 */

const SUBTYPES = [
  'drone', 'swarm', 'phase', 'moth', 'sniper', 'charger', 'tracker',
  'turret', 'guardian', 'cerberus',
];

/**
 * Every look the cache can be asked for: each subtype, the three bosses (a
 * separate branch in the art), a charging Ares (charge is part of the
 * appearance, not an overlay), and the two lower quality tiers, which take the
 * `strokeGlowCircle` substitute instead of `shadowBlur`.
 */
const LOOKS: Array<{
  subtype: string;
  isBoss: boolean;
  quality: 'high' | 'medium' | 'low';
  charging: boolean;
}> = [
  ...SUBTYPES.map((subtype) => ({ subtype, isBoss: false, quality: 'high' as const, charging: false })),
  { subtype: 'boss_zeus', isBoss: true, quality: 'high', charging: false },
  { subtype: 'boss_hades', isBoss: true, quality: 'high', charging: false },
  { subtype: 'boss_ares', isBoss: true, quality: 'high', charging: false },
  { subtype: 'boss_ares', isBoss: true, quality: 'high', charging: true },
  { subtype: 'charger', isBoss: false, quality: 'high', charging: true },
  { subtype: 'phase', isBoss: false, quality: 'medium', charging: false },
  { subtype: 'guardian', isBoss: false, quality: 'low', charging: false },
  { subtype: 'boss_hades', isBoss: true, quality: 'low', charging: false },
];

test.describe('M7.1 — the sprite is the same picture', () => {
  test('a cached blit is pixel-identical to drawing straight to the canvas', async ({ page }) => {
    await page.goto('/');
    const results = await page.evaluate(async (looks) => {
      const art = await import('/src/lib/game/renderer/mobArt.ts');
      const rq = await import('/src/lib/game/renderQuality.ts');
      const cacheMod = await import('/src/lib/game/renderer/mobSpriteCache.ts');
      const { MobSpriteCache, SPRITE_PAD, SPRITE_SIZE } = cacheMod;
      const TILE = 32;

      const out: Array<{ label: string; differing: number; total: number; ink: number }> = [];
      for (const look of looks) {
        const { subtype, isBoss, quality, charging } = look;
        const tier = isBoss ? 'boss' : 'generic';
        const color = '#ff3366';
        const size = isBoss ? 28 : 24;
        const cache = new MobSpriteCache();
        cache.setDpr(1);

        // Direct: draw the art onto a plain canvas at the sprite's own centre,
        // through the same quality-pinned gate the cache uses.
        const direct = document.createElement('canvas');
        direct.width = SPRITE_SIZE;
        direct.height = SPRITE_SIZE;
        const dctx = direct.getContext('2d')!;
        dctx.imageSmoothingEnabled = false;
        const restore = rq.installStaticShadowGate(dctx, quality, tier);
        art.drawMobArt(
          dctx,
          {
            subtype: subtype as never,
            isBoss,
            centerX: SPRITE_PAD + TILE / 2,
            centerY: SPRITE_PAD + TILE / 2,
            color,
            size,
            quality,
            charging,
          },
          rq.makeStrokeGlowCircle(quality),
        );
        restore();

        // Cached: blit the sprite so its tile lands on tile (0,0), which puts
        // the same centre in the same place.
        const blitted = document.createElement('canvas');
        blitted.width = SPRITE_SIZE;
        blitted.height = SPRITE_SIZE;
        const bctx = blitted.getContext('2d')!;
        bctx.imageSmoothingEnabled = false;
        const sprite = cache.get({ subtype, isBoss, color, size, quality, charging }, tier)!;
        bctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE);

        const a = dctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE).data;
        const b = bctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE).data;
        let differing = 0;
        let ink = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (a[i + 3] > 0) ink++;
          if (
            Math.abs(a[i] - b[i]) > 1 ||
            Math.abs(a[i + 1] - b[i + 1]) > 1 ||
            Math.abs(a[i + 2] - b[i + 2]) > 1 ||
            Math.abs(a[i + 3] - b[i + 3]) > 1
          ) {
            differing++;
          }
        }
        out.push({
          label: `${subtype}${isBoss ? ' (boss)' : ''} ${quality}${charging ? ' charging' : ''}`,
          differing,
          total: a.length / 4,
          ink,
        });
      }
      return out;
    }, LOOKS);

    expect(results.length).toBe(LOOKS.length);
    for (const r of results) {
      // The blit offset and the sprite's padding have to line up exactly, or a
      // mob would sit a pixel or two off its tile — or be clipped, which would
      // only show on the one type whose art overflows furthest.
      expect(r.differing, `${r.label}: ${r.differing}/${r.total} pixels differ`).toBe(0);
      // And a look that draws nothing at all would pass the comparison above
      // for the wrong reason.
      expect(r.ink, `${r.label} drew nothing`).toBeGreaterThan(50);
    }
  });

  test('the sprite is big enough for the art that overflows its tile', async ({ page }) => {
    await page.goto('/');
    const bleed = await page.evaluate(async () => {
      const cacheMod = await import('/src/lib/game/renderer/mobSpriteCache.ts');
      const { MobSpriteCache, SPRITE_SIZE } = cacheMod;
      const cache = new MobSpriteCache();
      cache.setDpr(1);
      // The Phase's tail hangs furthest below its tile; a boss is the largest.
      const worst: Array<{ subtype: string; edgeInk: number }> = [];
      for (const [subtype, isBoss] of [['phase', false], ['cerberus', false], ['boss_hades', true]] as const) {
        const sprite = cache.get(
          { subtype, isBoss, color: '#ff3366', size: isBoss ? 28 : 26, quality: 'high', charging: false },
          isBoss ? 'boss' : 'generic',
        )!;
        const ctx = sprite.getContext('2d')!;
        const d = ctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE).data;
        // Any ink on the outermost ring means the art is being clipped.
        let edgeInk = 0;
        const at = (x: number, y: number) => d[(y * SPRITE_SIZE + x) * 4 + 3];
        for (let i = 0; i < SPRITE_SIZE; i++) {
          if (at(i, 0) > 0) edgeInk++;
          if (at(i, SPRITE_SIZE - 1) > 0) edgeInk++;
          if (at(0, i) > 0) edgeInk++;
          if (at(SPRITE_SIZE - 1, i) > 0) edgeInk++;
        }
        worst.push({ subtype, edgeInk });
      }
      return worst;
    });

    for (const b of bleed) {
      expect(b.edgeInk, `${b.subtype} touches the sprite edge`).toBe(0);
    }
  });

  test('one sprite per distinct look, reused across every mob that shares it', async ({ page }) => {
    test.setTimeout(120_000);
    await openLobby(page);
    await page.evaluate(() => {
      window.__PIXLAB_TEST__?.setCurrentLevel(30);
      window.__PIXLAB_TEST__?.updateStats({ hp: 1_000_000, maxHp: 1_000_000 });
    });
    await page.getByTestId('enter-sector-button').click();
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(800);

    // Put the roster where it will actually be painted. A sector at 30 holds
    // 35+ mobs, but the fog cull means a standing player usually has none of
    // them in the lit disc — so left to itself this test would measure whether
    // a drone happened to wander into view.
    const spawned = await page.evaluate((subtypes) => {
      const api = window.__PIXLAB_LEVEL__!;
      api.clearMobs();
      const p = api.getPlayerPos();
      const tiles: Array<{ x: number; y: number; d: number }> = [];
      for (let y = Math.max(0, p.y - 3); y <= p.y + 3; y++) {
        for (let x = Math.max(0, p.x - 3); x <= p.x + 3; x++) {
          if (!api.isFloor(x, y)) continue;
          tiles.push({ x, y, d: Math.hypot(x - p.x, y - p.y) });
        }
      }
      tiles.sort((a, b) => a.d - b.d);
      let count = 0;
      // Three of each look, so a per-mob build would show up as 3x the entries.
      for (let copy = 0; copy < 3; copy++) {
        for (let i = 0; i < subtypes.length; i++) {
          const t = tiles[(count + i) % tiles.length];
          if (t && api.spawnMob(subtypes[i], { x: t.x, y: t.y })) count++;
        }
      }
      return count;
    }, SUBTYPES);
    expect(spawned).toBeGreaterThanOrEqual(20);
    await page.waitForTimeout(400);

    const stats = await page.evaluate(async () => {
      const api = window.__PIXLAB_MOB_SPRITES__!;
      const perf = window.__PIXLAB_PERF__;
      api.resetStats();
      await new Promise((r) => setTimeout(r, 1200));
      return {
        ...api.getStats(),
        entities: window.__PIXLAB_LEVEL__!.getEntities().length,
        drawn: perf?.getSnapshot().avgDrawnEntities ?? 0,
      };
    });

    // Builds are bounded by distinct appearances, not by mob count — that is
    // the whole point. Three copies of ten subtypes is ten looks, not thirty.
    expect(stats.entities).toBeGreaterThanOrEqual(20);
    expect(stats.entries).toBeLessThanOrEqual(SUBTYPES.length + 4);
    // Every look was already built during the warm-up frames, so this window is
    // pure reuse.
    expect(stats.misses).toBe(0);
    expect(stats.hits).toBeGreaterThan(stats.entries * 10);
  });
});
