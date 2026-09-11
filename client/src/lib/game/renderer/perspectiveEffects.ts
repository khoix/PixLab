import type { Level, Position } from '../types';
import { COLORS } from '../constants';
import { setShadowTier, type EffectiveRenderQuality } from '../renderQuality';
import { perspectiveScale, worldToScreen, type PerspectiveCamera } from './projection';
import type { WorldDrawable } from './worldGeometry';

/**
 * Portal sparks, on the top-down view's terms.
 *
 * That pass emits one spark per portal on 30% of frames, each with a random
 * angle, a speed of 0.5-1.0 px/frame and a 1000-1500ms life. At 60fps that is
 * ~18 a second against a mean life of 1.25s, so about 22 are alight at once,
 * and each covers 30-90px before it fades — 0.94 to 2.81 tiles.
 *
 * The perspective pass had 4 of them crossing 0.2 tiles, which is why a portal
 * read as inert here and busy there.
 *
 * It cannot emit to match: rendering must not append to or advance the
 * simulation's particle array, which the "never mutate simulation" test pins.
 * So the same distribution is reproduced analytically instead — a fixed set of
 * sparks, each given its own angle, distance and period from its index, with
 * staggered phases so they retire and relight independently rather than
 * pulsing together.
 */
const PORTAL_SPARKS_HIGH = 22;
const PORTAL_SPARKS_MEDIUM = 11;
/** Tiles from the portal centre where a spark appears — the rim, as before. */
const PORTAL_SPARK_RIM = 0.25;
/** Tiles covered before fading: 30px and 90px over TILE_SIZE. */
const PORTAL_SPARK_TRAVEL_MIN = 0.94;
const PORTAL_SPARK_TRAVEL_MAX = 2.81;
const PORTAL_SPARK_LIFE_MIN_MS = 1000;
const PORTAL_SPARK_LIFE_MAX_MS = 1500;

/**
 * Golden angle. Successive multiples never repeat a bearing and fill the circle
 * evenly at any count, which is what the previous `i * 2.4` was doing.
 *
 * Kept rather than replaced by the hash below: 22 hashed bearings clump badly —
 * measured over the octants, one drew 6 sparks while two drew 1 — and a portal
 * spitting sparks mostly to its upper left is a worse artefact than the sparsity
 * this change set out to fix.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * A stable [0, 1) per spark, so each keeps the same distance and period on
 * every frame without any of it being stored between them. Used where spread
 * matters more than even coverage; bearings use the golden angle instead.
 */
