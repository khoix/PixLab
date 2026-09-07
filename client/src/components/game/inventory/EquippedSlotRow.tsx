import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Item } from '@/lib/game/types';

export type EquipSlot = 'weapon' | 'armor' | 'utility';

/**
 * `default` is the lobby's roomy sizing; `compact` is for the in-run dialog and
 * anywhere else inside a modal, where the box is `max-w-md` minus `p-6`.
 */
export type InventoryDensity = 'default' | 'compact';

export interface EquippedSlotRowProps {
  label: string;
  slot: EquipSlot;
  item: Item | null;
  density?: InventoryDensity;
  onUnequip: (slot: EquipSlot, item: Item) => void;
}

const STAT_ROWS: Array<[keyof NonNullable<Item['stats']>, string]> = [
  ['damage', 'DMG'],
  ['defense', 'DEF'],
  ['speed', 'SPD'],
  ['vision', 'VIS'],
];

/**
 * One EQUIPPED slot: label, item name, UNEQUIP, stat lines.
 *
 * This markup existed in six inline copies — three in the lobby tab, three in
 * the in-run dialog — which is how the two drifted apart. The dialog's copy set
 * the name to `font-pixel` and the button to `text-lg`, and neither flex child
 * carried `min-w-0`. Press Start 2P is about twice the advance width of the
 * lobby's mono font, so a long name ("Necromancer's Mantle Lv16") could not
 * shrink, the `whitespace-nowrap` button could not shrink either, and the row
 * overflowed. `DialogContent` has `overflow-x-hidden`, so instead of scrolling
 * it silently **clipped the button off-screen** — leaving no way to unequip.
 *
 * The fix lives here so it cannot drift again: the name takes the slack and
 * wraps, the button never shrinks.
 */
export const EquippedSlotRow: React.FC<EquippedSlotRowProps> = ({
  label,
  slot,
  item,
  density = 'default',
  onUnequip,
}) => {
  const compact = density === 'compact';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg font-mono text-muted-foreground">{label}:</span>
      </div>
      <div
        className={cn(
          'p-2 border text-lg font-mono',
          item ? 'border-primary/30 bg-primary/5' : 'border-white/10',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              // `min-w-0` is what lets the name shrink below its min-content
              // width; without it the row cannot fit and gets clipped.
              'min-w-0 flex-1 break-words',
              item ? 'text-primary' : 'text-muted-foreground',
              compact ? 'text-base font-pixel leading-snug' : 'text-2xl',
            )}
            data-testid={`equipped-name-${slot}`}
          >
            {item?.name || 'NONE'}
          </span>
          {item && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 shrink-0 px-2 text-xs font-pixel border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
              onClick={() => onUnequip(slot, item)}
              data-testid={`unequip-${slot}`}
            >
              UNEQUIP
            </Button>
          )}
        </div>
        {item?.stats && (
          <div
            className={cn(
              'text-muted-foreground space-y-0.5 mt-1',
              compact ? 'text-lg' : 'text-xl',
            )}
          >
            {STAT_ROWS.map(([key, statLabel]) =>
              item.stats?.[key] ? (
                <div key={key}>
                  {statLabel}: +{item.stats[key]}
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
};
