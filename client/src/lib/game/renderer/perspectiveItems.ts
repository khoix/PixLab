import type { Item, Level } from '../types';
import { drawWeaponIcon, drawArmorIcon, drawUtilityIcon, drawConsumableIcon } from '../itemIcons';
import { perspectiveScale, worldToScreen, type PerspectiveCamera } from './projection';
import type { WorldDrawable } from './worldGeometry';

class ItemDrop implements WorldDrawable {
  x = 0; y = 0; orderId = 0;
  item!: Item;
  draw(ctx: CanvasRenderingContext2D, camera: PerspectiveCamera): void {
    const foot = worldToScreen(camera, this), scale = perspectiveScale(camera, this);
    if (!foot || scale === null) return;
    const size = 20 * scale;
    // Readable upright pickup icon with its bottom at the true ground point.
    // Reuse the existing bitmap cache, loading fallback and rarity artwork.
    ctx.save(); ctx.shadowBlur = 0;
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
