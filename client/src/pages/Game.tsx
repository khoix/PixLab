import React, { useState, useRef } from 'react';
import { useGame } from '../lib/store';
import { GameCanvas } from '../components/game/GameCanvas';
import { VirtualJoystick } from '../components/game/VirtualJoystick';
import { HUD } from '../components/game/HUD';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Slider } from '../components/ui/slider';
import { MODS } from '../lib/game/constants';
import { cn } from '../lib/utils';
import { useToast } from '../hooks/use-toast';
import { generateLevel } from '../lib/game/engine';

const SHOP_ITEMS = [
  { id: 'hp_boost', name: '+20 MAX HP', price: 50, stat: 'maxHp', value: 20 },
  { id: 'damage_boost', name: '+5 DAMAGE', price: 75, stat: 'damage', value: 5 },
  { id: 'speed_boost', name: '+0.5 SPEED', price: 60, stat: 'speed', value: 0.5 },
  { id: 'vision_boost', name: '+0.5 VISION', price: 40, stat: 'visionRadius', value: 0.5 },
];

export default function Game() {
  const { state, dispatch, resetGame } = useGame();
  const [inputDir, setInputDir] = useState({ x: 0, y: 0 });
  const [levelStartTime, setLevelStartTime] = useState(Date.now());
  const { toast } = useToast();

  const handleMove = (dir: { x: number; y: number }) => {
    setInputDir(dir);
  };

  // Keyboard support
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      let x = 0, y = 0;
      if (e.key === 'ArrowUp' || e.key === 'w') y = -1;
      if (e.key === 'ArrowDown' || e.key === 's') y = 1;
      if (e.key === 'ArrowLeft' || e.key === 'a') x = -1;
      if (e.key === 'ArrowRight' || e.key === 'd') x = 1;
      if (x !== 0 || y !== 0) {
        setInputDir({ x, y });
        e.preventDefault();
      }
    };
    const handleKeyUp = () => setInputDir({ x: 0, y: 0 });
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleGameOver = () => {
    toast({ title: "SYSTEM FAILURE", description: "HP critical. Aborting...", variant: "destructive" });
    dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
  };

  const handleTimeOut = () => {
    toast({ title: "SIGNAL LOST", description: "Time limit exceeded. Returning to base...", variant: "destructive" });
    // Lose some coins as penalty
    const penalty = Math.floor(state.stats.coins * 0.2);
    dispatch({ type: 'UPDATE_STATS', payload: { coins: Math.max(0, state.stats.coins - penalty) } });
    dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
  };

  const handleLevelComplete = () => {
    const level = generateLevel(state.currentLevel, 30, 30);
    
    if (level.isShop) {
      toast({ title: "SHOP SECTOR", description: "Welcome, operator. Browse our wares.", className: "bg-green-900 border-green-500 text-green-100" });
      dispatch({ type: 'SET_SCREEN', payload: 'shop' });
    } else if (level.isBoss) {
      toast({ title: "BOSS DEFEATED", description: "Securing legendary loot...", className: "bg-yellow-900 border-yellow-500 text-yellow-100" });
      const bossLoot = { id: `boss_drop_${state.currentLevel}`, name: `BOSS DROP LVL${state.currentLevel}`, type: 'weapon' as const, rarity: 'legendary' as const, price: 0, description: 'Powerful artifact' };
      dispatch({ type: 'ADD_BOSS_DROP', payload: bossLoot });
      dispatch({ type: 'NEXT_LEVEL' });
      dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
    } else {
      toast({ title: "SECTOR CLEARED", description: "Proceeding deeper...", className: "bg-green-900 border-green-500 text-green-100" });
      dispatch({ type: 'NEXT_LEVEL' });
      dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
    }
  };

  const currentLevel = generateLevel(state.currentLevel, 30, 30);

  if (state.screen === 'lobby') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 crt">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card/90 border-primary/20 pixel-corners h-full">
            <CardHeader>
              <CardTitle className="text-primary">STATS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 font-mono text-sm">
              <div className="flex justify-between">
                <span>HP</span>
                <span className="text-primary">{state.stats.hp}/{state.stats.maxHp}</span>
              </div>
              <div className="flex justify-between">
                <span>COINS</span>
                <span className="text-yellow-400">{state.stats.coins}</span>
              </div>
              <div className="flex justify-between">
                <span>DMG</span>
                <span className="text-destructive">{state.stats.damage}</span>
              </div>
              <div className="flex justify-between">
                <span>SPEED</span>
                <span className="text-blue-400">{state.stats.speed.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span>VISION</span>
                <span className="text-cyan-400">{state.stats.visionRadius.toFixed(1)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 bg-card/90 border-primary/20 pixel-corners flex flex-col h-full min-h-[500px]">
            <Tabs defaultValue="mission" className="w-full flex-1 flex flex-col">
              <TabsList className="w-full bg-black/40 rounded-none border-b border-white/10">
                <TabsTrigger value="mission" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">MISSION</TabsTrigger>
                <TabsTrigger value="loadout" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">INVENTORY</TabsTrigger>
                <TabsTrigger value="mods" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">MODS</TabsTrigger>
              </TabsList>

              <div className="p-6 flex-1 relative overflow-hidden">
                <TabsContent value="mission" className="h-full flex flex-col items-center justify-center space-y-8 animate-in fade-in zoom-in-95">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl text-white font-pixel">SECTOR {state.currentLevel}</h2>
                    <p className="text-muted-foreground font-mono text-xs">
                      {currentLevel.isBoss ? 'BOSS AWAITS' : currentLevel.isShop ? 'VENDOR STATION' : 'COMBAT ZONE'}
                    </p>
                  </div>
                  <Button 
                    size="lg" 
                    className="w-64 h-16 text-xl font-pixel bg-primary text-black hover:bg-primary/80 pixel-corners"
                    onClick={() => {
                      setLevelStartTime(Date.now());
                      dispatch({ type: 'SET_SCREEN', payload: 'run' });
                    }}
                  >
                    INITIATE
                  </Button>
                </TabsContent>

                <TabsContent value="loadout" className="space-y-4">
                  {state.bossDrops.length > 0 && (
                    <div className="border border-yellow-500/50 p-3 bg-yellow-500/5">
                      <h4 className="font-pixel text-xs text-yellow-400 mb-2">LEGENDARY ARTIFACTS</h4>
                      {state.bossDrops.map(drop => (
                        <div key={drop.id} className="text-xs text-muted-foreground font-mono">{drop.name}</div>
                      ))}
                    </div>
                  )}
                  {state.inventory.length === 0 && state.bossDrops.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground mt-8">INVENTORY EMPTY</p>
                  )}
                </TabsContent>

                <TabsContent value="mods" className="space-y-4 max-h-[300px] overflow-y-auto">
                  {MODS.map(mod => (
                    <div 
                      key={mod.id} 
                      className={cn(
                        "p-3 border cursor-pointer transition-colors hover:bg-primary/10",
                        state.activeMods.includes(mod.id) ? "border-primary bg-primary/5" : "border-white/10"
                      )}
                      onClick={() => {
                        const newMods = state.activeMods.includes(mod.id)
                          ? state.activeMods.filter(m => m !== mod.id)
                          : [...state.activeMods, mod.id];
                        dispatch({ type: 'SET_MODS', payload: newMods });
                      }}
                    >
                      <h4 className="font-pixel text-xs text-primary mb-1">{mod.name}</h4>
                      <p className="text-xs text-muted-foreground font-mono">{mod.description}</p>
                    </div>
                  ))}
                </TabsContent>
              </div>
            </Tabs>
          </Card>
        </div>
      </div>
    );
  }

  if (state.screen === 'shop') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 crt">
        <Card className="bg-card/90 border-primary/20 pixel-corners w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-primary">VENDOR STATION LVL{state.currentLevel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-mono text-muted-foreground">CREDITS: <span className="text-yellow-400">{state.stats.coins}</span></p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SHOP_ITEMS.map(item => (
                <button
                  key={item.id}
                  className="p-4 border border-primary/30 hover:bg-primary/10 transition-colors text-left"
                  onClick={() => {
                    if (state.stats.coins >= item.price) {
                      dispatch({ type: 'UPDATE_STATS', payload: { 
                        coins: state.stats.coins - item.price,
                        [item.stat]: state.stats[item.stat as keyof typeof state.stats] + item.value
                      }});
                      toast({ title: "PURCHASED", description: item.name });
                    } else {
                      toast({ title: "INSUFFICIENT CREDITS", variant: "destructive" });
                    }
                  }}
                >
                  <h4 className="font-pixel text-sm text-primary mb-1">{item.name}</h4>
                  <p className="text-xs text-yellow-400 font-mono">${item.price}</p>
                </button>
              ))}
            </div>
            <Button 
              className="w-full mt-6 bg-secondary text-black hover:bg-secondary/80 font-pixel"
              onClick={() => {
                dispatch({ type: 'NEXT_LEVEL' });
                dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
              }}
            >
              LEAVE STATION
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.screen === 'run') {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-black touch-none">
        <HUD levelStartTime={levelStartTime} isShop={currentLevel.isShop} isBoss={currentLevel.isBoss} />
        <GameCanvas 
          inputDirection={inputDir} 
          onGameOver={handleGameOver}
          onLevelComplete={handleLevelComplete}
          onTimeOut={handleTimeOut}
        />
        <VirtualJoystick onMove={handleMove} />
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
        <Button 
          variant="ghost" 
          className="absolute top-4 right-4 z-50 text-white hover:bg-red-900/50 font-pixel text-xs"
          onClick={() => {
            dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
          }}
        >
          EXIT RUN
        </Button>
      </div>
    );
  }

  return null;
}
