import type { Level } from '../types';
import type { EffectiveRenderQuality } from '../renderQuality';
import { drawWeaponIcon, drawArmorIcon, drawUtilityIcon, drawConsumableIcon } from '../itemIcons';
import { needsThreatMarker } from './fogGradient';
import { ICON_SIZE } from './itemGlow';
import { perspectiveScale, worldToScreen, type PerspectiveCamera } from './projection';

/** Sense scrolls intentionally reveal markers above fog/walls. Their positions
 * remain world anchored; sparkle decoration never mutates the particle array. */
export function drawPerspectiveSenses(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera,
  level: Level, radiusTiles: number, threat: boolean, loot: boolean, now: number,
  quality: EffectiveRenderQuality): void {
  if (!threat && !loot) return;
  const sparkle = (x: number, y: number, scale: number, phase: number) => {
    if (quality === 'low') return;
    const t = (now / 700 + phase) % 1;
    ctx.save(); ctx.globalAlpha = 1 - t; ctx.fillStyle = '#ffffc8';
    ctx.beginPath(); ctx.arc(x + Math.cos(phase * 6) * 12 * scale, y - t * 10 * scale,
      (quality === 'high' ? 2 : 1) * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  if (threat) for (const e of level.entities) {
    if (e.type !== 'enemy' && e.type !== 'boss_enemy') continue;
    const foot = { x: e.pos.x + 0.5, y: e.pos.y + 0.5 };
    const distance = Math.hypot(foot.x - camera.focus.x, foot.y - camera.focus.y);
    if (!needsThreatMarker(distance, radiusTiles)) continue;
    const p = worldToScreen(camera, foot), scale = perspectiveScale(camera, foot);
    if (!p || scale === null) continue;
    ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = 0.6;
    ctx.filter = quality === 'high' ? 'blur(3px)' : 'none'; ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(p.x, p.y - 8 * scale, 9.6 * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    sparkle(p.x, p.y - 8 * scale, scale, (foot.x * 0.13 + foot.y * 0.27) % 1);
  }
  if (loot) for (const { pos, item } of level.items) {
    const foot = { x: pos.x + 0.5, y: pos.y + 0.5 };
    const outside = Math.hypot(foot.x - camera.focus.x, foot.y - camera.focus.y) > radiusTiles;
    const p = worldToScreen(camera, foot), scale = perspectiveScale(camera, foot);
    if (!p || scale === null) continue;
    ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = outside ? 0.6 : 1;
    ctx.filter = outside && quality === 'high' ? 'blur(3px)' : 'none';
    // Same constant as the drop itself. These are two views of one object —
    // the marker is the icon seen through fog — so a literal 20 here would now
    // draw it at half the size of the pickup it is pointing at. They matched
    // only because `drawIcon` used to ignore the size it was handed.
    const size = ICON_SIZE * scale, x = p.x - size / 2, y = p.y - size;
    if (item.type === 'weapon') drawWeaponIcon(ctx, x, y, size, item);
    else if (item.type === 'armor') drawArmorIcon(ctx, x, y, size, item);
    else if (item.type === 'utility') drawUtilityIcon(ctx, x, y, size, item);
    else drawConsumableIcon(ctx, x, y, size, item);
    ctx.restore();
    if (outside) sparkle(p.x, p.y - size / 2, scale, (foot.x * 0.31 + foot.y * 0.17) % 1);
  }
}
