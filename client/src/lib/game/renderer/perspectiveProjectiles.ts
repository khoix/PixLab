import { COLORS } from '../constants';
import type { Projectile } from '../types';
import { setShadowTier, type EffectiveRenderQuality } from '../renderQuality';
import { projectedDirection } from './entityBillboard';
import { perspectiveScale, worldToScreen, type PerspectiveCamera } from './projection';
import type { WorldDrawable } from './worldGeometry';

class ProjectileDrawable implements WorldDrawable {
  x = 0; y = 0; orderId = 0; seen = 0;
  projectile!: Projectile;
  quality: EffectiveRenderQuality = 'high';

  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    const position = worldToScreen(camera, this), scale = perspectiveScale(camera, this);
    if (!position || scale === null) return;
    const direction = projectedDirection(camera, this, this.projectile.velocity);
    const color = this.projectile.isShadowPulse ? COLORS.mob_moth : COLORS.projectile;
    ctx.save();
    // Preserve the old projectile's generic glow tier, including boss shots.
    setShadowTier('generic');
    ctx.translate(position.x, position.y);
    if (direction) ctx.rotate(Math.atan2(direction.y, direction.x));
    ctx.scale(scale, scale);
    ctx.shadowColor = color;
    ctx.shadowBlur = this.quality === 'high' ? 5 : 0;
    ctx.fillStyle = color;
    // A short bolt, centered on the exact logical position. Its long axis
    // follows projected velocity; no render-time movement or elevation offset.
    ctx.fillRect(-3, -2, 6, 4);
    ctx.restore();
  }
}

/** Presentation-only adapter for normal, boss and wall-phasing projectiles.
 * Reuse records and the submission array, and let the existing world queue
 * determine occlusion. Collision, lifetime and damage remain in simulation. */
export class PerspectiveProjectiles {
  private records = new Map<string, ProjectileDrawable>();
  private active: WorldDrawable[] = [];
  private frame = 0;
  private nextId = 3_000_000;

  prepare(projectiles: readonly Projectile[], quality: EffectiveRenderQuality,
    existing: readonly WorldDrawable[] = []): readonly WorldDrawable[] {
    this.frame++; this.active.length = 0;
    for (const drawable of existing) this.active.push(drawable);
    for (const projectile of projectiles) {
      let record = this.records.get(projectile.id);
      if (!record) {
        record = new ProjectileDrawable(); record.orderId = this.nextId++;
        this.records.set(projectile.id, record);
      }
      record.seen = this.frame; record.projectile = projectile; record.quality = quality;
      record.x = projectile.pos.x + 0.5; record.y = projectile.pos.y + 0.5;
      this.active.push(record);
    }
    this.records.forEach((record, id) => { if (record.seen !== this.frame) this.records.delete(id); });
    return this.active;
  }
}
