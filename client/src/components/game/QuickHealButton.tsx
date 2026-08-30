import React from 'react';
import { FlaskConical } from 'lucide-react';
import { cn } from '../../lib/utils';

interface QuickHealButtonProps {
  healAmount: number | null;
  disabled?: boolean;
  onHeal: () => void;
}

export const QuickHealButton: React.FC<QuickHealButtonProps> = ({
  healAmount,
  disabled,
  onHeal,
}) => {
  return (
    <button
      type="button"
      data-testid="quick-heal-button"
      aria-label="Use smallest healing potion"
      disabled={disabled || healAmount === null}
      onClick={onHeal}
      className={cn(
        'md:hidden mobile-quick-heal pointer-events-auto z-50',
        'flex flex-col items-center justify-center gap-1',
        'w-14 h-14 rounded-full border-2 border-primary/50 bg-black/70 backdrop-blur-sm',
        'transition-all active:scale-95',
        disabled || healAmount === null
          ? 'opacity-40 cursor-not-allowed'
          : 'opacity-[var(--mobile-control-opacity,0.85)] hover:bg-primary/20',
      )}
      style={{ transform: 'scale(var(--mobile-control-scale, 1))' }}
    >
      <FlaskConical className="w-6 h-6 text-cyan-400" />
      {healAmount !== null && (
        <span className="text-[10px] font-mono text-cyan-300 leading-none">+{healAmount}</span>
      )}
    </button>
  );
};
