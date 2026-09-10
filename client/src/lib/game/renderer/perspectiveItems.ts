import type { Item, Level } from '../types';
import { RARITY_COLORS } from '../constants';
import { getActiveRenderQuality } from '../renderQuality';
import { PerspectivePropGeometry } from './perspectiveProps';
import { drawWeaponIcon, drawArmorIcon, drawUtilityIcon, drawConsumableIcon } from '../itemIcons';
import { perspectiveScale, worldToScreen, type PerspectiveCamera } from './projection';
import type { WorldDrawable } from './worldGeometry';
import {
  GLOW_RADIUS, GLOW_STOPS, GROUND_SQUASH, ICON_HOVER, ICON_SIZE, withAlpha,
} from './itemGlow';


class ItemDrop implements WorldDrawable {
  x = 0; y = 0; orderId = 0;
  item!: Item;
  private geometry = new PerspectivePropGeometry();
  drawGround(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    const quality = getActiveRenderQuality();
    ctx.save(); ctx.shadowBlur = 0;
    // Dark contact patch first, so the drop still reads as resting on the
    // floor rather than hovering over its own light.
    if (quality === 'high') {
      this.geometry.ring(ctx, camera, this.x, this.y, 0.36, 0, 0, 'rgba(0,0,0,0.22)', '#000');
    }
    // Then the rarity glow on top of it. This runs at every quality: it is now
    // the whole of how rarity reads on a dropped item, so dropping it would
    // make the drop colourless rather than merely cheaper.
    const foot = worldToScreen(camera, this, 0);
    const scale = perspectiveScale(camera, this, 0);
    if (foot && scale !== null) {
      const rarity = RARITY_COLORS[this.item.rarity] ?? RARITY_COLORS.common;
      const radius = ICON_SIZE * GLOW_RADIUS * scale;
      if (radius > 0.5) {
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        for (const [offset, alpha] of GLOW_STOPS) glow.addColorStop(offset, withAlpha(rarity, alpha));
        ctx.translate(foot.x, foot.y);
        ctx.scale(1, GROUND_SQUASH);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    const foot = worldToScreen(camera, this, ICON_HOVER), scale = perspectiveScale(camera, this, ICON_HOVER);
    if (!foot || scale === null) return;
    const size = ICON_SIZE * scale;
    // Keep subtype artwork upright, seated on a shallow voxel base. Reuse the
    // existing bitmap cache, loading fallback and rarity artwork.
    ctx.save(); ctx.shadowBlur = 0;
    // No voxel plinth. There were two boxes here: a dark base and a
    // rarity-coloured slab on top, and the slab's flat filled top face is the
    // square that was showing under every drop. Recolouring it does not help —
    // a projected quad has hard edges whatever its fill — and keeping only the
    // dark one just swaps a coloured square for a grey one, which is worse,
    // because it also sits over the middle of the ground glow and hides the
    // brightest part of it. The drop is now its icon plus the light it casts.
    const x = foot.x - size / 2, y = foot.y - size;
    if (this.item.type === 'weapon') drawWeaponIcon(ctx, x, y, size, this.item);
    else if (this.item.type === 'armor') drawArmorIcon(ctx, x, y, size, this.item);
    else if (this.item.type === 'utility') drawUtilityIcon(ctx, x, y, size, this.item);
    else if (this.item.type === 'consumable') drawConsumableIcon(ctx, x, y, size, this.item);
    ctx.restore();
  }
}

export class PerspectiveItems {
  private pool: ItemDrop[] = [];
  private active: WorldDrawable[] = [];
  prepare(items: Level['items'], existing: readonly WorldDrawable[] = []): readonly WorldDrawable[] {
    this.active.length = 0;
    for (const drawable of existing) this.active.push(drawable);
    for (let i = 0; i < items.length; i++) {
      const drop = this.pool[i] ?? (this.pool[i] = new ItemDrop());
      drop.x = items[i].pos.x + 0.5; drop.y = items[i].pos.y + 0.5;
      drop.item = items[i].item; drop.orderId = 4_000_000 + i;
      this.active.push(drop);
    }
    return this.active;
  }
}
