import React, { useEffect, useState } from 'react';
import { useGame } from '../../lib/store';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { getSectorTimeLeftSec } from '../../lib/game/sectorTimer';
import { useIsMobile } from '../../hooks/use-mobile';
import { EyeOff } from 'lucide-react';
import { SectorTimerBar } from './SectorTimerBar';

interface HUDProps {
  isShop: boolean;
  isBoss: boolean;
}

export const HUD: React.FC<HUDProps> = ({ isShop, isBoss }) => {
  const { state } = useGame();
  const isMobile = useIsMobile();
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.ceil(getSectorTimeLeftSec(state.activeMods)),
  );
  const [visionDebuff, setVisionDebuff] = useState(0);

  useEffect(() => {
    if (isShop || isBoss) return;

    const interval = setInterval(() => {
      setTimeLeft(Math.ceil(getSectorTimeLeftSec(state.activeMods)));
    }, 100);

    return () => clearInterval(interval);
  }, [isShop, isBoss, state.activeMods, state.currentLevel]);

  useEffect(() => {
    if (state.screen !== 'run') return;

    const interval = setInterval(() => {
      setVisionDebuff(window.__PIXLAB_RUNTIME__?.getVisionDebuff() ?? 0);
    }, 150);

    return () => clearInterval(interval);
  }, [state.screen, state.currentLevel]);

  const debuffPercent = Math.round(visionDebuff * 100);

  return (
    <>
      <div className={`absolute top-0 left-0 w-full p-4 pointer-events-none z-40 flex items-start safe-area-top ${isMobile ? 'mobile-hud-stats' : ''}`}>
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
          {visionDebuff > 0.05 && (
            <div
              className="flex items-center gap-2 mt-1"
              data-testid="vision-debuff-indicator"
              title={`Vision reduced by ${debuffPercent}%`}
            >
              <div className="w-8 h-8 bg-purple-900/80 pixel-corners flex items-center justify-center border-2 border-purple-400/60">
                <EyeOff className="w-4 h-4 text-purple-200" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-pixel text-purple-200 uppercase tracking-wide">Nyx Blight</span>
                <div className="w-20 h-1.5 bg-black/60 border border-purple-400/30">
                  <div
                    className="h-full bg-purple-400 transition-all duration-200"
                    style={{ width: `${Math.min(100, debuffPercent)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Top Center: Level & Timer (Desktop only) - Absolutely centered */}
        {!isMobile && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2">
            <Badge variant="outline" className="bg-black/50 border-primary text-primary font-pixel text-xs px-4 py-2">
              SECTOR {state.currentLevel}
            </Badge>
            {!isShop && !isBoss && (
              <div
                className={`font-pixel text-lg drop-shadow-md transition-colors ${timeLeft < 30 ? 'text-red-500 animate-pulse' : 'text-primary'}`}
                data-testid="hud-sector-timer"
              >
                {Math.floor(timeLeft)}s
              </div>
            )}
            {isShop && <Badge className="bg-green-900 border-green-500 text-green-100">SHOP SECTOR</Badge>}
            {isBoss && <Badge className="bg-yellow-900 border-yellow-500 text-yellow-100">BOSS SECTOR</Badge>}
          </div>
        )}

      </div>

      {/* Mobile: vertical sector timer (right edge, safe from browser chrome) */}
      {isMobile && !isShop && !isBoss && (
        <SectorTimerBar activeModIds={state.activeMods} timeLeftSec={timeLeft} />
      )}

      {/* Bottom Center: Level badge (Mobile only) */}
      {isMobile && (
        <div className="mobile-hud-sector-badge absolute bottom-[100px] left-0 w-full p-4 pointer-events-none z-40 flex justify-center items-end">
          <div className="flex flex-col items-center gap-2">
            <Badge variant="outline" className="bg-black/50 border-primary text-primary font-pixel text-xs px-4 py-2">
              SECTOR {state.currentLevel}
            </Badge>
            {isShop && <Badge className="bg-green-900 border-green-500 text-green-100">SHOP SECTOR</Badge>}
            {isBoss && <Badge className="bg-yellow-900 border-yellow-500 text-yellow-100">BOSS SECTOR</Badge>}
          </div>
        </div>
      )}
    </>
  );
};
