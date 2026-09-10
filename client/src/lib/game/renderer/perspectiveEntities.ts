import type { WorldVisibility } from './perspectiveFog';
import { TILE_SIZE } from '../constants';
import type { Entity, Level } from '../types';
import { makeStrokeGlowCircle, setShadowTier, type EffectiveRenderQuality } from '../renderQuality';
import { BOSS_RANGED_TELEGRAPH_MS, RANGED_TELEGRAPH_MS } from '../combat/rangedTelegraph';
import { billboardLayout, entityAppearance, projectedDirection } from './entityBillboard';
import { worldToScreen, type PerspectiveCamera } from './projection';
import { drawMobArt } from './mobArt';
import { mobSpriteCache } from './mobSpriteCache';
import type { WorldDrawable } from './worldGeometry';

// Reused unit ellipse; the ground projection supplies depth, flattening and skew.
const SHADOW_RING = Array.from({ length: 16 }, (_, i) => ({
  x: Math.cos(i * Math.PI / 8), y: Math.sin(i * Math.PI / 8),
}));

class EntityBillboard implements WorldDrawable {
  x = 0; y = 0; orderId = 0; seen = 0;
  entity: Entity | null = null;
  appearance = entityAppearance(null);
  layout: ReturnType<typeof billboardLayout> = null;
  quality: EffectiveRenderQuality = 'high';
  now = 0; phasing = false;
  private point = { x: 0, y: 0 };
  drawOccluded?: WorldDrawable['drawOccluded'];

  constructor(player = false) {
    if (player) this.drawOccluded = ctx => {
      const p = this.layout;
      if (!p) return;
      ctx.save(); ctx.shadowBlur = 0;
      ctx.strokeStyle = this.phasing ? 'rgba(181,132,255,0.55)' : 'rgba(5,217,232,0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - 10 * p.scale, p.footY - 20 * p.scale, 20 * p.scale, 20 * p.scale);
      ctx.restore();
    };
  }

  drawGround(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    if (!this.layout) return;
    ctx.save(); ctx.shadowBlur = 0;
    const prominent = !this.entity || this.entity.isBoss;
    const bands = this.quality === 'high' || (this.quality === 'medium' && prominent) ? 2 : 1;
    const radius = this.appearance.size / TILE_SIZE * 0.43;
    for (let band = bands - 1; band >= 0; band--) {
      const r = radius * (band ? 1.3 : 1);
      ctx.beginPath();
      let valid = true;
      for (let i = 0; i < SHADOW_RING.length; i++) {
        this.point.x = this.x + SHADOW_RING[i].x * r;
        this.point.y = this.y + SHADOW_RING[i].y * r * 0.6;
        const p = worldToScreen(camera, this.point);
        if (!p) { valid = false; break; }
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      if (valid) {
        ctx.closePath(); ctx.fillStyle = band ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.24)'; ctx.fill();
      }
    }
    const e = this.entity;
    const telegraph = e?.attackTelegraphUntil && this.now < e.attackTelegraphUntil;
    const direction = telegraph ? e.attackTelegraphVelocity : e?.chargeDirection;
    if (direction) {
      const duration = e?.attackTelegraphMs ?? (e?.isBoss ? BOSS_RANGED_TELEGRAPH_MS : RANGED_TELEGRAPH_MS);
      const progress = telegraph ? Math.max(0, Math.min(1, 1 - (e!.attackTelegraphUntil! - this.now) / duration)) : 1;
      const length = 1.1 + 2.2 * progress;
      const magnitude = Math.hypot(direction.x, direction.y);
      if (magnitude > 0) {
        this.point.x = this.x + direction.x / magnitude * length;
        this.point.y = this.y + direction.y / magnitude * length;
        const end = worldToScreen(camera, this.point), start = this.layout;
        if (end) {
          ctx.strokeStyle = `rgba(255,80,120,${0.35 + progress * 0.5})`;
          ctx.lineWidth = Math.max(1, Math.min(3, start.scale * 1.5));
          ctx.beginPath(); ctx.moveTo(start.x, start.footY); ctx.lineTo(end.x, end.y);
          const angle = Math.atan2(end.y - start.footY, end.x - start.x), head = 5 * start.scale;
          ctx.lineTo(end.x - Math.cos(angle - 0.5) * head, end.y - Math.sin(angle - 0.5) * head);
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(end.x - Math.cos(angle + 0.5) * head, end.y - Math.sin(angle + 0.5) * head);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    const p = this.layout;
    if (!p) return;
    const e = this.entity, a = this.appearance;
    ctx.save();
    setShadowTier(!e ? 'player' : e.isBoss ? 'boss' : 'generic');
    ctx.translate(p.x, p.centerY); ctx.scale(p.scale, p.scale);
    if (!e) {
      ctx.globalAlpha *= this.phasing ? 0.7 : 1;
      ctx.shadowColor = this.phasing ? '#9d4edd' : a.color;
      ctx.shadowBlur = this.phasing ? 20 : 15;
      ctx.fillStyle = a.color; ctx.fillRect(-10, -10, 20, 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.fillRect(-6, -6, 12, 12);
      if (this.quality === 'low' || this.phasing) {
        ctx.strokeStyle = this.phasing ? '#b584ff' : a.color; ctx.lineWidth = 2;
        ctx.strokeRect(-11, -11, 22, 22);
      }
    } else {
      const key = { subtype: e.mobSubtype, isBoss: !!e.isBoss, color: a.color, size: a.size,
        quality: this.quality, charging: !!e.chargeDirection, billboard: true };
      const sprite = mobSpriteCache.get(key, e.isBoss ? 'boss' : 'generic');
      if (sprite) mobSpriteCache.draw(ctx, sprite, -0.5, -0.5);
      else drawMobArt(ctx, { ...key, centerX: 0, centerY: 0 }, makeStrokeGlowCircle(this.quality));
      // Keep identity-bearing faces upright. Only aim-dependent parts turn.
      const direction = e.chargeDirection ?? e.attackTelegraphVelocity
        ?? e.pounceDirection ?? e.roamDirection
        ?? { x: camera.focus.x - this.x, y: camera.focus.y - this.y };
      const aim = projectedDirection(camera, this, direction);
      if (aim && e.mobSubtype === 'turret') {
        ctx.save(); ctx.rotate(Math.atan2(aim.y, aim.x)); ctx.shadowBlur = 0;
        ctx.fillStyle = '#0d8f6a'; ctx.fillRect(a.size * 0.15, -a.size * 0.15, a.size * 0.5, a.size * 0.3);
        ctx.fillStyle = '#0a6b52'; ctx.fillRect(a.size * 0.58, -a.size * 0.15, a.size * 0.07, a.size * 0.3);
        ctx.strokeStyle = '#06a77d'; ctx.lineWidth = 1;
        ctx.strokeRect(a.size * 0.3, -a.size * 0.15, a.size * 0.35, a.size * 0.3);
        ctx.restore();
      } else if (aim && (e.mobSubtype === 'charger' || e.mobSubtype === 'sniper' || e.chargeDirection)) {
        ctx.save(); ctx.rotate(Math.atan2(aim.y, aim.x)); ctx.shadowBlur = 0;
        ctx.strokeStyle = e.chargeDirection ? '#ffb0a4' : a.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.size * 0.5, -3); ctx.lineTo(a.size * 0.65, 0);
        ctx.lineTo(a.size * 0.5, 3); ctx.stroke(); ctx.restore();
      }
      if (e.hitFlashUntil && this.now < e.hitFlashUntil) {
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(-a.size / 2, -a.top, a.size, a.top + a.bottom);
      }
    }
    ctx.restore();
  }

  drawOverlay(ctx: CanvasRenderingContext2D): void {
    const e = this.entity, p = this.layout;
    if (!e || !p) return;
    ctx.save(); ctx.shadowBlur = 0;
    const width = p.barWidth, y = p.topY - 7;
    ctx.fillStyle = '#180c14'; ctx.fillRect(p.x - width / 2 - 1, y - 1, width + 2, 5);
    ctx.fillStyle = '#ff0000'; ctx.fillRect(p.x - width / 2, y, width, 3);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(p.x - width / 2, y, width * Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp))), 3);
    if (e.isBoss && (e.bossPhase === 'telegraph' || e.bossPhase === 'execute')) {
      ctx.fillStyle = '#ffb0a4'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('!', p.x, y - 4);
    }
    ctx.restore();
  }
}

