import React from 'react';
import { useGame } from '../lib/store';
import { useLocation } from 'wouter';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export default function Home() {
  const { state, dispatch } = useGame();
  const [, setLocation] = useLocation();
  const [uidInput, setUidInput] = React.useState('');

  const handleStart = () => {
    dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
    setLocation('/play');
  };

  const handleLoad = () => {
    if (uidInput.length > 0) {
        dispatch({ type: 'SET_UID', payload: uidInput });
        handleStart();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-purple-950 via-black to-cyan-950">
      {/* Animated background grid */}
      <div 
        className="absolute inset-0 z-0 opacity-20" 
        style={{ 
            backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 255, 245, 0.05) 25%, rgba(0, 255, 245, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 255, 245, 0.05) 75%, rgba(0, 255, 245, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 255, 245, 0.05) 25%, rgba(0, 255, 245, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 255, 245, 0.05) 75%, rgba(0, 255, 245, 0.05) 76%, transparent 77%, transparent)',
            backgroundSize: '50px 50px',
        }}
      />
      <div className="absolute inset-0 bg-black/40 z-0" />
      <div className="crt absolute inset-0 pointer-events-none z-50" />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-md w-full p-6 animate-in fade-in zoom-in duration-1000">
        <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-6xl font-pixel text-primary drop-shadow-[0_0_10px_rgba(0,255,245,0.8)] leading-tight">
                NEON<br/><span className="text-secondary">OLYMPUS</span>
            </h1>
            <p className="text-muted-foreground font-mono text-lg tracking-widest">ROGUE PROTOCOL // V.1.0</p>
        </div>

        <div className="w-full space-y-4 mt-8">
            <Button 
                className="w-full h-14 text-xl font-pixel bg-primary text-black hover:bg-primary/80 pixel-corners shadow-[0_0_20px_rgba(0,255,245,0.4)] transition-all hover:scale-105"
                onClick={handleStart}
            >
                START RUN
            </Button>
            
            <div className="flex gap-2">
                <Input 
                    placeholder="ENTER OPERATOR ID" 
                    className="font-mono bg-black/50 border-white/20 text-white placeholder:text-white/30"
                    value={uidInput}
                    onChange={(e) => setUidInput(e.target.value)}
                />
                <Button variant="outline" className="font-pixel text-xs border-white/20 hover:bg-white/10" onClick={handleLoad}>
                    LOAD
                </Button>
            </div>
        </div>

        <div className="mt-8 p-4 border border-dashed border-white/10 bg-black/40 rounded w-full">
            <p className="text-xs text-center text-muted-foreground font-mono">
                OPERATOR ID: <span className="text-primary select-all">{state.uid.slice(0, 8)}...</span>
            </p>
        </div>
      </div>
    </div>
  );
}
