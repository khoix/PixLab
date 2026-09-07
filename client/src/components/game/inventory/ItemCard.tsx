import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Item } from '@/lib/game/types';
import type { InventoryDensity } from './EquippedSlotRow';

const STAT_ROWS: Array<[keyof NonNullable<Item['stats']>, string]> = [
  ['damage', 'DMG'],
  ['defense', 'DEF'],
  ['speed', 'SPD'],
  ['vision', 'VIS'],
  ['heal', 'HEAL'],
];

export interface ItemCardProps {
  item: Item;
  rarityColor: string;
  isEquipped: boolean;
  canEquip: boolean;
  density?: InventoryDensity;
  onToggleEquip: (item: Item, isEquipped: boolean) => void;
}

/**
 * One row in an inventory list: name, EQUIP/UNEQUIP, stat lines.
 *
 * Was two near-identical inline copies — lobby tab and in-run dialog — differing
 * only in text sizes. Same `min-w-0` / `shrink-0` treatment as
 * `EquippedSlotRow`: the name takes the slack and wraps, the button holds its
 * width, so a long name can never push the action out of a narrow container.
 */
export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  rarityColor,
  isEquipped,
  canEquip,
  density = 'default',
  onToggleEquip,
}) => {
  const compact = density === 'compact';

  return (
    <div
      className={cn(
        'p-3 border transition-all',
        isEquipped ? 'border-primary bg-primary/10' : 'border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span
          className={cn('min-w-0 flex-1 break-words font-pixel leading-snug', compact ? 'text-sm' : 'text-base')}
          style={{ color: rarityColor }}
        >
          {item.name}
        </span>
        {canEquip && (
          <Button
            size="sm"
            variant="outline"
            className={cn(
              'h-6 shrink-0 px-2 text-xs font-pixel',
              isEquipped
                ? 'border-red-500/50 bg-red-500/10 hover:bg-red-500/20'
                : 'border-green-500/50 bg-green-500/10 hover:bg-green-500/20',
            )}
            onClick={() => onToggleEquip(item, isEquipped)}
            data-testid={`item-action-${item.id}`}
          >
            {isEquipped ? 'UNEQUIP' : 'EQUIP'}
          </Button>
        )}
      </div>
      {item.stats && (
        <div
          className={cn(
            'font-mono text-muted-foreground space-y-0.5',
            compact ? 'text-lg' : 'text-xl',
          )}
        >
          {STAT_ROWS.map(([key, label]) =>
            item.stats?.[key] ? (
              <div key={key}>
                {label}: +{item.stats[key]}
              </div>
            ) : null,
          )}
        </div>
      )}
      {item.type === 'consumable' && (
        <div className="text-lg text-cyan-400 font-mono mt-1">[CONSUMABLE]</div>
      )}
    </div>
  );
};
