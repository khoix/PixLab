import React from 'react';
import { useGame } from '../lib/store';
import { useLocation } from '../lib/router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useToast } from '../hooks/use-toast';
import pixlabImage from '../assets/pixlab3.PNG';

export default function Home() {
  const { dispatch, resetGame, loadFromCode } = useGame();
  const [, setLocation] = useLocation();
  const [codeInput, setCodeInput] = React.useState('');
  const { toast } = useToast();

  const handleStart = () => {
    // If no code is inputted, start a new game from Sector 1
    if (codeInput.length === 0) {
      // resetGame now clears mods and boss drops automatically
      resetGame();
    }
    dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
    setLocation('/play');
  };

  const handleLoad = () => {
    if (codeInput.length > 0) {
      const success = loadFromCode(codeInput);
      if (success) {
        toast({ 
          title: "GAME LOADED", 
          description: "State restored from code", 
          className: "bg-green-900 border-green-500 text-green-100" 
        });
        dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
        setLocation('/play');
      } else {
        toast({ 
          title: "INVALID CODE", 
          description: "Could not decode game state", 
          className: "bg-red-900 border-red-500 text-red-100" 
        });
      }
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
        <div className="text-center space-y-4 relative py-8 px-4 home-title-container">
            <div 
              className="absolute inset-0 flex items-center justify-center md:opacity-70 opacity-40 -z-10 home-title-bg"
              style={{
                backgroundImage: `url(${pixlabImage})`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                width: '200px',
                height: '200px',
              }}
            />
            <h1 className="text-4xl md:text-6xl font-pixel text-primary drop-shadow-[0_0_10px_rgba(0,255,245,0.8)] leading-tight relative z-10 home-title">
                PIXEL<br/><span className="text-secondary" style={{ textShadow: '2px 2px 4px rgba(0, 0, 0, 1), 0 0 8px rgba(0, 0, 0, 0.8)' }}>LABYRINTH</span>
            </h1>
            <p className="text-muted-foreground font-mono text-lg tracking-widest relative z-10">ROGUE PROTOCOL // V.1.0</p>
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
                    placeholder="ENTER CODE" 
                    className="font-mono bg-black/50 border-white/20 text-white placeholder:text-white/30"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                />
                <Button variant="outline" className="font-pixel text-xs border-white/20 hover:bg-white/10" onClick={handleLoad}>
                    LOAD
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
}
