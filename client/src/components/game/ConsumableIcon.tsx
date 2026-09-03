import React from 'react';
import { Eye, FlaskConical, ScrollText, Sparkles, Zap } from 'lucide-react';
import { RARITY_COLORS } from '../../lib/game/constants';
import { getConsumableKind, type ConsumableKind } from '../../lib/game/consumableKind';
import type { Item } from '../../lib/game/types';

const GLYPHS: Record<ConsumableKind, React.ComponentType<{ className?: string; style?: React.CSSProperties; size?: number }>> = {
  scroll: ScrollText,
  heal: FlaskConical,
  speed: Zap,
  vision: Eye,
  other: Sparkles,
};

interface ConsumableIconProps {
  item: Item;
  className?: string;
  size?: number;
  /** Override the rarity tint (e.g. quick-heal keeps its cyan). */
  color?: string;
}

/**
 * One glyph per consumable kind so scrolls, potions, stims and light potions
 * are distinguishable at a glance in every DOM surface (desktop panel, mobile
 * quick menu). Exposes the kind on a data attribute for tests.
 */
export const ConsumableIcon: React.FC<ConsumableIconProps> = ({ item, className, size, color }) => {
  const kind = getConsumableKind(item);
  const Glyph = GLYPHS[kind];
  return (
    <Glyph
      className={className}
      size={size}
      style={{ color: color ?? RARITY_COLORS[item.rarity] ?? '#9e9e9e' }}
      // Lucide forwards unknown props to the <svg>
      {...({ 'data-consumable-kind': kind } as Record<string, string>)}
    />
  );
};
