import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { cn } from '../../lib/utils';
import { RARITY_COLORS } from '../../lib/game/constants';
import { getConsumableSummary } from '../../lib/game/consumableKind';
import { ConsumableIcon } from './ConsumableIcon';
import type { Item } from '../../lib/game/types';

interface QuickConsumablesButtonProps {
  consumables: Item[];
  disabled?: boolean;
  onUseConsumable: (itemId: string) => void;
}

export const QuickConsumablesButton: React.FC<QuickConsumablesButtonProps> = ({
  consumables,
  disabled,
  onUseConsumable,
}) => {
  const [open, setOpen] = useState(false);

  if (consumables.length === 0) return null;

  return (
    <div className="relative pointer-events-auto">
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[49] md:hidden bg-transparent"
            aria-label="Close consumables menu"
            data-testid="quick-consumables-backdrop"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute bottom-full right-0 mb-2 z-50 w-56 max-h-52 overflow-y-auto scroll-touch rounded-md border border-primary/40 bg-black/90 backdrop-blur-sm shadow-lg pixel-corners"
            data-testid="quick-consumables-menu"
          >
            <p className="px-3 py-2 text-[10px] font-pixel text-primary border-b border-primary/20">
              CONSUMABLES
            </p>
            <ul className="py-1">
              {consumables.map((consumable) => {
                const rarityColor = RARITY_COLORS[consumable.rarity];
                const summary = getConsumableSummary(consumable);
                return (
                  <li key={consumable.id}>
                    <button
                      type="button"
                      data-testid={`quick-consumable-option-${consumable.id}`}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-primary/10 active:bg-primary/20 transition-colors"
                      onClick={() => {
                        onUseConsumable(consumable.id);
                        setOpen(false);
                      }}
                    >
                      <ConsumableIcon item={consumable} className="w-4 h-4 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span
                          className="block text-xs font-pixel truncate"
                          style={{ color: rarityColor }}
                        >
                          {consumable.name}
                        </span>
                        {summary && (
                          <span className="block text-[10px] font-mono text-muted-foreground">
                            {summary}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <button
        type="button"
        data-testid="quick-consumables-button"
        aria-label="Open consumables menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'md:hidden flex flex-col items-center justify-center gap-1',
          'w-14 h-14 rounded-full border-2 border-primary/50 bg-black/70 backdrop-blur-sm',
          'transition-all active:scale-95 relative',
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary/20',
        )}
      >
        <Package className="w-6 h-6 text-primary" />
        <span className="text-[10px] font-mono text-primary leading-none">{consumables.length}</span>
      </button>
    </div>
  );
};
