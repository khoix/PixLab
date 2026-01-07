import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MobSubtype, Position, Item } from '@/lib/game/types';
import { MOB_TYPES } from '@/lib/game/constants';
import { getAllItemOptions, ItemOption } from '@/lib/game/demoSpawn';

interface DemoSidebarProps {
  onSpawnMob: (mobType: MobSubtype, pos: Position | null) => void;
  onSpawnBoss: (bossType: 'boss_zeus' | 'boss_hades' | 'boss_ares', pos: Position | null) => void;
  onSpawnItem: (templateName: string, rarity: Item['rarity'], pos: Position | null) => void;
  onSpawnPortal: (pos: Position | null) => void;
  onSpawnLightswitch: (pos: Position | null) => void;
  onClearAll: () => void;
  spotlightEnabled: boolean;
  onToggleSpotlight: (enabled: boolean) => void;
  playerPos: Position | null;
}

const REGULAR_MOBS: MobSubtype[] = [
  'drone', 'sniper', 'phase', 'charger', 'turret', 
  'swarm', 'guardian', 'moth', 'tracker', 'cerberus'
];

const BOSS_TYPES: Array<'boss_zeus' | 'boss_hades' | 'boss_ares'> = [
  'boss_zeus', 'boss_hades', 'boss_ares'
];

export const DemoSidebar: React.FC<DemoSidebarProps> = ({
  onSpawnMob,
  onSpawnBoss,
  onSpawnItem,
  onSpawnPortal,
  onSpawnLightswitch,
  onClearAll,
  spotlightEnabled,
  onToggleSpotlight,
  playerPos
}) => {
  const [selectedMob, setSelectedMob] = useState<MobSubtype | ''>('');
  const [selectedBoss, setSelectedBoss] = useState<'boss_zeus' | 'boss_hades' | 'boss_ares' | ''>('');
  const [selectedItem, setSelectedItem] = useState<string>('');
  
  // Get all item options
  const itemOptions = useMemo(() => getAllItemOptions(), []);
  
  // Always spawn at player position
  const getSpawnPos = (): Position | null => {
    return playerPos;
  };
  
  return (
    <div className="fixed right-0 top-0 h-full w-80 max-w-[90vw] bg-black/90 border-l border-primary/50 overflow-y-auto z-50">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-pixel text-primary">Demo Sandbox</h2>
          <Button variant="destructive" size="sm" onClick={onClearAll}>
            Clear All
          </Button>
        </div>
        
        {/* Regular Mobs Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-pixel">Regular Mobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedMob} onValueChange={(v) => setSelectedMob(v as MobSubtype)}>
              <SelectTrigger>
                <SelectValue placeholder="Select mob..." />
              </SelectTrigger>
              <SelectContent>
                {REGULAR_MOBS.map((mobType) => {
                  const mobDef = MOB_TYPES.find(m => m.subtype === mobType);
                  return (
                    <SelectItem key={mobType} value={mobType}>
                      {mobDef?.name || mobType}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                if (selectedMob) {
                  onSpawnMob(selectedMob, getSpawnPos());
                  setSelectedMob('');
                }
              }}
              disabled={!selectedMob}
            >
              Spawn Mob
            </Button>
          </CardContent>
        </Card>
        
        {/* Bosses Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-pixel">Bosses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedBoss} onValueChange={(v) => setSelectedBoss(v as typeof selectedBoss)}>
              <SelectTrigger>
                <SelectValue placeholder="Select boss..." />
              </SelectTrigger>
              <SelectContent>
                {BOSS_TYPES.map((bossType) => {
                  const bossNames = {
                    boss_zeus: 'Zeus Mainframe',
                    boss_hades: 'Hades Core',
                    boss_ares: 'Ares Protocol'
                  };
                  return (
                    <SelectItem key={bossType} value={bossType}>
                      {bossNames[bossType]}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                if (selectedBoss) {
                  onSpawnBoss(selectedBoss, getSpawnPos());
                  setSelectedBoss('');
                }
              }}
              disabled={!selectedBoss}
            >
              Spawn Boss
            </Button>
          </CardContent>
        </Card>
        
        {/* Items Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-pixel">Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedItem} onValueChange={setSelectedItem}>
              <SelectTrigger>
                <SelectValue placeholder="Select item..." />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                {itemOptions.map((option, index) => (
                  <SelectItem 
                    key={`${option.templateName}-${option.rarity}-${index}`} 
                    value={`${option.templateName}|${option.rarity}${option.scrollType ? `|${option.scrollType}` : ''}`}
                  >
                    {option.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                if (selectedItem) {
                  const parts = selectedItem.split('|');
                  const templateName = parts[0];
                  const rarity = parts[1] as Item['rarity'];
                  const scrollType = parts[2]; // Optional scroll type
                  onSpawnItem(templateName, rarity, getSpawnPos(), scrollType);
                  setSelectedItem('');
                }
              }}
              disabled={!selectedItem}
            >
              Spawn Item
            </Button>
          </CardContent>
        </Card>
        
        {/* Maze Features Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-pixel">Maze Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="spotlight-toggle" className="text-sm text-muted-foreground">
                Spotlight
              </label>
              <input
                type="checkbox"
                id="spotlight-toggle"
                checked={spotlightEnabled}
                onChange={(e) => onToggleSpotlight(e.target.checked)}
                className="w-4 h-4"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onSpawnPortal(getSpawnPos())}
            >
              Spawn Portal
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onSpawnLightswitch(getSpawnPos())}
            >
              Spawn Lightswitch
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

