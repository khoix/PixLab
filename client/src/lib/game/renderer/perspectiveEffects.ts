import type { Level, Position } from '../types';
import { COLORS } from '../constants';
import { setShadowTier, type EffectiveRenderQuality } from '../renderQuality';
import { perspectiveScale, worldToScreen, type PerspectiveCamera } from './projection';
import type { WorldDrawable } from './worldGeometry';

const SQUARE = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
// Heel, instep and wider toe. Rotated in world space before projection.
const FOOT = [-0.175, -0.06, 0.08, -0.1, 0.175, -0.075, 0.175, 0.075, -0.175, 0.06];

class Effect implements WorldDrawable {
  x = 0; y = 0; orderId = 0;
  alpha = 1; color = ''; size = 0; angle = 0; foot = false; ground = true;
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
      const p = worldToScreen(camera, this), scale = perspectiveScale(camera, this);
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
    ground = true, angle = 0, foot = false): void {
    if (alpha <= 0) return;
    const index = this.count++, e = this.pool[index] ?? (this.pool[index] = new Effect());
    e.x = x; e.y = y; e.color = color; e.size = size; e.alpha = alpha;
    e.ground = ground; e.angle = angle; e.foot = foot; e.quality = this.quality;
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
    for (const light of level.lightswitches ?? []) if (!light.activated) {
      this.add(light.pos.x + 0.5, light.pos.y + 0.5, '#ffd700', 0.6, 1);
      this.add(light.pos.x + 0.5, light.pos.y + 0.5, '#ffffff', 0.25, 1);
    }
    if (quality !== 'low') for (const portal of level.portals) for (let i = 0; i < (quality === 'high' ? 4 : 2); i++) {
      const age = (now / 900 + i * 0.25) % 1, angle = i * 2.4;
      this.add(portal.pos.x + 0.5 + Math.cos(angle) * (0.25 + age * 0.2),
        portal.pos.y + 0.5 + Math.sin(angle) * (0.25 + age * 0.2), '#ffc8ff', 0.045, 1 - age, false);
    }
    return this.active;
  }
}
