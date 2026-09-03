import type { Item } from './types';

/** What a consumable does, for glyph and label selection across HUD surfaces. */
export type ConsumableKind = 'scroll' | 'heal' | 'speed' | 'vision' | 'other';

export function isScrollItem(item: Pick<Item, 'name'>): boolean {
  return item.name.includes('Scroll of');
}

export function getConsumableKind(item: Item): ConsumableKind {
  if (isScrollItem(item)) return 'scroll';
  const stats = item.stats ?? {};
  if (stats.heal) return 'heal';
  if (stats.speed) return 'speed';
  if (stats.vision) return 'vision';
  return 'other';
}

/** Short stat line shown under / beside a consumable; null when there is nothing useful to say. */
export function getConsumableSummary(item: Item): string | null {
  const stats = item.stats ?? {};
  const parts: string[] = [];
  if (stats.heal) parts.push(`+${stats.heal} HP`);
  if (stats.speed) parts.push(`+${stats.speed} SPD`);
  if (stats.vision) parts.push(`+${stats.vision} VIS`);
  if (parts.length > 0) return parts.join(' ');
  if (isScrollItem(item)) return 'SCROLL';
  return null;
}
