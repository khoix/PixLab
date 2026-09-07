import React from 'react';
import { Plus, Sword, Shield, Wrench, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Item } from '@/lib/game/types';

export type ItemTypeFilter = Item['type'] | 'all';

interface FilterOption {
  value: ItemTypeFilter;
  title: string;
  Icon: typeof Plus;
}

const OPTIONS: FilterOption[] = [
  { value: 'all', title: 'All Items', Icon: Plus },
  { value: 'weapon', title: 'Weapons', Icon: Sword },
  { value: 'armor', title: 'Armor', Icon: Shield },
  { value: 'utility', title: 'Utility', Icon: Wrench },
  { value: 'consumable', title: 'Consumables', Icon: FlaskConical },
];

export function filterItemsByType<T extends { type: Item['type'] }>(
  items: T[],
  filter: ItemTypeFilter,
): T[] {
  return filter === 'all' ? items : items.filter((item) => item.type === filter);
}

/** "NO WEAPON ITEMS" / "EMPTY", matching the lobby's existing wording. */
export function emptyFilterMessage(totalItems: number, filter: ItemTypeFilter): string {
  if (totalItems === 0) return 'EMPTY';
  return filter === 'all' ? 'EMPTY' : `NO ${filter.toUpperCase()} ITEMS`;
}

export interface ItemTypeFilterBarProps {
  value: ItemTypeFilter;
  onChange: (value: ItemTypeFilter) => void;
  /** Rendered to the left of the buttons — usually "INVENTORY (n)". */
  heading?: React.ReactNode;
  className?: string;
}

/**
 * The type filter row from the lobby's INVENTORY tab, extracted so the in-run
 * dialog and the vendor station can have it too — they had no way to filter a
 * long list at all.
 *
 * Sizing is set here rather than in `mobile.css`. The in-run dialog is portaled
 * to `document.body`, so every rule in that file scoped to `.lobby-page` /
 * `.lobby-page-grid` misses it entirely; anything that must hold inside a modal
 * has to travel with the component.
 */
export const ItemTypeFilterBar: React.FC<ItemTypeFilterBarProps> = ({
  value,
  onChange,
  heading,
  className,
}) => (
  <div
    className={cn(
      'flex flex-wrap items-center justify-between gap-2 mb-2 inventory-header-mobile',
      className,
    )}
    data-testid="item-type-filter-bar"
  >
    {heading}
    <div className="flex items-center gap-1 inventory-buttons-mobile">
      {OPTIONS.map(({ value: option, title, Icon }) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          // 36px keeps every one of these a real touch target inside a modal,
          // where the lobby's mobile.css sizing does not reach.
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center border transition-all',
            value === option
              ? 'border-primary bg-primary/20 text-primary'
              : 'border-white/20 hover:border-white/40 text-muted-foreground',
          )}
          title={title}
          aria-label={title}
          aria-pressed={value === option}
          data-testid={`item-filter-${option}`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  </div>
);
