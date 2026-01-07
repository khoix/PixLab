import React, { useState } from 'react';
import { decodeGameState } from '../lib/game/codec';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { RARITY_COLORS } from '../lib/game/constants';

export default function Decode() {
  const [codeInput, setCodeInput] = useState('');
  const [decodedState, setDecodedState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const handleDecode = () => {
    if (!codeInput.trim()) {
      setError('Please enter a code');
      setDecodedState(null);
      return;
    }

    try {
      const result = decodeGameState(codeInput.trim());
      if (result) {
        setDecodedState(result);
        setError(null);
      } else {
        setError('Failed to decode code. Invalid or corrupted code.');
        setDecodedState(null);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while decoding');
      setDecodedState(null);
    }
  };

  const handleClear = () => {
    setCodeInput('');
    setDecodedState(null);
    setError(null);
    setShowJson(false);
  };

  const getRarityColor = (rarity: string) => {
    return RARITY_COLORS[rarity as keyof typeof RARITY_COLORS] || '#9e9e9e';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-purple-950 via-black to-cyan-950 p-4">
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

      <div className="relative z-10 w-full max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-pixel text-primary drop-shadow-[0_0_10px_rgba(0,255,245,0.8)]">
            CODE DECODER
          </h1>
          <p className="text-muted-foreground font-mono text-sm tracking-widest">
            DECODE GAME STATE CODES
          </p>
        </div>

        <Card className="bg-black/80 border-white/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-mono text-primary">Enter Code</CardTitle>
            <CardDescription>Paste your game code below to decode</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input 
                placeholder="Paste code here..." 
                className="font-mono bg-black/50 border-white/20 text-white placeholder:text-white/30"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDecode();
                  }
                }}
              />
              <Button 
                onClick={handleDecode}
                className="font-pixel bg-primary text-black hover:bg-primary/80"
              >
                DECODE
              </Button>
              <Button 
                variant="outline" 
                onClick={handleClear}
                className="font-pixel border-white/20 hover:bg-white/10"
              >
                CLEAR
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 font-mono text-sm">
                ❌ {error}
              </div>
            )}
          </CardContent>
        </Card>

        {decodedState && (
          <div className="space-y-4">
            <Card className="bg-black/80 border-white/20 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-mono text-primary">Decoded State</CardTitle>
                <CardDescription>Game state information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Level & Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h3 className="font-mono text-sm text-muted-foreground">LEVEL</h3>
                    <p className="text-2xl font-pixel text-primary">{decodedState.currentLevel}</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-mono text-sm text-muted-foreground">STATS</h3>
                    <div className="space-y-1 text-sm font-mono">
                      <div>HP: <span className="text-primary">{decodedState.stats.hp}/{decodedState.stats.maxHp}</span></div>
                      <div>Coins: <span className="text-primary">{decodedState.stats.coins}</span></div>
                      <div>Damage: <span className="text-primary">{decodedState.stats.damage}</span></div>
                      <div>Speed: <span className="text-primary">{decodedState.stats.speed}</span></div>
                      <div>Vision: <span className="text-primary">{decodedState.stats.visionRadius}</span></div>
                    </div>
                  </div>
                </div>

                {/* Inventory */}
                {decodedState.inventory && decodedState.inventory.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-mono text-sm text-muted-foreground">
                      INVENTORY ({decodedState.inventory.length} items)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {decodedState.inventory.map((item: any, i: number) => (
                        <div 
                          key={i} 
                          className="p-3 bg-black/50 border border-white/10 rounded-lg space-y-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-primary">{item.name}</span>
                            <Badge 
                              style={{ 
                                backgroundColor: getRarityColor(item.rarity),
                                color: '#000',
                                border: 'none'
                              }}
                            >
                              {item.rarity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {item.type}
                            </Badge>
                          </div>
                          {item.stats && (
                            <div className="text-xs font-mono text-muted-foreground space-x-2">
                              {item.stats.damage && <span>DMG:{item.stats.damage}</span>}
                              {item.stats.defense && <span>DEF:{item.stats.defense}</span>}
                              {item.stats.speed && <span>SPD:{item.stats.speed}</span>}
                              {item.stats.vision && <span>VIS:{item.stats.vision}</span>}
                              {item.stats.heal && <span>HEAL:{item.stats.heal}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loadout */}
                {(decodedState.loadout?.weapon || decodedState.loadout?.armor || decodedState.loadout?.utility) && (
                  <div className="space-y-2">
                    <h3 className="font-mono text-sm text-muted-foreground">LOADOUT</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {decodedState.loadout.weapon && (
                        <div className="p-3 bg-black/50 border border-white/10 rounded-lg">
                          <div className="text-xs text-muted-foreground font-mono">WEAPON</div>
                          <div className="font-mono text-sm text-primary">{decodedState.loadout.weapon.name}</div>
                          <Badge 
                            style={{ 
                              backgroundColor: getRarityColor(decodedState.loadout.weapon.rarity),
                              color: '#000',
                              border: 'none',
                              marginTop: '4px'
                            }}
                            className="text-xs"
                          >
                            {decodedState.loadout.weapon.rarity.toUpperCase()}
                          </Badge>
                        </div>
                      )}
                      {decodedState.loadout.armor && (
                        <div className="p-3 bg-black/50 border border-white/10 rounded-lg">
                          <div className="text-xs text-muted-foreground font-mono">ARMOR</div>
                          <div className="font-mono text-sm text-primary">{decodedState.loadout.armor.name}</div>
                          <Badge 
                            style={{ 
                              backgroundColor: getRarityColor(decodedState.loadout.armor.rarity),
                              color: '#000',
                              border: 'none',
                              marginTop: '4px'
                            }}
                            className="text-xs"
                          >
                            {decodedState.loadout.armor.rarity.toUpperCase()}
                          </Badge>
                        </div>
                      )}
                      {decodedState.loadout.utility && (
                        <div className="p-3 bg-black/50 border border-white/10 rounded-lg">
                          <div className="text-xs text-muted-foreground font-mono">UTILITY</div>
                          <div className="font-mono text-sm text-primary">{decodedState.loadout.utility.name}</div>
                          <Badge 
                            style={{ 
                              backgroundColor: getRarityColor(decodedState.loadout.utility.rarity),
                              color: '#000',
                              border: 'none',
                              marginTop: '4px'
                            }}
                            className="text-xs"
                          >
                            {decodedState.loadout.utility.rarity.toUpperCase()}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Active Mods */}
                {decodedState.activeMods && decodedState.activeMods.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-mono text-sm text-muted-foreground">ACTIVE MODS</h3>
                    <div className="flex flex-wrap gap-2">
                      {decodedState.activeMods.map((mod: string, i: number) => (
                        <Badge key={i} variant="outline" className="font-mono">
                          {mod}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Boss Drops */}
                {decodedState.bossDrops && decodedState.bossDrops.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-mono text-sm text-muted-foreground">
                      BOSS DROPS ({decodedState.bossDrops.length} items)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {decodedState.bossDrops.map((item: any, i: number) => (
                        <div 
                          key={i} 
                          className="p-3 bg-black/50 border border-white/10 rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-primary">{item.name}</span>
                            <Badge 
                              style={{ 
                                backgroundColor: getRarityColor(item.rarity),
                                color: '#000',
                                border: 'none'
                              }}
                            >
                              {item.rarity.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Settings */}
                <div className="space-y-2">
                  <h3 className="font-mono text-sm text-muted-foreground">SETTINGS</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm font-mono">
                    <div>Music: {Math.round(decodedState.settings.musicVolume * 100)}%</div>
                    <div>SFX: {Math.round(decodedState.settings.sfxVolume * 100)}%</div>
                    <div>Joystick: {decodedState.settings.joystickPosition}</div>
                    <div>Control: {decodedState.settings.mobileControlType}</div>
                  </div>
                </div>

                {/* JSON Toggle */}
                <div className="pt-4 border-t border-white/10">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowJson(!showJson)}
                    className="font-mono text-xs border-white/20 hover:bg-white/10"
                  >
                    {showJson ? 'HIDE' : 'SHOW'} JSON
                  </Button>
                  {showJson && (
                    <pre className="mt-4 p-4 bg-black/50 border border-white/10 rounded-lg overflow-auto text-xs font-mono text-muted-foreground">
                      {JSON.stringify(decodedState, null, 2)}
                    </pre>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Back to Home */}
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => window.location.href = '/'}
            className="font-pixel border-white/20 hover:bg-white/10"
          >
            ← BACK TO HOME
          </Button>
        </div>
      </div>
    </div>
  );
}
