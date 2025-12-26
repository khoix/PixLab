import React, { useState } from 'react';
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

export default function Game() {
  const { state, dispatch } = useGame();
  const [inputDir, setInputDir] = useState({ x: 0, y: 0 });
  const { toast } = useToast();

  const handleMove = (dir: { x: number; y: number }) => {
    setInputDir(dir);
  };

  // Keyboard support
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        let x = inputDir.x;
        let y = inputDir.y;
        if (e.key === 'ArrowUp' || e.key === 'w') y = -1;
        if (e.key === 'ArrowDown' || e.key === 's') y = 1;
        if (e.key === 'ArrowLeft' || e.key === 'a') x = -1;
        if (e.key === 'ArrowRight' || e.key === 'd') x = 1;
        setInputDir({ x, y });
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        // Reset only if the released key was the current direction
        // Simple implementation: stop on any key up for now (improve later)
        setInputDir({ x: 0, y: 0 });
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []); // Note: dependency on inputDir might cause re-bind, keep empty for simple logic or use refs

  if (state.screen === 'lobby') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 crt">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Stats Column */}
          <Card className="bg-card/90 border-primary/20 pixel-corners h-full">
            <CardHeader>
              <CardTitle className="text-primary">OPERATOR STATS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 font-mono text-sm">
               <div className="flex justify-between">
                 <span>HP INTEGRITY</span>
                 <span className="text-primary">{state.stats.hp}/{state.stats.maxHp}</span>
               </div>
               <div className="flex justify-between">
                 <span>CREDITS</span>
                 <span className="text-yellow-400">{state.stats.coins}</span>
               </div>
               <div className="flex justify-between">
                 <span>DMG OUTPUT</span>
                 <span className="text-destructive">{state.stats.damage}</span>
               </div>
               <div className="flex justify-between">
                 <span>SPEED</span>
                 <span className="text-blue-400">{state.stats.speed * 100}%</span>
               </div>
            </CardContent>
          </Card>

          {/* Main Action Column */}
          <Card className="md:col-span-2 bg-card/90 border-primary/20 pixel-corners flex flex-col h-full min-h-[500px]">
             <Tabs defaultValue="mission" className="w-full flex-1 flex flex-col">
                <TabsList className="w-full bg-black/40 rounded-none border-b border-white/10">
                   <TabsTrigger value="mission" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">MISSION</TabsTrigger>
                   <TabsTrigger value="loadout" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">LOADOUT</TabsTrigger>
                   <TabsTrigger value="mods" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">MODS</TabsTrigger>
                   <TabsTrigger value="system" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">SYSTEM</TabsTrigger>
                </TabsList>
                
                <div className="p-6 flex-1 relative overflow-hidden">
                    <TabsContent value="mission" className="h-full flex flex-col items-center justify-center space-y-8 animate-in fade-in zoom-in-95">
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl text-white font-pixel">SECTOR: {state.currentLevel}</h2>
                            <p className="text-muted-foreground font-mono">OBJECTIVE: LOCATE EXIT BEFORE SIGNAL LOSS</p>
                        </div>

                        <Button 
                          size="lg" 
                          className="w-64 h-16 text-xl font-pixel bg-primary text-black hover:bg-primary/80 pixel-corners animate-pulse"
                          onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'run' })}
                        >
                            INITIATE RUN
                        </Button>
                    </TabsContent>

                    <TabsContent value="loadout" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="aspect-square border border-dashed border-white/20 flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">PRIMARY WEAPON</span>
                            </div>
                             <div className="aspect-square border border-dashed border-white/20 flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">ARMOR</span>
                            </div>
                        </div>
                        <p className="text-center text-xs text-muted-foreground mt-4">INVENTORY EMPTY</p>
                    </TabsContent>

                    <TabsContent value="mods" className="space-y-4">
                        <div className="grid gap-3">
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
                        </div>
                    </TabsContent>

                     <TabsContent value="system" className="space-y-6">
                        <div className="space-y-2">
                             <label className="text-xs font-pixel">MUSIC VOLUME</label>
                             <Slider defaultValue={[50]} max={100} step={1} />
                        </div>
                         <div className="space-y-2">
                             <label className="text-xs font-pixel">SFX VOLUME</label>
                             <Slider defaultValue={[50]} max={100} step={1} />
                        </div>
                    </TabsContent>
                </div>
             </Tabs>
          </Card>
        </div>
      </div>
    );
  }

  if (state.screen === 'run') {
      return (
          <div className="relative w-full h-screen overflow-hidden bg-black touch-none">
              <HUD />
              <GameCanvas 
                  inputDirection={inputDir} 
                  onGameOver={() => {
                      toast({ title: "SIGNAL LOST", description: "Returning to base...", variant: "destructive" });
                      dispatch({ type: 'SET_SCREEN', payload: 'lobby' }); // Should go to Game Over screen really
                  }}
                  onLevelComplete={() => {
                      toast({ title: "SECTOR CLEARED", description: "Proceeding deeper...", className: "bg-green-900 border-green-500 text-green-100" });
                      dispatch({ type: 'NEXT_LEVEL' });
                  }}
              />
              <VirtualJoystick onMove={handleMove} />
              
              {/* Top gradient overlay for HUD visibility */}
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
              
              {/* Optional: Action Buttons for Mobile */}
              <div className="absolute bottom-10 right-10 flex gap-4 pointer-events-auto">
                  <Button 
                    variant="outline" 
                    className="w-20 h-20 rounded-full bg-black/40 border-primary/50 text-primary active:bg-primary active:text-black font-bold text-xl touch-none"
                    onClick={() => console.log('Attack')}
                  >
                      A
                  </Button>
              </div>
          </div>
      );
  }

  return null;
}
