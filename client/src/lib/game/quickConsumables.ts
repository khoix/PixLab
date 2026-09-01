import type { Item } from './types';
import { findSmallestHealingPotion } from './quickHeal';

export function getConsumables(inventory: Item[]): Item[] {
  return inventory.filter((item) => item.type === 'consumable');
}

/** Show quick consumables picker when more than quick-heal alone can cover. */
export function shouldShowQuickConsumablesMenu(inventory: Item[]): boolean {
  const consumables = getConsumables(inventory);
  if (consumables.length === 0) return false;
  if (consumables.length > 1) return true;
  return findSmallestHealingPotion(inventory) === null;
}