function sparkNoise(index: number, salt: number): number {
  const n = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const SQUARE = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
// Heel, instep and wider toe. Rotated in world space before projection.
const FOOT = [-0.175, -0.06, 0.08, -0.1, 0.175, -0.075, 0.175, 0.075, -0.175, 0.06];

class Effect implements WorldDrawable {
  x = 0; y = 0; orderId = 0;
  elevation = 0; alpha = 1; color = ''; size = 0; angle = 0; foot = false; ground = true;
  quality: EffectiveRenderQuality = 'high';
  drawGround(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    if (this.ground) this.paint(ctx, camera);
  }
  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    if (!this.ground) this.paint(ctx, camera);
  }
  private paint(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    ctx.save(); ctx.globalAlpha *= this.alpha; ctx.shadowBlur = 0;
    ctx.fillStyle = this.color;
    if (this.ground) {
      const points = this.foot ? FOOT : SQUARE, cos = Math.cos(this.angle), sin = Math.sin(this.angle);
      ctx.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        const x = points[i] * this.size, y = points[i + 1] * this.size;
        const p = worldToScreen(camera, { x: this.x + x * cos - y * sin, y: this.y + x * sin + y * cos });
        if (!p) { ctx.restore(); return; }
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.fill();
    } else {
      const p = worldToScreen(camera, this, this.elevation), scale = perspectiveScale(camera, this, this.elevation);
      if (p && scale !== null) {
        setShadowTier('generic'); ctx.shadowColor = this.color;
        ctx.shadowBlur = this.quality === 'high' ? 6 : 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.size * camera.tileSize * scale, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

/** World effects read game-clock age and positions; rendering never appends or
 * advances simulation particles. Portal sparkles are bounded analytic decoration. */
export class PerspectiveEffects {
  private pool: Effect[] = [];
  private active: WorldDrawable[] = [];
  private count = 0;
  private quality: EffectiveRenderQuality = 'high';
  private add(x: number, y: number, color: string, size: number, alpha: number,
    ground = true, angle = 0, foot = false, elevation = 0): void {
    if (alpha <= 0) return;
    const index = this.count++, e = this.pool[index] ?? (this.pool[index] = new Effect());
    e.x = x; e.y = y; e.color = color; e.size = size; e.alpha = alpha;
    e.elevation = elevation; e.ground = ground; e.angle = angle; e.foot = foot; e.quality = this.quality;
    e.orderId = 6_000_000 + index; this.active.push(e);
  }
  prepare(level: Level, now: number, quality: EffectiveRenderQuality, path: readonly Position[],
    existing: readonly WorldDrawable[] = []): readonly WorldDrawable[] {
    this.active.length = 0; this.count = 0; this.quality = quality;
    for (const entry of existing) this.active.push(entry);
    for (const f of level.footprints ?? []) {
      const angle = Math.atan2(f.direction.y, f.direction.x), side = f.isLeftFoot ? -0.15 : 0.15;
      this.add(f.pos.x + 0.5 - Math.sin(angle) * side, f.pos.y + 0.5 + Math.cos(angle) * side,
        '#000000', 1, Math.max(0, 1 - (now - f.createdAt) / f.lifetime) * 0.3, true, angle, true);
    }
    for (const a of level.afterimages ?? []) this.add(a.pos.x + 0.5, a.pos.y + 0.5, COLORS.mob_tracker,
      0.5, Math.max(0, 1 - (now - a.createdAt) / a.lifetime) * 0.6);
    for (const p of level.particles ?? []) {
      // Legacy portal/sense particles used screen pixels and were created by
      // its draw pass. Their replacements below/sense pass are anchored in world units.
      if (/^(portal-particle-|threatsense-sparkle-|lootsense-sparkle-)/.test(p.id)) continue;
      this.add(p.pos.x + 0.5, p.pos.y + 0.5, COLORS.mob_moth, 3 / 32,
        Math.max(0, 1 - (now - p.createdAt) / p.lifetime) * 0.7, false);
    }
    for (let i = 0; i < Math.min(10, path.length); i++) this.add(path[i].x + 0.5, path[i].y + 0.5,
      '#05d9e8', 0.5, 0.28 + 0.14 * Math.sin(now / 260));
    if (quality !== 'low') {
      const sparks = quality === 'high' ? PORTAL_SPARKS_HIGH : PORTAL_SPARKS_MEDIUM;
      for (const portal of level.portals) for (let i = 0; i < sparks; i++) {
        const angle = i * GOLDEN_ANGLE;
        const travel = PORTAL_SPARK_TRAVEL_MIN
          + sparkNoise(i, 2) * (PORTAL_SPARK_TRAVEL_MAX - PORTAL_SPARK_TRAVEL_MIN);
        const life = PORTAL_SPARK_LIFE_MIN_MS
          + sparkNoise(i, 3) * (PORTAL_SPARK_LIFE_MAX_MS - PORTAL_SPARK_LIFE_MIN_MS);
        // Each spark runs on its own period, offset so the set does not blink
        // in unison the way a single shared clock made it.
        const age = (now / life + sparkNoise(i, 4)) % 1;
        const radius = PORTAL_SPARK_RIM + age * travel;
        this.add(portal.pos.x + 0.5 + Math.cos(angle) * radius,
          portal.pos.y + 0.5 + Math.sin(angle) * radius, '#ffc8ff', 0.045, 1 - age,
          false, 0, false, 0.12 + age * 0.6);
      }
    }
    return this.active;
  }
}
