import type { Item } from './types';

export function findSmallestHealingPotion(inventory: Item[]): Item | null {
  const healingPotions = inventory.filter(
    (item) => item.type === 'consumable' && item.stats?.heal,
  );

  if (healingPotions.length === 0) return null;

  return [...healingPotions].sort(
    (a, b) => (a.stats?.heal || 0) - (b.stats?.heal || 0),
  )[0];
}
