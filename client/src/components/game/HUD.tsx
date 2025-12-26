import React from 'react';
import { useGame } from '../../lib/store';
import { Card } from '../ui/card';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';

export const HUD: React.FC = () => {
  const { state } = useGame();

  // Format Timer (Mockup for now, implementing real timer needs shared time state)
  // For now just show Level
  
  return (
    <div className="absolute top-0 left-0 w-full p-4 pointer-events-none z-40 flex justify-between items-start">
      {/* Top Left: Stats */}
      <div className="flex flex-col gap-2 w-1/3">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-500 pixel-corners flex items-center justify-center text-xs font-bold border-2 border-white">HP</div>
            <Progress value={(state.stats.hp / state.stats.maxHp) * 100} className="h-4 w-32 bg-gray-800 border border-white/20" />
            <span className="text-xs font-pixel text-white shadow-black drop-shadow-md">{state.stats.hp}/{state.stats.maxHp}</span>
        </div>
        <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-yellow-500 pixel-corners flex items-center justify-center text-xs font-bold border-2 border-white text-black">$</div>
             <span className="text-xl font-pixel text-yellow-400 drop-shadow-md">{state.stats.coins}</span>
        </div>
      </div>

      {/* Top Center: Level Info */}
      <div className="flex flex-col items-center">
        <Badge variant="outline" className="bg-black/50 border-primary text-primary font-pixel text-xs px-4 py-2">
            LEVEL {state.currentLevel}
        </Badge>
        {/* Timer would go here */}
      </div>

      {/* Top Right: Minimap Placeholder / Config */}
      <div className="w-1/3 flex justify-end">
         <div className="w-24 h-24 bg-black/50 border border-primary/30 p-1">
            <div className="w-full h-full border border-dashed border-white/10 flex items-center justify-center text-[8px] text-muted-foreground font-mono">
                NO SIGNAL
            </div>
         </div>
      </div>
    </div>
  );
};
