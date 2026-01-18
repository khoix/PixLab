import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GameCanvas } from '@/components/game/GameCanvas';
import { DemoSidebar } from '@/components/demo/DemoSidebar';
import { VirtualJoystick } from '@/components/game/VirtualJoystick';
import { TouchpadControl } from '@/components/game/TouchpadControl';
import { DirectionalPadControl } from '@/components/game/DirectionalPadControl';
import { useGame } from '@/lib/store';
import { Level, Position, MobSubtype, Item } from '@/lib/game/types';
import { 
  spawnMobEntity, 
  spawnBossEntity, 
  spawnSpecificItemAtPosition, 
  spawnPortalAtPosition,
  spawnLightswitchAtPosition,
  findValidSpawnPosition 
} from '@/lib/game/demoSpawn';
import { useIsMobile } from '@/hooks/use-mobile';
import { LogViewer } from '@/components/demo/LogViewer';

export default function Demo() {
  const { state, dispatch } = useGame();
  const [inputDirection, setInputDirection] = useState({ x: 0, y: 0 });
  const [playerPos, setPlayerPos] = useState<Position | null>(null);
  const [spotlightEnabled, setSpotlightEnabled] = useState(true);
  const levelRef = useRef<React.MutableRefObject<Level | null> | null>(null);
  const isMobile = useIsMobile();
  
  
  const handleLevelRefReady = useCallback((ref: React.MutableRefObject<Level | null>) => {
    levelRef.current = ref;
    if (ref.current) {
      setPlayerPos(ref.current.startPos);
    }
  }, []);
  
  const handlePlayerPosUpdate = useCallback((pos: Position) => {
    setPlayerPos(pos);
  }, []);
  
  const handleSpawnMob = useCallback((mobType: MobSubtype, pos: Position | null) => {
    if (!levelRef.current?.current || !pos) return;
    
    const level = levelRef.current.current;
    const entity = spawnMobEntity(
      level,
      mobType,
      pos,
      1, // levelNum
      state.stats,
      state.loadout
    );
    
    if (entity) {
      level.entities.push(entity);
      levelRef.current.current = level;
    }
  }, [state.stats, state.loadout]);
  
  const handleSpawnBoss = useCallback((bossType: 'boss_zeus' | 'boss_hades' | 'boss_ares', pos: Position | null) => {
    if (!levelRef.current?.current || !pos) return;
    
    const level = levelRef.current.current;
    const entity = spawnBossEntity(
      level,
      bossType,
      pos,
      8, // levelNum for bosses
      state.stats,
      state.loadout
    );
    
    if (entity) {
      level.entities.push(entity);
      levelRef.current.current = level;
    }
  }, [state.stats, state.loadout]);
  
  const handleSpawnItem = useCallback((templateName: string, rarity: Item['rarity'], pos: Position | null, scrollType?: string) => {
    if (!levelRef.current?.current || !pos) return;
    
    const level = levelRef.current.current;
    const itemData = spawnSpecificItemAtPosition(level, templateName, rarity, pos, 1, scrollType as any);
    
    if (itemData) {
      level.items.push(itemData);
      levelRef.current.current = level;
    }
  }, []);
  
  const handleSpawnPortal = useCallback((pos: Position | null) => {
    if (!levelRef.current?.current || !pos) return;
    
    const level = levelRef.current.current;
    const portal = spawnPortalAtPosition(level, pos);
    
    if (portal) {
      if (!level.portals) {
        level.portals = [];
      }
      level.portals.push(portal);
      levelRef.current.current = level;
    }
  }, []);
  
  const handleSpawnLightswitch = useCallback((pos: Position | null) => {
    if (!levelRef.current?.current || !pos) return;
    
    const level = levelRef.current.current;
    const lightswitch = spawnLightswitchAtPosition(level, pos);
    
    if (lightswitch) {
      if (!level.lightswitches) {
        level.lightswitches = [];
      }
      level.lightswitches.push(lightswitch);
      levelRef.current.current = level;
    }
  }, []);
  
  const handleClearAll = useCallback(() => {
    if (!levelRef.current?.current) return;
    
    const level = levelRef.current.current;
    level.entities = [];
    level.items = [];
    level.projectiles = [];
    level.afterimages = [];
    level.particles = [];
    level.portals = [];
    level.lightswitches = [];
    levelRef.current.current = level;
  }, []);
  
  // Handle movement input
  const handleMove = useCallback((dir: { x: number; y: number }) => {
    setInputDirection(dir);
  }, []);
  
  // Handle keyboard input for desktop
  useEffect(() => {
    if (isMobile) return;
    
    // Track which keys are currently pressed
    const pressedKeys = new Set<string>();
    
    const updateDirection = () => {
      let newDir = { x: 0, y: 0 };
      
      // Check all currently pressed keys
      if (pressedKeys.has('w') || pressedKeys.has('arrowup')) newDir.y = -1;
      if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) newDir.y = 1;
      if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) newDir.x = -1;
      if (pressedKeys.has('d') || pressedKeys.has('arrowright')) newDir.x = 1;
      
      setInputDirection(newDir);
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      
      // Only process movement keys
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' ||
          key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
        // Prevent default behavior for movement keys
        e.preventDefault();
        pressedKeys.add(key);
        updateDirection();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      
      // Only process movement keys
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' ||
          key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
        pressedKeys.delete(key);
        updateDirection();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      pressedKeys.clear();
    };
  }, [isMobile]);
  
  // Dummy handlers for GameCanvas
  const handleGameOver = useCallback(() => {
    // In demo mode, we might want to just reset or do nothing
  }, []);
  
  const handleLevelComplete = useCallback(() => {
    // In demo mode, do nothing
  }, []);
  
  const handleTimeOut = useCallback(() => {
    // In demo mode, do nothing
  }, []);
  
  // Ensure screen is set to 'run' for demo
  useEffect(() => {
    if (state.screen !== 'run') {
      dispatch({ type: 'SET_SCREEN', payload: 'run' });
    }
  }, [state.screen, dispatch]);
  
  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <GameCanvas
        inputDirection={inputDirection}
        onGameOver={handleGameOver}
        onLevelComplete={handleLevelComplete}
        onTimeOut={handleTimeOut}
        gameOverState={null}
        demoMode={true}
        onLevelRefReady={handleLevelRefReady}
        onPlayerPosUpdate={handlePlayerPosUpdate}
        spotlightEnabled={spotlightEnabled}
      />
      
      {!isMobile && (
        <DemoSidebar
          onSpawnMob={handleSpawnMob}
          onSpawnBoss={handleSpawnBoss}
          onSpawnItem={handleSpawnItem}
          onSpawnPortal={handleSpawnPortal}
          onSpawnLightswitch={handleSpawnLightswitch}
          onClearAll={handleClearAll}
          spotlightEnabled={spotlightEnabled}
          onToggleSpotlight={setSpotlightEnabled}
          playerPos={playerPos}
        />
      )}
      
      {isMobile && (
        <>
          {(() => {
            const controlType = state.settings.mobileControlType || 'dpad';
            if (controlType === 'touchpad') {
              return <TouchpadControl onMove={handleMove} />;
            } else if (controlType === 'dpad') {
              return <DirectionalPadControl onMove={handleMove} />;
            } else {
              return (
                <VirtualJoystick
                  onMove={handleMove}
                />
              );
            }
          })()}
          {/* Mobile sidebar - render as overlay */}
          <DemoSidebar
            onSpawnMob={handleSpawnMob}
            onSpawnBoss={handleSpawnBoss}
            onSpawnItem={handleSpawnItem}
            onSpawnPortal={handleSpawnPortal}
            onSpawnLightswitch={handleSpawnLightswitch}
            onClearAll={handleClearAll}
            spotlightEnabled={spotlightEnabled}
            onToggleSpotlight={setSpotlightEnabled}
            playerPos={playerPos}
          />
        </>
      )}
      
      <LogViewer maxEntries={200} />
    </div>
  );
}

