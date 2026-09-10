import type { Item, Level } from '../types';
import { RARITY_COLORS } from '../constants';
import { getActiveRenderQuality } from '../renderQuality';
import { PerspectivePropGeometry } from './perspectiveProps';
import { drawWeaponIcon, drawArmorIcon, drawUtilityIcon, drawConsumableIcon } from '../itemIcons';
import { perspectiveScale, worldToScreen, type PerspectiveCamera } from './projection';
import type { WorldDrawable } from './worldGeometry';

class ItemDrop implements WorldDrawable {
  x = 0; y = 0; orderId = 0;
  item!: Item;
  private geometry = new PerspectivePropGeometry();
  drawGround(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    if (getActiveRenderQuality() !== 'high') return;
    ctx.save(); ctx.shadowBlur = 0;
    this.geometry.ring(ctx, camera, this.x, this.y, 0.36, 0, 0, 'rgba(0,0,0,0.22)', '#000');
    ctx.restore();
  }
  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    const foot = worldToScreen(camera, this, 0.18), scale = perspectiveScale(camera, this, 0.18);
    if (!foot || scale === null) return;
    const size = 20 * scale;
    // Keep subtype artwork upright, seated on a shallow rarity-tinted voxel base.
    // Reuse the existing bitmap cache, loading fallback and rarity artwork.
    ctx.save(); ctx.shadowBlur = 0;
    const rarity = RARITY_COLORS[this.item.rarity] ?? RARITY_COLORS.common;
    this.geometry.box(ctx, camera, this.x, this.y, 0.29, 0.23, 0, 0.14, '#414856', '#252936', '#181c28');
    this.geometry.box(ctx, camera, this.x, this.y, 0.26, 0.20, 0.14, 0.04, rarity, '#555c6c', '#313747');
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
