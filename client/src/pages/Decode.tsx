import React, { useState } from 'react';
import { decodeGameState } from '../lib/game/codec';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { RARITY_COLORS } from '../lib/game/constants';
import { useToast } from '../hooks/use-toast';

export default function Decode() {
  const [codeInput, setCodeInput] = useState('');
  const [decodedState, setDecodedState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const { toast } = useToast();

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

  const handleCopyJson = async () => {
    if (!decodedState) return;
    
    try {
      const jsonString = JSON.stringify(decodedState, null, 2);
      await navigator.clipboard.writeText(jsonString);
      toast({
        title: 'Copied!',
        description: 'JSON copied to clipboard',
        className: 'bg-green-900 border-green-500 text-green-100',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to copy JSON to clipboard',
        className: 'bg-red-900 border-red-500 text-red-100',
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start relative overflow-hidden bg-gradient-to-br from-purple-950 via-black to-cyan-950 p-3 py-6">
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

      <div className="relative z-10 w-full max-w-5xl space-y-3">
        <div className="text-center space-y-1">
          <h1 className="text-6xl md:text-7xl font-pixel text-primary drop-shadow-[0_0_10px_rgba(0,255,245,0.8)]">
            CODE DECODER
          </h1>
          <p className="text-muted-foreground font-mono text-lg tracking-widest">
            DECODE GAME STATE CODES
          </p>
        </div>

        <Card className="bg-black/80 border-white/20 backdrop-blur-sm">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="font-mono text-primary text-xl">Enter Code</CardTitle>
            <CardDescription className="text-lg">Paste your game code below to decode</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex gap-2">
              <Input 
                placeholder="Paste code here..." 
                className="font-mono bg-black/50 border-white/20 text-white placeholder:text-white/30 text-lg md:text-lg h-12"
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
                className="font-pixel bg-primary text-black hover:bg-primary/80 text-lg px-6 h-12"
              >
                DECODE
              </Button>
              <Button 
                variant="outline" 
                onClick={handleClear}
                className="font-pixel border-white/20 hover:bg-white/10 text-lg px-6 h-12"
              >
                CLEAR
              </Button>
            </div>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 font-mono text-lg">
                ❌ {error}
              </div>
            )}
          </CardContent>
        </Card>

        {decodedState && (
          <div className="space-y-3">
            <Card className="bg-black/80 border-white/20 backdrop-blur-sm">
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="font-mono text-primary text-xl">Decoded State</CardTitle>
                    <CardDescription className="text-lg">Game state information</CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="bg-primary text-black inline-block px-3 py-1 rounded text-center">
                      <div className="font-mono text-sm">SECTOR</div>
                      <div className="text-2xl font-pixel">{decodedState.currentLevel}</div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                {/* Stats Row */}
                <div className="p-2.5 bg-black/50 border border-white/10 rounded-lg">
                  <h3 className="font-mono text-base text-muted-foreground mb-1">STATS</h3>
                  <div className="grid grid-cols-5 gap-x-4 text-2xl font-mono">
                    <div>HP: <span className="text-primary">{decodedState.stats.hp}/{decodedState.stats.maxHp}</span></div>
                    <div>Coins: <span className="text-primary">{decodedState.stats.coins}</span></div>
                    <div>DMG: <span className="text-primary">{decodedState.stats.damage}</span></div>
                    <div>SPD: <span className="text-primary">{decodedState.stats.speed}</span></div>
                    <div>VIS: <span className="text-primary">{decodedState.stats.visionRadius}</span></div>
                  </div>
                </div>

                {/* Settings Row */}
                <div className="p-2.5 bg-black/50 border border-white/10 rounded-lg">
                  <h3 className="font-mono text-base text-muted-foreground mb-1">SETTINGS</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-base font-mono">
                    <div>Music: {Math.round(decodedState.settings.musicVolume * 100)}%</div>
                    <div>SFX: {Math.round(decodedState.settings.sfxVolume * 100)}%</div>
                    <div>Joystick: {decodedState.settings.joystickPosition}</div>
                    <div>Control: {decodedState.settings.mobileControlType}</div>
                  </div>
                </div>

                {/* Equipped and Inventory in 2 columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Equipped Section */}
                  {(decodedState.loadout?.weapon || decodedState.loadout?.armor || decodedState.loadout?.utility || (decodedState.activeMods && decodedState.activeMods.length > 0)) && (
                    <div className="space-y-2">
                      <h3 className="font-mono text-lg text-muted-foreground">EQUIPPED</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {decodedState.loadout?.weapon && (
                          <div className="p-2.5 bg-black/50 border border-white/10 rounded-lg">
                            <div className="text-sm text-muted-foreground font-mono mb-1">WEAPON</div>
                            <div className="font-mono text-base text-primary mb-1">{decodedState.loadout.weapon.name}</div>
                            <Badge 
                              style={{ 
                                backgroundColor: getRarityColor(decodedState.loadout.weapon.rarity),
                                color: '#000',
                                border: 'none'
                              }}
                              className="text-sm"
                            >
                              {decodedState.loadout.weapon.rarity.toUpperCase()}
                            </Badge>
                          </div>
                        )}
                        {decodedState.loadout?.armor && (
                          <div className="p-2.5 bg-black/50 border border-white/10 rounded-lg">
                            <div className="text-sm text-muted-foreground font-mono mb-1">ARMOR</div>
                            <div className="font-mono text-base text-primary mb-1">{decodedState.loadout.armor.name}</div>
                            <Badge 
                              style={{ 
                                backgroundColor: getRarityColor(decodedState.loadout.armor.rarity),
                                color: '#000',
                                border: 'none'
                              }}
                              className="text-sm"
                            >
                              {decodedState.loadout.armor.rarity.toUpperCase()}
                            </Badge>
                          </div>
                        )}
                        {decodedState.loadout?.utility && (
                          <div className="p-2.5 bg-black/50 border border-white/10 rounded-lg">
                            <div className="text-sm text-muted-foreground font-mono mb-1">UTILITY</div>
                            <div className="font-mono text-base text-primary mb-1">{decodedState.loadout.utility.name}</div>
                            <Badge 
                              style={{ 
                                backgroundColor: getRarityColor(decodedState.loadout.utility.rarity),
                                color: '#000',
                                border: 'none'
                              }}
                              className="text-sm"
                            >
                              {decodedState.loadout.utility.rarity.toUpperCase()}
                            </Badge>
                          </div>
                        )}
                        {decodedState.activeMods && decodedState.activeMods.length > 0 && (
                          <div className="p-2.5 bg-black/50 border border-white/10 rounded-lg">
                            <div className="text-sm text-muted-foreground font-mono mb-1">ACTIVE MODS</div>
                            <div className="flex flex-wrap gap-1">
                              {decodedState.activeMods.map((mod: string, i: number) => (
                                <Badge key={i} variant="outline" className="font-mono text-xs">
                                  {mod}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Inventory */}
                  {decodedState.inventory && decodedState.inventory.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-mono text-lg text-muted-foreground">
                        INVENTORY ({decodedState.inventory.length} items)
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {decodedState.inventory.map((item: any, i: number) => (
                          <div 
                            key={i} 
                            className="p-2 bg-black/50 border border-white/10 rounded-lg space-y-1"
                          >
                            <div className="font-mono text-base text-primary">{item.name}</div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge 
                                style={{ 
                                  backgroundColor: getRarityColor(item.rarity),
                                  color: '#000',
                                  border: 'none'
                                }}
                                className="text-sm"
                              >
                                {item.rarity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {item.type}
                              </Badge>
                            </div>
                            {item.stats && (
                              <div className="text-xs font-mono text-muted-foreground">
                                {item.stats.damage && <span className="mr-1.5">DMG:{item.stats.damage}</span>}
                                {item.stats.defense && <span className="mr-1.5">DEF:{item.stats.defense}</span>}
                                {item.stats.speed && <span className="mr-1.5">SPD:{item.stats.speed}</span>}
                                {item.stats.vision && <span className="mr-1.5">VIS:{item.stats.vision}</span>}
                                {item.stats.heal && <span className="mr-1.5">HEAL:{item.stats.heal}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Boss Drops */}
                {decodedState.bossDrops && decodedState.bossDrops.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-mono text-lg text-muted-foreground">
                      BOSS DROPS ({decodedState.bossDrops.length} items)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {decodedState.bossDrops.map((item: any, i: number) => (
                        <div 
                          key={i} 
                          className="p-2 bg-black/50 border border-white/10 rounded-lg min-w-0 flex-shrink-0 space-y-1"
                        >
                          <div className="font-mono text-base text-primary whitespace-nowrap">{item.name}</div>
                          <div className="flex items-center gap-1.5">
                            <Badge 
                              style={{ 
                                backgroundColor: getRarityColor(item.rarity),
                                color: '#000',
                                border: 'none'
                              }}
                              className="text-sm"
                            >
                              {item.rarity.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* JSON Toggle */}
                <div className="pt-3 border-t border-white/10">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowJson(!showJson)}
                      className="font-mono text-base border-white/20 hover:bg-white/10 h-10"
                    >
                      {showJson ? 'HIDE' : 'SHOW'} JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyJson}
                      className="font-mono text-base border-white/20 hover:bg-white/10 h-10"
                    >
                      COPY JSON
                    </Button>
                  </div>
                  {showJson && (
                    <pre className="mt-3 p-3 bg-black/50 border border-white/10 rounded-lg overflow-auto text-base font-mono text-muted-foreground">
                      {JSON.stringify(decodedState, null, 2)}
                    </pre>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Back to Home */}
        <div className="text-center pt-2">
          <Button
            variant="outline"
            onClick={() => window.location.href = '/'}
            className="font-pixel border-white/20 hover:bg-white/10 text-lg h-12 px-6"
          >
            ← BACK TO HOME
          </Button>
        </div>
      </div>
    </div>
  );
}
