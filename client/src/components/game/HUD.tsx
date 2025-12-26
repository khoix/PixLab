import React, { useEffect, useState } from 'react';
import { useGame } from '../../lib/store';
import { Card } from '../ui/card';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { LEVEL_TIME_LIMIT, SHOP_INTERVAL, BOSS_INTERVAL } from '../../lib/game/constants';
import { MODS } from '../../lib/game/constants';

interface HUDProps {
  levelStartTime: number;
  isShop: boolean;
  isBoss: boolean;
}

export const HUD: React.FC<HUDProps> = ({ levelStartTime, isShop, isBoss }) => {
  const { state } = useGame();
  const [timeLeft, setTimeLeft] = useState(LEVEL_TIME_LIMIT);

  useEffect(() => {
    if (isShop || isBoss) return;

    const interval = setInterval(() => {
      const modifiers = MODS.reduce((acc, mod) => {
        if (state.activeMods.includes(mod.id) && mod.modifiers?.timerMult) {
          acc.timerMult = mod.modifiers.timerMult;
        }
        return acc;
      }, { timerMult: 1 });

      const elapsed = (Date.now() - levelStartTime) / 1000;
      const limit = LEVEL_TIME_LIMIT * modifiers.timerMult;
      const remaining = Math.max(0, limit - elapsed);
      setTimeLeft(Math.ceil(remaining));
    }, 100);

    return () => clearInterval(interval);
  }, [levelStartTime, isShop, isBoss, state.activeMods]);

  const nextShop = Math.ceil(state.currentLevel / SHOP_INTERVAL) * SHOP_INTERVAL;
  const nextBoss = Math.ceil(state.currentLevel / BOSS_INTERVAL) * BOSS_INTERVAL;

  return (
    <div className="absolute top-0 left-0 w-full p-4 pointer-events-none z-40 flex justify-between items-start">
      {/* Top Left: Stats */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-500 pixel-corners flex items-center justify-center text-xs font-bold border-2 border-white">HP</div>
          <Progress value={(state.stats.hp / state.stats.maxHp) * 100} className="h-4 w-32 bg-gray-800 border border-white/20" />
          <span className="text-xs font-pixel text-white drop-shadow-md">{state.stats.hp}/{state.stats.maxHp}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-yellow-500 pixel-corners flex items-center justify-center text-xs font-bold border-2 border-white text-black">$</div>
          <span className="text-xl font-pixel text-yellow-400 drop-shadow-md">{state.stats.coins}</span>
        </div>
      </div>

      {/* Top Center: Level & Timer */}
      <div className="flex flex-col items-center gap-2">
        <Badge variant="outline" className="bg-black/50 border-primary text-primary font-pixel text-xs px-4 py-2">
          LEVEL {state.currentLevel}
        </Badge>
        {!isShop && !isBoss && (
          <div className={`font-pixel text-lg drop-shadow-md transition-colors ${timeLeft < 30 ? 'text-red-500 animate-pulse' : 'text-primary'}`}>
            {Math.floor(timeLeft)}s
          </div>
        )}
        {isShop && <Badge className="bg-green-900 border-green-500 text-green-100">SHOP SECTOR</Badge>}
        {isBoss && <Badge className="bg-yellow-900 border-yellow-500 text-yellow-100">BOSS SECTOR</Badge>}
      </div>

      {/* Top Right: Upcoming */}
      <div className="flex flex-col gap-1 text-right text-xs text-muted-foreground font-mono">
        <div>SHOP: Level {nextShop}</div>
        <div>BOSS: Level {nextBoss}</div>
        <div>MODS: {state.activeMods.length}/3</div>
      </div>
    </div>
  );
};