/** Presentation-only adapter. Records/queue and cached static mob paths survive
 * frames; fractional logical mob positions and the interpolated camera focus
 * are read directly. No simulation state or timing is advanced here. */
export class PerspectiveEntities {
  private records = new Map<string, EntityBillboard>();
  private player = new EntityBillboard(true);
  private active: WorldDrawable[] = [];
  private frame = 0;
  private nextId = 1_000_000;
  drawnEntities = 0;

  prepare(level: Level, camera: PerspectiveCamera, quality: EffectiveRenderQuality, now: number,
    phasing: boolean, markers: readonly WorldDrawable[] = []): readonly WorldDrawable[] {
    this.frame++; this.active.length = 0; this.drawnEntities = 0;
    for (const marker of markers) this.active.push(marker);
    for (const e of level.entities) {
      if (e.hp <= 0 || (e.type !== 'enemy' && e.type !== 'boss_enemy')) continue;
      let record = this.records.get(e.id);
      if (!record) { record = new EntityBillboard(); record.orderId = this.nextId++; this.records.set(e.id, record); }
      record.seen = this.frame; record.entity = e;
      record.x = e.pos.x + 0.5; record.y = e.pos.y + 0.5;
      record.appearance = entityAppearance(e); record.quality = quality; record.now = now;
      record.layout = billboardLayout(camera, record, record.appearance);
      const p = record.layout;
      // Include sprite glow / aimed barrel and overlays at viewport edges.
      if (!p || p.x + 48 * p.scale < 0 || p.x - 48 * p.scale > camera.width
        || p.footY + 24 * p.scale < 0 || p.topY - 24 * p.scale > camera.height) continue;
      this.active.push(record); this.drawnEntities++;
    }
    this.records.forEach((record, id) => { if (record.seen !== this.frame) this.records.delete(id); });
    const player = this.player;
    player.x = camera.focus.x; player.y = camera.focus.y; player.orderId = 2_000_000;
    player.quality = quality; player.phasing = phasing; player.now = now;
    player.layout = billboardLayout(camera, player, player.appearance);
    this.active.push(player);
    return this.active;
  }

  drawDamageNumbers(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera, level: Level, now: number, visibility?: WorldVisibility): void {
    if (!level.damageNumbers?.length) return;
    ctx.save(); ctx.shadowBlur = 0; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    for (const entry of level.damageNumbers) {
      const t = Math.max(0, Math.min(1, (now - entry.createdAt) / entry.lifetime));
      if (t >= 1) continue;
      const p = billboardLayout(camera, { x: entry.pos.x + 0.5, y: entry.pos.y + 0.5 }, entityAppearance(null));
      if (!p) continue;
      ctx.globalAlpha = (1 - t) * (visibility?.visibilityAt({ x: entry.pos.x + 0.5, y: entry.pos.y + 0.5 }) ?? 1); ctx.fillStyle = entry.isCrit ? '#ffd700' : '#ffffff';
      ctx.fillText(String(entry.amount), p.x, p.topY - 12 - t * 20);
    }
    ctx.restore();
  }
}
