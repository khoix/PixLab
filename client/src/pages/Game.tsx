import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../lib/store';
import { useLocation } from '../lib/router';
import { GameCanvas } from '../components/game/GameCanvas';
import { VirtualJoystick } from '../components/game/VirtualJoystick';
import { TouchpadControl } from '../components/game/TouchpadControl';
import { DirectionalPadControl } from '../components/game/DirectionalPadControl';
import { HUD } from '../components/game/HUD';
import { Compendium } from '../components/game/Compendium';
import { GameOverlay } from '../components/game/GameOverlay';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Slider } from '../components/ui/slider';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { MODS, RARITY_COLORS } from '../lib/game/constants';
import { cn } from '../lib/utils';
import { useToast } from '../hooks/use-toast';
import { ToastAction } from '../components/ui/toast';
import { generateLevel } from '../lib/game/engine';
import { generateBossDrop, calculateSellValue, generateItem, generateCommerceVendorItems } from '../lib/game/items';
import { recordItemOffer, markOfferPurchased, getSoftAssistAdjustments, getOfferPowerMetrics } from '../lib/game/itemEconomy';
import { audioManager } from '../lib/audio';
import { getEffectiveStats, getTotalDefense } from '../lib/game/stats';
import { Item } from '../lib/game/types';
import { Plus, Sword, Shield, Wrench, FlaskConical, Settings } from 'lucide-react';
import pixlabImage from '../assets/pixlab3.PNG';
import { MazeBackground } from '../components/MazeBackground';
import { useIsMobile } from '../hooks/use-mobile';

// Component for inventory item with hover comparison
const InventoryItemWithHover: React.FC<{
  item: Item;
  itemContent: React.ReactNode;
  equippedItem: Item | null;
  canEquip: boolean;
  isMobile?: boolean;
}> = ({ item, itemContent, equippedItem, canEquip, isMobile = false }) => {
  const [mousePos, setMousePos] = useState<{ x: number; y: number; showBelow: boolean } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only show hover on web (not mobile)
  if (canEquip && equippedItem && !isMobile) {
    const equippedRarityColor = RARITY_COLORS[equippedItem.rarity];
    
    const tooltipContent = isHovering && mousePos && mounted ? (
      <div
        className="fixed z-[100] w-80 bg-black/95 border border-primary/50 rounded-md p-4 shadow-lg pointer-events-none"
        style={{
          left: `${mousePos.x}px`,
          top: `${mousePos.y}px`,
          transform: mousePos.showBelow ? 'translate(-50%, 10px)' : 'translate(-50%, calc(-100% - 10px))',
        }}
      >
        <div className="space-y-3">
          <div className="border-b border-primary/30 pb-2">
            <div className="text-xs font-mono text-muted-foreground mb-1">CURRENTLY EQUIPPED</div>
            <div className="font-pixel text-sm" style={{ color: equippedRarityColor }}>
              {equippedItem.name}
            </div>
          </div>
          {equippedItem.stats && (
            <div className="space-y-1">
              <div className="text-xs font-mono text-muted-foreground mb-1">STATS:</div>
              <div className="text-sm font-mono text-muted-foreground space-y-0.5">
                {equippedItem.stats.damage && <div>DMG: +{equippedItem.stats.damage}</div>}
                {equippedItem.stats.defense && <div>DEF: +{equippedItem.stats.defense}</div>}
                {equippedItem.stats.speed && <div>SPD: +{equippedItem.stats.speed}</div>}
                {equippedItem.stats.vision && <div>VIS: +{equippedItem.stats.vision}</div>}
                {equippedItem.stats.heal && <div>HEAL: +{equippedItem.stats.heal}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null;

    return (
      <div
        key={item.id}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
          setIsHovering(false);
          setMousePos(null);
        }}
        onMouseMove={(e) => {
          const x = e.clientX;
          const y = e.clientY;
          // Keep card within viewport bounds
          const cardWidth = 320; // w-80 = 20rem = 320px
          const cardHeight = 200; // Approximate height
          const padding = 10;
          
          let adjustedX = x;
          let showBelow = false;
          
          // Adjust horizontal position if near edges
          if (x < cardWidth / 2 + padding) {
            adjustedX = cardWidth / 2 + padding;
          } else if (x > window.innerWidth - cardWidth / 2 - padding) {
            adjustedX = window.innerWidth - cardWidth / 2 - padding;
          }
          
          // Show below cursor if near top of viewport
          if (y < cardHeight + padding) {
            showBelow = true;
          }
          
          setMousePos({ x: adjustedX, y, showBelow });
        }}
        className="relative"
      >
        {itemContent}
        {mounted && tooltipContent && createPortal(tooltipContent, document.body)}
      </div>
    );
  }

  return <div key={item.id}>{itemContent}</div>;
};

const SHOP_ITEMS = [
  { id: 'hp_boost', name: '+20 MAX HP', price: 50, stat: 'maxHp', value: 20 },
  { id: 'damage_boost', name: '+5 DAMAGE', price: 75, stat: 'damage', value: 5 },
  { id: 'speed_boost', name: '+0.5 SPEED', price: 60, stat: 'speed', value: 0.5 },
  { id: 'vision_boost', name: '+0.5 VISION', price: 40, stat: 'visionRadius', value: 0.5 },
];

export default function Game() {
  const { state, dispatch, resetGame } = useGame();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [inputDir, setInputDir] = useState({ x: 0, y: 0 });
  const [levelStartTime, setLevelStartTime] = useState(Date.now());
  const [showMenu, setShowMenu] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [lastItemCount, setLastItemCount] = useState(state.inventory.length);
  const [gameOverState, setGameOverState] = useState<{ type: 'death' | 'timeout' } | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<Item['type'] | 'all'>('all');
  const [vendorItems, setVendorItems] = useState<Item[]>([]);
  const [soldItems, setSoldItems] = useState<Item[]>([]);
  const [showCommerceVendor, setShowCommerceVendor] = useState(false);
  const [commerceVendorItems, setCommerceVendorItems] = useState<Item[]>([]);
  const [commerceScrollRarity, setCommerceScrollRarity] = useState<Item['rarity'] | null>(null);
  const { toast } = useToast();
  const hasHandledRefresh = useRef(false);

  // Handle page refresh - clean up game state and navigate to Home (no UI prompt)
  useEffect(() => {
    // Only handle refresh once on mount
    if (hasHandledRefresh.current) return;
    hasHandledRefresh.current = true;

    // Check if this is a page refresh (no navigation flag) vs normal navigation
    const wasNavigated = sessionStorage.getItem('navigated_to_play');
    
    // If we're on /play and the game state shows an active game (not title screen)
    if (location === '/play' && (state.screen === 'run' || state.screen === 'lobby' || state.screen === 'shop')) {
      // Only treat as refresh if there's no navigation flag (page was refreshed)
      if (!wasNavigated) {
        // Check if player has 0 HP (game over state) - redirect to Home
        if (state.stats.hp <= 0) {
          // Reset game state (this cleans up everything)
          resetGame();
          // Navigate to Home immediately (no game over UI shown)
          setLocation('/');
          return;
        }
        // Reset game state (this cleans up everything)
        resetGame();
        // Navigate to Home immediately (no game over UI shown)
        setLocation('/');
      } else {
        // Clear the flag for next time (normal navigation, not a refresh)
        sessionStorage.removeItem('navigated_to_play');
      }
    }
  }, [location, state.screen, resetGame, setLocation, state.stats.hp]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.uid);
      toast({ 
        title: "CODE COPIED", 
        description: "Full code copied to clipboard", 
        className: "bg-green-900 border-green-500 text-green-100" 
      });
    } catch (err) {
      toast({ 
        title: "COPY FAILED", 
        description: "Could not copy to clipboard", 
        className: "bg-red-900 border-red-500 text-red-100" 
      });
    }
  };

  // Show toast when item is collected
  useEffect(() => {
    if (state.inventory.length > lastItemCount) {
      const newItem = state.inventory[state.inventory.length - 1];
      const statsText = newItem.stats ? Object.entries(newItem.stats)
        .filter(([_, val]) => val !== undefined && val !== 0)
        .map(([key, val]) => {
          const statName = key === 'damage' ? 'DMG' : key === 'defense' ? 'DEF' : key === 'speed' ? 'SPD' : key === 'vision' ? 'VIS' : key === 'heal' ? 'HEAL' : key.toUpperCase();
          return `+${val} ${statName}`;
        })
        .join(', ') : '';
      
      // Use inline style for rarity-based colors since Tailwind doesn't support dynamic classes
      const rarityStyles = {
        legendary: { bg: 'bg-yellow-900/90', border: 'border-yellow-500', text: 'text-yellow-100', button: 'bg-yellow-950 hover:bg-yellow-900 border-yellow-600' },
        epic: { bg: 'bg-purple-900/90', border: 'border-purple-500', text: 'text-purple-100', button: 'bg-purple-950 hover:bg-purple-900 border-purple-600' },
        rare: { bg: 'bg-blue-900/90', border: 'border-blue-500', text: 'text-blue-100', button: 'bg-blue-950 hover:bg-blue-900 border-blue-600' },
        common: { bg: 'bg-gray-900/90', border: 'border-gray-500', text: 'text-gray-100', button: 'bg-gray-950 hover:bg-gray-900 border-gray-600' },
      };
      const style = rarityStyles[newItem.rarity] || rarityStyles.common;
      
      // Add quick-equip button for weapons and armor
      const action = (newItem.type === 'weapon' || newItem.type === 'armor') ? (
        <ToastAction
          altText="Equip"
          onClick={() => {
            dispatch({ 
              type: 'EQUIP_ITEM', 
              payload: { 
                slot: newItem.type as 'weapon' | 'armor', 
                item: newItem 
              } 
            });
            toast({ 
              title: "EQUIPPED", 
              description: newItem.name,
              className: "bg-green-900 border-green-500 text-green-100" 
            });
          }}
          className={`${style.button} text-white focus:ring-0 focus:ring-offset-0 active:ring-0 outline-none`}
        >
          EQUIP
        </ToastAction>
      ) : undefined;
      
      toast({ 
        title: `OBTAINED: ${newItem.name}`, 
        description: statsText || newItem.description,
        className: `${style.bg} ${style.border} ${style.text}`,
        action
      });
    }
    setLastItemCount(state.inventory.length);
  }, [state.inventory.length, toast, dispatch]);

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
    setGameOverState({ type: 'death' });
    audioManager.playSound('gameOver');
    audioManager.stopMusic();
  };

  const handleTimeOut = () => {
    setGameOverState({ type: 'timeout' });
    audioManager.playSound('gameOver');
    audioManager.stopMusic();
  };

  const handleReturnToMenu = () => {
    // Clear game over state first to prevent useEffect from interfering
    const gameOverType = gameOverState?.type;
    setGameOverState(null);
    
    if (gameOverType === 'death' || gameOverType === 'timeout') {
      // Reset game on death or timeout - resetGame now clears mods and boss drops
      // Both death and timeout should fully reset the game state
      resetGame();
    }
    
    // Navigate to lobby instead of Home
    dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
    // Mark that we're intentionally navigating to /play (not a page refresh)
    sessionStorage.setItem('navigated_to_play', 'true');
    setLocation('/play');
  };

  const handleLevelComplete = () => {
    const level = generateLevel(state.currentLevel, 30, 30, state.stats, state.loadout);
    
    if (level.isBoss) {
      toast({ title: "BOSS DEFEATED", description: "Securing legendary loot...", className: "bg-yellow-900 border-yellow-500 text-yellow-100" });
      const bossLoot = generateBossDrop(state.currentLevel);
      // Record boss drop offer
      recordItemOffer(
        bossLoot,
        state.currentLevel,
        'boss',
        state.stats.coins,
        false // Not purchased, it's a drop
      );
      dispatch({ type: 'ADD_BOSS_DROP', payload: bossLoot });
      dispatch({ type: 'NEXT_LEVEL' });
      dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
    } else {
      toast({ title: "SECTOR CLEARED", description: "Proceeding deeper...", className: "bg-green-900 border-green-500 text-green-100" });
      dispatch({ type: 'NEXT_LEVEL' });
      dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
    }
  };

  const currentLevel = generateLevel(state.currentLevel, 30, 30, state.stats, state.loadout);

  // Reset game over state when screen changes to 'run' (starting a new level)
  // But NOT when changing to 'lobby' to avoid clearing game over state prematurely
  useEffect(() => {
    // Only clear game over state when starting a new run (not when going to lobby)
    // This prevents clearing game over state when resetGame() changes screen to 'lobby'
    if (state.screen === 'run' && !gameOverState) {
      setGameOverState(null);
    }
  }, [state.currentLevel, state.screen, gameOverState]);

  // Reset input direction when a new level loads to prevent unwanted movement
  useEffect(() => {
    if (state.screen === 'run') {
      setInputDir({ x: 0, y: 0 });
    }
  }, [state.currentLevel, state.screen]);

  // Close inventory dialog when game over occurs
  useEffect(() => {
    if (gameOverState) {
      setShowInventory(false);
      setShowMenu(false);
    }
  }, [gameOverState]);

  // Play music based on current screen
  useEffect(() => {
    audioManager.resume();
    
    if (state.screen === 'lobby') {
      audioManager.playMusic('lobby');
    } else if (state.screen === 'shop') {
      audioManager.playMusic('shop');
    } else if (state.screen === 'run') {
      // Music is handled in GameCanvas when level loads
    } else {
      audioManager.stopMusic();
    }
  }, [state.screen]);

  // Update audio volumes when settings change
  useEffect(() => {
    audioManager.setMusicVolume(state.settings.musicVolume);
    audioManager.setSfxVolume(state.settings.sfxVolume);
  }, [state.settings.musicVolume, state.settings.sfxVolume]);

  // Handle Commerce Scroll - open vendor station
  useEffect(() => {
    if (state.pendingScrollAction?.type === 'scroll_commerce') {
      // Use the stored rarity from pendingScrollAction (scroll is already removed from inventory)
      const scrollRarity = state.pendingScrollAction.rarity;
      
      if (scrollRarity) {
        // Generate vendor items based on scroll rarity
        const vendorItems = generateCommerceVendorItems(scrollRarity, state.currentLevel);
        // Record commerce vendor offers
        vendorItems.forEach(item => {
          recordItemOffer(
            item,
            state.currentLevel,
            'shop',
            state.stats.coins,
            false // Not purchased yet
          );
        });
        setCommerceVendorItems(vendorItems);
        setCommerceScrollRarity(scrollRarity);
        setShowCommerceVendor(true);
        
        // Clear pending scroll action
        dispatch({ type: 'CLEAR_PENDING_SCROLL_ACTION' });
      } else {
        // Fallback: if rarity not found, use common rarity
        const vendorItems = generateCommerceVendorItems('common', state.currentLevel);
        vendorItems.forEach(item => {
          recordItemOffer(
            item,
            state.currentLevel,
            'shop',
            state.stats.coins,
            false
          );
        });
        setCommerceVendorItems(vendorItems);
        setCommerceScrollRarity('common');
        setShowCommerceVendor(true);
        dispatch({ type: 'CLEAR_PENDING_SCROLL_ACTION' });
      }
    }
  }, [state.pendingScrollAction, state.currentLevel, dispatch]);

  // Generate random vendor items when entering shop
  useEffect(() => {
    if (state.screen === 'shop') {
      const storageKey = `vendor_items_level_${state.currentLevel}`;
      
      // Try to load from localStorage first
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsedItems = JSON.parse(saved);
          // Validate that we have items and they're for the current level
          if (Array.isArray(parsedItems) && parsedItems.length > 0) {
            setVendorItems(parsedItems);
            return;
          }
        }
      } catch (error) {
        console.warn('Failed to load vendor items from localStorage:', error);
      }
      
      // Generate 2 random items for the vendor if not found in storage
      const item1 = generateItem(state.currentLevel);
      const item2 = generateItem(state.currentLevel);
      const newItems = [item1, item2];
      
      // Record shop offers
      newItems.forEach(item => {
        recordItemOffer(
          item,
          state.currentLevel,
          'shop',
          state.stats.coins,
          false // Not purchased yet
        );
      });
      
      setVendorItems(newItems);
      
      // Save to localStorage
      try {
        localStorage.setItem(storageKey, JSON.stringify(newItems));
      } catch (error) {
        console.warn('Failed to save vendor items to localStorage:', error);
      }
    } else {
      // Clear vendor items and sold items when not in shop
      setVendorItems([]);
      setSoldItems([]);
    }
  }, [state.screen, state.currentLevel]);

  if (state.screen === 'lobby') {
    return (
      <div className="lobby-page min-h-screen flex flex-col items-center justify-center p-4 crt relative">
        <MazeBackground />
        <div className="text-center space-y-2 mb-8">
          <h1 
            onClick={() => setLocation('/')}
            className="text-3xl md:text-5xl font-pixel text-primary drop-shadow-[0_0_10px_rgba(0,255,245,0.8)] leading-tight cursor-pointer transition-opacity hover:opacity-80 active:opacity-60 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            PIXEL<span className="text-secondary" style={{ textShadow: '2px 2px 4px rgba(0, 0, 0, 1), 0 0 8px rgba(0, 0, 0, 0.8)' }}><span className="relative inline-block">
              <span 
                className="absolute -z-10"
                style={{
                  backgroundImage: `url(${pixlabImage})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  width: '3.6em',
                  height: '3.6em',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              LAB
            </span>YRINTH</span>
          </h1>
        </div>
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card/90 border-primary/20 pixel-corners h-full bg-white/5">
            <CardHeader className="hidden md:block">
              <CardTitle className="text-primary text-2xl">STATS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 font-mono text-3xl">
              {/* Mobile 3-column layout */}
              <div className="flex md:hidden stats-mobile-layout w-full h-full">
                {/* First column: Rotated STATS label */}
                <div className="stats-label-column flex items-center justify-start">
                  <div className="stats-label-rotated text-primary">STATS</div>
                </div>
                {/* Second column: HP, DMG, DEF */}
                <div className="stats-column-1 flex flex-col space-y-4 justify-center">
                  {(() => {
                    const effectiveStats = getEffectiveStats(state.stats, state.loadout);
                    const baseDamage = state.stats.damage;
                    const totalDefense = getTotalDefense(state.loadout);
                    const hasBonuses = effectiveStats.damage !== baseDamage || totalDefense > 0;
                    return (
                      <>
                        <div className="flex justify-between text-xl">
                          <span>HP</span>
                          <span className="text-primary">{state.stats.hp}/{state.stats.maxHp}</span>
                        </div>
                        <div className="flex justify-between text-xl">
                          <span>DMG</span>
                          <span className="text-destructive">
                            {effectiveStats.damage}
                            {hasBonuses && effectiveStats.damage !== baseDamage && (
                              <span className="text-green-400 ml-1">(+{effectiveStats.damage - baseDamage})</span>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between text-xl">
                          <span>DEF</span>
                          <span className="text-purple-400">
                            {totalDefense}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {/* Third column: COINS, SPEED, VISION */}
                <div className="stats-column-2 flex flex-col space-y-4 justify-center">
                  {(() => {
                    const effectiveStats = getEffectiveStats(state.stats, state.loadout);
                    const baseSpeed = state.stats.speed;
                    const baseVision = state.stats.visionRadius;
                    const hasBonuses = effectiveStats.speed !== baseSpeed || effectiveStats.visionRadius !== baseVision;
                    return (
                      <>
                        <div className="flex justify-between text-xl">
                          <span>COINS</span>
                          <span className="text-yellow-400">{state.stats.coins}</span>
                        </div>
                        <div className="flex justify-between text-xl">
                          <span>SPD</span>
                          <span className="text-blue-400">
                            {effectiveStats.speed.toFixed(1)}
                            {hasBonuses && effectiveStats.speed !== baseSpeed && (
                              <span className="text-green-400 ml-1">(+{(effectiveStats.speed - baseSpeed).toFixed(1)})</span>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between text-xl">
                          <span>VIS</span>
                          <span className="text-cyan-400">
                            {effectiveStats.visionRadius.toFixed(1)}
                            {hasBonuses && effectiveStats.visionRadius !== baseVision && (
                              <span className="text-green-400 ml-1">(+{(effectiveStats.visionRadius - baseVision).toFixed(1)})</span>
                            )}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              {/* Desktop layout */}
              <div className="hidden md:block">
                <div className="flex justify-between">
                  <span>HP</span>
                  <span className="text-primary">{state.stats.hp}/{state.stats.maxHp}</span>
                </div>
                <div className="flex justify-between">
                  <span>COINS</span>
                  <span className="text-yellow-400">{state.stats.coins}</span>
                </div>
                {(() => {
                  const effectiveStats = getEffectiveStats(state.stats, state.loadout);
                  const baseDamage = state.stats.damage;
                  const baseSpeed = state.stats.speed;
                  const baseVision = state.stats.visionRadius;
                  const totalDefense = getTotalDefense(state.loadout);
                  const hasBonuses = effectiveStats.damage !== baseDamage || 
                                    effectiveStats.speed !== baseSpeed || 
                                    effectiveStats.visionRadius !== baseVision ||
                                    totalDefense > 0;
                  return (
                    <>
                      <div className="flex justify-between">
                        <span>DMG</span>
                        <span className="text-destructive">
                          {effectiveStats.damage}
                          {hasBonuses && effectiveStats.damage !== baseDamage && (
                            <span className="text-green-400 ml-1">(+{effectiveStats.damage - baseDamage})</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>DEF</span>
                        <span className="text-purple-400">
                          {totalDefense}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>SPEED</span>
                        <span className="text-blue-400">
                          {effectiveStats.speed.toFixed(1)}
                          {hasBonuses && effectiveStats.speed !== baseSpeed && (
                            <span className="text-green-400 ml-1">(+{(effectiveStats.speed - baseSpeed).toFixed(1)})</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>VISION</span>
                        <span className="text-cyan-400">
                          {effectiveStats.visionRadius.toFixed(1)}
                          {hasBonuses && effectiveStats.visionRadius !== baseVision && (
                            <span className="text-green-400 ml-1">(+{(effectiveStats.visionRadius - baseVision).toFixed(1)})</span>
                          )}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 bg-card/90 border-primary/20 pixel-corners flex flex-col h-full min-h-[500px]">
            <Tabs defaultValue="mission" className="w-full flex-1 flex flex-col">
              <TabsList className="w-full bg-black/40 rounded-none border-b border-white/10">
                <TabsTrigger value="mission" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">MISSION</TabsTrigger>
                <TabsTrigger value="loadout" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">
                  <span className="md:hidden">INV</span>
                  <span className="hidden md:inline">INVENTORY</span>
                </TabsTrigger>
                <TabsTrigger value="compendium" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">COMPENDIUM</TabsTrigger>
                <TabsTrigger value="mods" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">MODS</TabsTrigger>
                <TabsTrigger value="settings" className="w-auto aspect-square font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">
                  <Settings className="w-4 h-4" />
                </TabsTrigger>
              </TabsList>

              <div className="p-6 flex-1 relative overflow-hidden">
                <TabsContent value="mission" className="h-full flex flex-col items-center justify-center space-y-8 animate-in fade-in zoom-in-95">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl text-white font-pixel">SECTOR {state.currentLevel}</h2>
                    <p className="text-muted-foreground font-mono text-lg">
                      {currentLevel.isBoss ? 'BOSS AWAITS' : currentLevel.isShop ? 'VENDOR STATION' : 'COMBAT ZONE'}
                    </p>
                  </div>
                  <Button 
                    size="lg" 
                    className="w-64 h-16 text-xl font-pixel bg-primary text-black hover:bg-primary/80 pixel-corners"
                    onClick={() => {
                      if (currentLevel.isShop) {
                        // Shop levels are cutscenes - go directly to shop screen
                        toast({ title: "SHOP SECTOR", description: "Welcome, operator. Browse our wares.", className: "bg-green-900 border-green-500 text-green-100" });
                        dispatch({ type: 'SET_SCREEN', payload: 'shop' });
                      } else {
                        setLevelStartTime(Date.now());
                        dispatch({ type: 'SET_SCREEN', payload: 'run' });
                      }
                    }}
                  >
                    ENTER
                  </Button>
                </TabsContent>

                <TabsContent value="loadout" className="space-y-4 max-h-[400px] overflow-y-auto">
                  {/* Equipped Items Section */}
                  <div className="border border-primary/30 p-3 bg-primary/5">
                    <h4 className="font-pixel text-lg text-primary mb-2">EQUIPPED</h4>
                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-lg font-mono text-muted-foreground">WEAPON:</span>
                        </div>
                        <div className={cn(
                          "p-2 border text-lg font-mono",
                          state.loadout.weapon ? "border-primary/30 bg-primary/5" : "border-white/10"
                        )}>
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              state.loadout.weapon ? 'text-primary' : 'text-muted-foreground',
                              "text-2xl"
                            )}>
                              {state.loadout.weapon?.name || 'NONE'}
                            </span>
                            {state.loadout.weapon && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs font-pixel border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
                                onClick={() => {
                                  dispatch({ type: 'UNEQUIP_ITEM', payload: { slot: 'weapon' } });
                                  toast({ 
                                    title: "UNEQUIPPED", 
                                    description: state.loadout.weapon?.name,
                                    className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                                  });
                                }}
                              >
                                UNEQUIP
                              </Button>
                            )}
                          </div>
                          {state.loadout.weapon?.stats && (
                            <div className="text-xl text-muted-foreground space-y-0.5 mt-1">
                              {state.loadout.weapon.stats.damage && <div>DMG: +{state.loadout.weapon.stats.damage}</div>}
                              {state.loadout.weapon.stats.speed && <div>SPD: +{state.loadout.weapon.stats.speed}</div>}
                              {state.loadout.weapon.stats.vision && <div>VIS: +{state.loadout.weapon.stats.vision}</div>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-lg font-mono text-muted-foreground">ARMOR:</span>
                        </div>
                        <div className={cn(
                          "p-2 border text-lg font-mono",
                          state.loadout.armor ? "border-primary/30 bg-primary/5" : "border-white/10"
                        )}>
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              state.loadout.armor ? 'text-primary' : 'text-muted-foreground',
                              "text-2xl"
                            )}>
                              {state.loadout.armor?.name || 'NONE'}
                            </span>
                            {state.loadout.armor && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs font-pixel border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
                                onClick={() => {
                                  dispatch({ type: 'UNEQUIP_ITEM', payload: { slot: 'armor' } });
                                  toast({ 
                                    title: "UNEQUIPPED", 
                                    description: state.loadout.armor?.name,
                                    className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                                  });
                                }}
                              >
                                UNEQUIP
                              </Button>
                            )}
                          </div>
                          {state.loadout.armor?.stats && (
                            <div className="text-xl text-muted-foreground space-y-0.5 mt-1">
                              {state.loadout.armor.stats.defense && <div>DEF: +{state.loadout.armor.stats.defense}</div>}
                              {state.loadout.armor.stats.speed && <div>SPD: +{state.loadout.armor.stats.speed}</div>}
                              {state.loadout.armor.stats.vision && <div>VIS: +{state.loadout.armor.stats.vision}</div>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-lg font-mono text-muted-foreground">UTILITY:</span>
                        </div>
                        <div className={cn(
                          "p-2 border text-lg font-mono",
                          state.loadout.utility ? "border-primary/30 bg-primary/5" : "border-white/10"
                        )}>
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              state.loadout.utility ? 'text-primary' : 'text-muted-foreground',
                              "text-2xl"
                            )}>
                              {state.loadout.utility?.name || 'NONE'}
                            </span>
                            {state.loadout.utility && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs font-pixel border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
                                onClick={() => {
                                  dispatch({ type: 'UNEQUIP_ITEM', payload: { slot: 'utility' } });
                                  toast({ 
                                    title: "UNEQUIPPED", 
                                    description: state.loadout.utility?.name,
                                    className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                                  });
                                }}
                              >
                                UNEQUIP
                              </Button>
                            )}
                          </div>
                          {state.loadout.utility?.stats && (
                            <div className="text-xl text-muted-foreground space-y-0.5 mt-1">
                              {state.loadout.utility.stats.damage && <div>DMG: +{state.loadout.utility.stats.damage}</div>}
                              {state.loadout.utility.stats.speed && <div>SPD: +{state.loadout.utility.stats.speed}</div>}
                              {state.loadout.utility.stats.vision && <div>VIS: +{state.loadout.utility.stats.vision}</div>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Boss Drops */}
                  {state.bossDrops.length > 0 && (
                    <div className="border border-yellow-500/50 p-3 bg-yellow-500/5">
                      <h4 className="font-pixel text-lg text-yellow-400 mb-2">LEGENDARY ARTIFACTS</h4>
                      {state.bossDrops.map(drop => (
                        <div key={drop.id} className="text-lg text-muted-foreground font-mono mb-1">{drop.name}</div>
                      ))}
                    </div>
                  )}

                  {/* Inventory Items */}
                  <div>
                    <div className="flex items-center justify-between mb-2 inventory-header-mobile">
                      <h4 className="font-pixel text-lg text-primary inventory-title-mobile">INVENTORY ({state.inventory.length})</h4>
                      <div className="flex items-center gap-1 inventory-buttons-mobile">
                        <button
                          onClick={() => setInventoryFilter('all')}
                          className={cn(
                            "p-1.5 border transition-all",
                            inventoryFilter === 'all'
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-white/20 hover:border-white/40 text-muted-foreground"
                          )}
                          title="All Items"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setInventoryFilter('weapon')}
                          className={cn(
                            "p-1.5 border transition-all",
                            inventoryFilter === 'weapon'
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-white/20 hover:border-white/40 text-muted-foreground"
                          )}
                          title="Weapons"
                        >
                          <Sword className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setInventoryFilter('armor')}
                          className={cn(
                            "p-1.5 border transition-all",
                            inventoryFilter === 'armor'
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-white/20 hover:border-white/40 text-muted-foreground"
                          )}
                          title="Armor"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setInventoryFilter('utility')}
                          className={cn(
                            "p-1.5 border transition-all",
                            inventoryFilter === 'utility'
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-white/20 hover:border-white/40 text-muted-foreground"
                          )}
                          title="Utility"
                        >
                          <Wrench className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setInventoryFilter('consumable')}
                          className={cn(
                            "p-1.5 border transition-all",
                            inventoryFilter === 'consumable'
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-white/20 hover:border-white/40 text-muted-foreground"
                          )}
                          title="Consumables"
                        >
                          <FlaskConical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {(() => {
                      const filteredInventory = inventoryFilter === 'all' 
                        ? state.inventory 
                        : state.inventory.filter(item => item.type === inventoryFilter);
                      
                      if (filteredInventory.length === 0) {
                        return (
                          <p className="text-center text-lg text-muted-foreground mt-4">
                            {state.inventory.length === 0 ? 'EMPTY' : `NO ${inventoryFilter.toUpperCase()} ITEMS`}
                          </p>
                        );
                      }
                      
                      return (
                        <div className="space-y-2">
                          {filteredInventory.map(item => {
                          const rarityColor = RARITY_COLORS[item.rarity];
                          const isEquipped = state.loadout.weapon?.id === item.id || 
                                           state.loadout.armor?.id === item.id || 
                                           state.loadout.utility?.id === item.id;
                          const canEquip = item.type === 'weapon' || item.type === 'armor' || item.type === 'utility';
                          
                          // Get equipped item of the same type (if different from current item)
                          const equippedItem = canEquip && !isEquipped
                            ? (item.type === 'weapon' ? state.loadout.weapon :
                               item.type === 'armor' ? state.loadout.armor :
                               item.type === 'utility' ? state.loadout.utility : null)
                            : null;
                          
                          const itemContent = (
                            <div
                              className={cn(
                                "p-3 border transition-all",
                                isEquipped ? "border-primary bg-primary/10" : "border-white/10"
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-pixel text-base" style={{ color: rarityColor }}>
                                  {item.name}
                                </span>
                                {canEquip && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={cn(
                                      "h-6 px-2 text-xs font-pixel",
                                      isEquipped
                                        ? "border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
                                        : "border-green-500/50 bg-green-500/10 hover:bg-green-500/20"
                                    )}
                                    onClick={() => {
                                      if (isEquipped) {
                                        // Unequip
                                        const slot = state.loadout.weapon?.id === item.id ? 'weapon' :
                                                     state.loadout.armor?.id === item.id ? 'armor' : 'utility';
                                        dispatch({ type: 'UNEQUIP_ITEM', payload: { slot } });
                                        toast({ 
                                          title: "UNEQUIPPED", 
                                          description: item.name,
                                          className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                                        });
                                      } else {
                                        // Equip
                                        dispatch({ type: 'EQUIP_ITEM', payload: { slot: item.type as 'weapon' | 'armor' | 'utility', item } });
                                        toast({ 
                                          title: "EQUIPPED", 
                                          description: item.name,
                                          className: "bg-green-900 border-green-500 text-green-100" 
                                        });
                                      }
                                    }}
                                  >
                                    {isEquipped ? 'UNEQUIP' : 'EQUIP'}
                                  </Button>
                                )}
                              </div>
                              {item.stats && (
                                <div className="text-xl font-mono text-muted-foreground space-y-0.5">
                                  {item.stats.damage && <div>DMG: +{item.stats.damage}</div>}
                                  {item.stats.defense && <div>DEF: +{item.stats.defense}</div>}
                                  {item.stats.speed && <div>SPD: +{item.stats.speed}</div>}
                                  {item.stats.vision && <div>VIS: +{item.stats.vision}</div>}
                                  {item.stats.heal && <div>HEAL: +{item.stats.heal}</div>}
                                </div>
                              )}
                              {item.type === 'consumable' && (
                                <div className="text-lg text-cyan-400 font-mono mt-1">[CONSUMABLE]</div>
                              )}
                            </div>
                          );
                          
                          return (
                            <InventoryItemWithHover
                              key={item.id}
                              item={item}
                              itemContent={itemContent}
                              equippedItem={equippedItem}
                              canEquip={canEquip}
                              isMobile={isMobile}
                            />
                          );
                        })}
                        </div>
                      );
                    })()}
                  </div>
                </TabsContent>

                <TabsContent value="compendium" className="space-y-4 max-h-[400px] overflow-y-auto">
                  <Compendium />
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
                      <h4 className="font-pixel text-lg text-primary mb-1">{mod.name}</h4>
                      <p className="text-lg text-muted-foreground font-mono">{mod.description}</p>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="settings" className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-lg font-pixel text-primary mb-2 block">MUSIC VOLUME</label>
                      <div className="flex items-center gap-3">
                        <Slider
                          value={[state.settings.musicVolume]}
                          onValueChange={(value) => {
                            dispatch({ 
                              type: 'UPDATE_SETTINGS', 
                              payload: { musicVolume: value[0] }
                            });
                            audioManager.setMusicVolume(value[0]);
                          }}
                          min={0}
                          max={1}
                          step={0.1}
                          className="flex-1"
                        />
                        <span className="text-lg font-mono text-muted-foreground w-12 text-right">
                          {Math.round(state.settings.musicVolume * 100)}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-lg font-pixel text-primary mb-2 block">SFX VOLUME</label>
                      <div className="flex items-center gap-3">
                        <Slider
                          value={[state.settings.sfxVolume]}
                          onValueChange={(value) => {
                            dispatch({ 
                              type: 'UPDATE_SETTINGS', 
                              payload: { sfxVolume: value[0] }
                            });
                            audioManager.setSfxVolume(value[0]);
                            // Play a test sound
                            audioManager.playSound('coin');
                          }}
                          min={0}
                          max={1}
                          step={0.1}
                          className="flex-1"
                        />
                        <span className="text-lg font-mono text-muted-foreground w-12 text-right">
                          {Math.round(state.settings.sfxVolume * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="md:hidden">
                      <label className="text-lg font-pixel text-primary mb-2 block">MOBILE CONTROLS</label>
                      <RadioGroup
                        value={(state.settings.mobileControlType || 'joystick') as 'joystick' | 'touchpad' | 'dpad'}
                        onValueChange={(value) => {
                          dispatch({ 
                            type: 'UPDATE_SETTINGS', 
                            payload: { mobileControlType: value as 'joystick' | 'touchpad' | 'dpad' }
                          });
                        }}
                        className="flex flex-col gap-3"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="joystick" id="joystick" />
                          <label htmlFor="joystick" className="text-sm font-mono text-foreground cursor-pointer">
                            Virtual Joystick
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="touchpad" id="touchpad" />
                          <label htmlFor="touchpad" className="text-sm font-mono text-foreground cursor-pointer">
                            Touchpad (Swipe & Tap)
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="dpad" id="dpad" />
                          <label htmlFor="dpad" className="text-sm font-mono text-foreground cursor-pointer">
                            Directional Pad
                          </label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </Card>
        </div>
        <div className="mt-8 p-4 border border-dashed border-white/10 bg-black/40 rounded w-full max-w-4xl">
          <p className="text-lg text-center text-muted-foreground font-mono">
            CODE: <span 
              className="text-primary font-mono break-all cursor-pointer hover:text-primary/80 transition-colors select-none"
              onClick={handleCopyCode}
              title="Click to copy full code"
            >
              {state.uid.length > 50 ? `${state.uid.substring(0, 50)}...` : state.uid}
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (state.screen === 'shop') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 crt">
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/20 via-black to-black pointer-events-none" />
        <Card className="bg-card/90 border-primary/20 pixel-corners w-full max-w-4xl relative z-10 animate-in fade-in zoom-in-95 duration-500">
          <CardHeader>
            <CardTitle className="text-primary text-2xl font-pixel">VENDOR STATION</CardTitle>
            <p className="text-xs font-mono text-muted-foreground mt-2">SECTOR {state.currentLevel} • TRADING POST</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded">
              <p className="text-2xl font-mono text-muted-foreground text-right">
                COINS: <span className="text-yellow-400 font-bold">${state.stats.coins}</span>
              </p>
            </div>
            
            <Tabs defaultValue="buy" className="w-full">
              <TabsList className="vendor-station-tabs w-full bg-black/40 rounded-none border-b border-white/10">
                <TabsTrigger value="buy" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">PURCHASE</TabsTrigger>
                <TabsTrigger value="sell" className="flex-1 font-pixel text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-none">SELL ITEMS</TabsTrigger>
              </TabsList>

              <TabsContent value="buy" className="space-y-4 mt-4">
                {/* Stat Boosts Section */}
                <div>
                  <h4 className="font-pixel text-sm text-primary mb-2">STAT BOOSTS</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SHOP_ITEMS.map(item => {
                      const canAfford = state.stats.coins >= item.price;
                      return (
                        <button
                          key={item.id}
                          className={cn(
                            "p-4 border transition-all text-left relative overflow-hidden",
                            canAfford 
                              ? "border-primary/30 hover:bg-primary/10 hover:border-primary/50 hover:scale-105" 
                              : "border-gray-700/50 opacity-60 cursor-not-allowed"
                          )}
                          disabled={!canAfford}
                          onClick={() => {
                            if (canAfford) {
                              audioManager.playSound('purchase');
                              dispatch({ type: 'UPDATE_STATS', payload: { 
                                coins: state.stats.coins - item.price,
                                [item.stat]: state.stats[item.stat as keyof typeof state.stats] + item.value
                              }});
                              toast({ title: "PURCHASED", description: item.name, className: "bg-green-900 border-green-500 text-green-100" });
                            }
                          }}
                        >
                          <div className="absolute top-0 right-0 w-2 h-2 bg-primary/20" />
                          <p className="absolute top-2 right-2 text-2xl text-yellow-400 font-mono font-bold">
                            {(() => {
                              const metrics = getOfferPowerMetrics(state.currentLevel, state.loadout);
                              const assists = getSoftAssistAdjustments(metrics.economyRatio);
                              const adjustedPrice = Math.floor(item.price * assists.shopPriceMultiplier);
                              return adjustedPrice !== item.price ? (
                                <span>
                                  <span className="line-through text-gray-500">${item.price}</span>{' '}
                                  <span className="text-green-400">${adjustedPrice}</span>
                                </span>
                              ) : `$${item.price}`;
                            })()}
                          </p>
                          <h4 className="font-pixel text-sm text-primary mb-1">{item.name}</h4>
                          {!canAfford && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                              <p className="insufficient-funds-text text-3xl text-red-400 font-mono">INSUFFICIENT FUNDS</p>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Random Items Section */}
                {(vendorItems.length > 0 || soldItems.length > 0) && (
                  <div className="vendor-items-section">
                    <h4 className="font-pixel text-sm text-primary mb-2">ITEMS</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[...vendorItems, ...soldItems].map(item => {
                        const rarityColor = RARITY_COLORS[item.rarity];
                        const canAfford = state.stats.coins >= item.price;
                        const isSoldItem = soldItems.some(si => si.id === item.id);
                        const canEquip = item.type === 'weapon' || item.type === 'armor' || item.type === 'utility';
                        
                        // Get equipped item of the same type
                        const equippedItem = canEquip
                          ? (item.type === 'weapon' ? state.loadout.weapon :
                             item.type === 'armor' ? state.loadout.armor :
                             item.type === 'utility' ? state.loadout.utility : null)
                          : null;
                        
                        const itemContent = (
                          <button
                            className={cn(
                              "p-4 border transition-all text-left relative overflow-hidden w-full",
                              canAfford 
                                ? "border-primary/30 hover:bg-primary/10 hover:border-primary/50 hover:scale-105" 
                                : "border-gray-700/50 opacity-60 cursor-not-allowed"
                            )}
                            disabled={!canAfford}
                            onClick={() => {
                              if (canAfford) {
                                audioManager.playSound('purchase');
                                // Use adjusted price for purchase
                                const metrics = getOfferPowerMetrics(state.currentLevel, state.loadout);
                                const assists = getSoftAssistAdjustments(metrics.economyRatio);
                                const adjustedPrice = Math.floor(item.price * assists.shopPriceMultiplier);
                                dispatch({ type: 'UPDATE_STATS', payload: { coins: state.stats.coins - adjustedPrice } });
                                dispatch({ type: 'ADD_ITEM', payload: item });
                                // Mark offer as purchased
                                markOfferPurchased(item.id);
                                toast({ 
                                  title: isSoldItem ? "RE-PURCHASED" : "PURCHASED", 
                                  description: item.name, 
                                  className: "bg-green-900 border-green-500 text-green-100" 
                                });
                                
                                if (isSoldItem) {
                                  // Remove purchased item from sold items
                                  setSoldItems(prev => prev.filter(i => i.id !== item.id));
                                } else {
                                  // Remove purchased item from vendor
                                  const updatedItems = vendorItems.filter(i => i.id !== item.id);
                                  setVendorItems(updatedItems);
                                  
                                  // Update localStorage
                                  const storageKey = `vendor_items_level_${state.currentLevel}`;
                                  try {
                                    localStorage.setItem(storageKey, JSON.stringify(updatedItems));
                                  } catch (error) {
                                    console.warn('Failed to update vendor items in localStorage:', error);
                                  }
                                }
                              }
                            }}
                          >
                            <div className="absolute top-0 right-0 w-2 h-2 bg-primary/20" />
                            <p className="absolute top-2 right-2 text-2xl text-yellow-400 font-mono font-bold vendor-item-price">${item.price}</p>
                            <div className="mb-1 flex items-center gap-2">
                              <h4 className="font-pixel text-sm" style={{ color: rarityColor }}>
                                {item.name}{'  '}
                                <span 
                                  className="px-2 py-0.5 font-pixel uppercase"
                                  style={{ 
                                    backgroundColor: rarityColor,
                                    color: 'hsl(240, 20%, 8%)',
                                    fontSize: '6px',
                                    verticalAlign: 'super'
                                  }}
                                >
                                  {item.rarity}
                                </span>
                              </h4>
                            </div>
                            {item.stats && (
                              <div className="font-mono text-muted-foreground space-y-0 mb-2 vendor-item-stats" style={{ fontSize: '1.25rem' }}>
                                {item.stats.damage && <div>DMG: +{item.stats.damage}</div>}
                                {item.stats.defense && <div>DEF: +{item.stats.defense}</div>}
                                {item.stats.speed && <div>SPD: +{item.stats.speed}</div>}
                                {item.stats.vision && <div>VIS: +{item.stats.vision}</div>}
                                {item.stats.heal && <div>HEAL: +{item.stats.heal}</div>}
                              </div>
                            )}
                            <div className="absolute bottom-2 right-2 text-xs font-mono text-muted-foreground/60">
                              {item.type.toUpperCase()}
                            </div>
                            {!canAfford && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                                <p className="insufficient-funds-text text-3xl text-red-400 font-mono">INSUFFICIENT FUNDS</p>
                              </div>
                            )}
                          </button>
                        );
                        
                        return (
                          <InventoryItemWithHover
                            key={item.id}
                            item={item}
                            itemContent={itemContent}
                            equippedItem={equippedItem}
                            canEquip={canEquip}
                            isMobile={isMobile}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sell" className="space-y-4 mt-4">
                {state.inventory.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground font-mono text-sm">NO ITEMS TO SELL</p>
                    <p className="text-muted-foreground/60 font-mono text-xs mt-2">Collect items during missions to sell them here</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {state.inventory.map(item => {
                      const rarityColor = RARITY_COLORS[item.rarity];
                      const sellValue = calculateSellValue(item);
                      const isEquipped = state.loadout.weapon?.id === item.id || 
                                       state.loadout.armor?.id === item.id || 
                                       state.loadout.utility?.id === item.id;
                      const canEquip = item.type === 'weapon' || item.type === 'armor' || item.type === 'utility';
                      
                      // Get equipped item of the same type (if different from current item)
                      const equippedItem = canEquip && !isEquipped
                        ? (item.type === 'weapon' ? state.loadout.weapon :
                           item.type === 'armor' ? state.loadout.armor :
                           item.type === 'utility' ? state.loadout.utility : null)
                        : null;
                      
                      const itemContent = (
                        <div
                          className={cn(
                            "p-4 border transition-all relative",
                            isEquipped ? "border-primary/50 bg-primary/10" : "border-white/20 bg-black/20"
                          )}
                        >
                          {isEquipped && (
                            <span className="absolute bottom-2 left-2 text-xs text-primary font-mono bg-primary/20 px-2 py-0.5">EQUIPPED</span>
                          )}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-pixel text-sm" style={{ color: rarityColor }}>
                                  {item.name}{'  '}
                                  <span 
                                    className="px-2 py-0.5 font-pixel uppercase"
                                    style={{ 
                                      backgroundColor: rarityColor,
                                      color: 'hsl(240, 20%, 8%)',
                                      fontSize: '6px',
                                      verticalAlign: 'super'
                                    }}
                                  >
                                    {item.rarity}
                                  </span>
                                </span>
                              </div>
                              {item.stats && (
                                <div className="font-mono text-muted-foreground space-y-0.5 mb-2" style={{ fontSize: '1.25rem' }}>
                                  {item.stats.damage && <div>DMG: +{item.stats.damage}</div>}
                                  {item.stats.defense && <div>DEF: +{item.stats.defense}</div>}
                                  {item.stats.speed && <div>SPD: +{item.stats.speed}</div>}
                                  {item.stats.vision && <div>VIS: +{item.stats.vision}</div>}
                                  {item.stats.heal && <div>HEAL: +{item.stats.heal}</div>}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="text-right">
                                <p className="text-xs font-mono text-muted-foreground">SELL VALUE</p>
                                <p className="text-lg font-pixel text-yellow-400 font-bold">${sellValue}</p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "font-pixel text-xs",
                                  isEquipped 
                                    ? "border-primary/50 bg-primary/10 hover:bg-primary/20" 
                                    : "border-green-500/50 bg-green-500/10 hover:bg-green-500/20"
                                )}
                                onClick={() => {
                                  if (isEquipped) {
                                    toast({ 
                                      title: "ITEM EQUIPPED", 
                                      description: "Item will be unequipped and sold", 
                                      className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                                    });
                                  }
                                  audioManager.playSound('purchase');
                                  
                                  // Add item to soldItems for re-purchase (with original price)
                                  const itemToSell = { ...item };
                                  // Ensure item has a price (recalculate if needed)
                                  if (!itemToSell.price || itemToSell.price === 0) {
                                    const statValue = itemToSell.stats ? Object.values(itemToSell.stats).reduce((sum: number, val) => sum + (typeof val === 'number' ? val : 0), 0) : 0;
                                    const multiplierMap: Record<string, number> = { common: 1.0, rare: 1.5, epic: 2.0, legendary: 3.0 };
                                    const multiplier = multiplierMap[itemToSell.rarity] ?? 1.0;
                                    itemToSell.price = Math.floor(statValue * 2 * multiplier);
                                  }
                                  setSoldItems(prev => [...prev, itemToSell]);
                                  
                                  dispatch({ type: 'SELL_ITEM', payload: { itemId: item.id } });
                                  toast({ 
                                    title: "SOLD", 
                                    description: `${item.name} for $${sellValue}`, 
                                    className: "bg-green-900 border-green-500 text-green-100" 
                                  });
                                }}
                              >
                                SELL
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                      
                      return (
                        <InventoryItemWithHover
                          key={item.id}
                          item={item}
                          itemContent={itemContent}
                          equippedItem={equippedItem}
                          canEquip={canEquip}
                          isMobile={isMobile}
                        />
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Button 
              className="w-full mt-6 bg-secondary text-black hover:bg-secondary/80 font-pixel text-lg py-6"
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
    const consumables = state.inventory.filter(item => item.type === 'consumable');
    
    return (
      <div className={`relative w-full h-screen overflow-hidden bg-black touch-none ${gameOverState ? 'pointer-events-none' : ''}`}>
        <HUD levelStartTime={levelStartTime} isShop={currentLevel.isShop} isBoss={currentLevel.isBoss} />
        <GameCanvas 
          inputDirection={inputDir} 
          onGameOver={handleGameOver}
          onLevelComplete={handleLevelComplete}
          onTimeOut={handleTimeOut}
          gameOverState={gameOverState}
        />
        {!gameOverState && isMobile && (
          (() => {
            const controlType = state.settings.mobileControlType || 'joystick';
            if (controlType === 'touchpad') {
              return <TouchpadControl onMove={handleMove} />;
            } else if (controlType === 'dpad') {
              return <DirectionalPadControl onMove={handleMove} />;
            } else {
              return <VirtualJoystick onMove={handleMove} />;
            }
          })()
        )}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
        
        {/* Menu Button - hidden during game over */}
        {!gameOverState && (
        <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="absolute top-4 right-4 z-50 text-white hover:bg-primary/50 font-pixel text-xs bg-black/50"
            >
              MENU
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-card/95 border-primary/20 pixel-corners min-w-[150px]">
            <DropdownMenuItem 
              className="font-pixel text-xs cursor-pointer"
              onClick={() => {
                setShowInventory(true);
                setShowMenu(false);
              }}
            >
              INVENTORY
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="font-pixel text-xs cursor-pointer text-red-400"
              onClick={() => {
                dispatch({ type: 'SET_SCREEN', payload: 'lobby' });
                setShowMenu(false);
              }}
            >
              EXIT
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}

        {/* Inventory Dialog - Combined with Equipment */}
        <Dialog open={showInventory} onOpenChange={setShowInventory}>
          <DialogContent className="bg-card/95 border-primary/20 pixel-corners max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-pixel text-primary">INVENTORY</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Stats Display */}
              <div className="border border-primary/30 p-3 bg-primary/5">
                <h4 className="font-pixel text-lg text-primary mb-2">STATS</h4>
                {(() => {
                  const effectiveStats = getEffectiveStats(state.stats, state.loadout);
                  return (
                    <div className="text-lg font-mono space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">DMG:</span>
                        <span className="text-destructive">{effectiveStats.damage}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SPD:</span>
                        <span className="text-blue-400">{effectiveStats.speed.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VIS:</span>
                        <span className="text-cyan-400">{effectiveStats.visionRadius.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Equipped Items */}
              <div className="border border-primary/30 p-3 bg-primary/5">
                <h4 className="font-pixel text-lg text-primary mb-2">EQUIPPED</h4>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-lg font-mono text-muted-foreground">WEAPON:</span>
                    </div>
                    <div className={cn(
                      "p-2 border text-lg font-mono",
                      state.loadout.weapon ? "border-primary/30 bg-primary/5" : "border-white/10"
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          state.loadout.weapon ? 'text-primary' : 'text-muted-foreground',
                          "text-base font-pixel"
                        )}>
                          {state.loadout.weapon?.name || 'NONE'}
                        </span>
                        {state.loadout.weapon && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-lg font-pixel border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
                            onClick={() => {
                              dispatch({ type: 'UNEQUIP_ITEM', payload: { slot: 'weapon' } });
                              toast({ 
                                title: "UNEQUIPPED", 
                                description: state.loadout.weapon?.name,
                                className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                              });
                            }}
                          >
                            UNEQUIP
                          </Button>
                        )}
                      </div>
                      {state.loadout.weapon?.stats && (
                        <div className="text-lg text-muted-foreground space-y-0.5 mt-1">
                          {state.loadout.weapon.stats.damage && <div>DMG: +{state.loadout.weapon.stats.damage}</div>}
                          {state.loadout.weapon.stats.speed && <div>SPD: +{state.loadout.weapon.stats.speed}</div>}
                          {state.loadout.weapon.stats.vision && <div>VIS: +{state.loadout.weapon.stats.vision}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-lg font-mono text-muted-foreground">ARMOR:</span>
                    </div>
                    <div className={cn(
                      "p-2 border text-lg font-mono",
                      state.loadout.armor ? "border-primary/30 bg-primary/5" : "border-white/10"
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          state.loadout.armor ? 'text-primary' : 'text-muted-foreground',
                          "text-base font-pixel"
                        )}>
                          {state.loadout.armor?.name || 'NONE'}
                        </span>
                        {state.loadout.armor && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-lg font-pixel border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
                            onClick={() => {
                              dispatch({ type: 'UNEQUIP_ITEM', payload: { slot: 'armor' } });
                              toast({ 
                                title: "UNEQUIPPED", 
                                description: state.loadout.armor?.name,
                                className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                              });
                            }}
                          >
                            UNEQUIP
                          </Button>
                        )}
                      </div>
                      {state.loadout.armor?.stats && (
                        <div className="text-lg text-muted-foreground space-y-0.5 mt-1">
                          {state.loadout.armor.stats.defense && <div>DEF: +{state.loadout.armor.stats.defense}</div>}
                          {state.loadout.armor.stats.speed && <div>SPD: +{state.loadout.armor.stats.speed}</div>}
                          {state.loadout.armor.stats.vision && <div>VIS: +{state.loadout.armor.stats.vision}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-lg font-mono text-muted-foreground">UTILITY:</span>
                    </div>
                    <div className={cn(
                      "p-2 border text-lg font-mono",
                      state.loadout.utility ? "border-primary/30 bg-primary/5" : "border-white/10"
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          state.loadout.utility ? 'text-primary' : 'text-muted-foreground',
                          "text-base font-pixel"
                        )}>
                          {state.loadout.utility?.name || 'NONE'}
                        </span>
                        {state.loadout.utility && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-lg font-pixel border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
                            onClick={() => {
                              dispatch({ type: 'UNEQUIP_ITEM', payload: { slot: 'utility' } });
                              toast({ 
                                title: "UNEQUIPPED", 
                                description: state.loadout.utility?.name,
                                className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                              });
                            }}
                          >
                            UNEQUIP
                          </Button>
                        )}
                      </div>
                      {state.loadout.utility?.stats && (
                        <div className="text-lg text-muted-foreground space-y-0.5 mt-1">
                          {state.loadout.utility.stats.damage && <div>DMG: +{state.loadout.utility.stats.damage}</div>}
                          {state.loadout.utility.stats.speed && <div>SPD: +{state.loadout.utility.stats.speed}</div>}
                          {state.loadout.utility.stats.vision && <div>VIS: +{state.loadout.utility.stats.vision}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Inventory Items */}
              <div>
                <h4 className="font-pixel text-lg text-primary mb-2">ITEMS ({state.inventory.length})</h4>
                {state.inventory.length === 0 ? (
                  <p className="text-center text-lg text-muted-foreground mt-4">EMPTY</p>
                ) : (
                  <div className="space-y-2">
                    {state.inventory.map(item => {
                      const rarityColor = RARITY_COLORS[item.rarity];
                      const isEquipped = state.loadout.weapon?.id === item.id || 
                                       state.loadout.armor?.id === item.id || 
                                       state.loadout.utility?.id === item.id;
                      const canEquip = item.type === 'weapon' || item.type === 'armor' || item.type === 'utility';
                      
                      // Get equipped item of the same type (if different from current item)
                      const equippedItem = canEquip && !isEquipped
                        ? (item.type === 'weapon' ? state.loadout.weapon :
                           item.type === 'armor' ? state.loadout.armor :
                           item.type === 'utility' ? state.loadout.utility : null)
                        : null;
                      
                      const itemContent = (
                        <div
                          className={cn(
                            "p-3 border transition-all",
                            isEquipped ? "border-primary bg-primary/10" : "border-white/10"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-pixel text-base" style={{ color: rarityColor }}>
                              {item.name}
                            </span>
                            {canEquip && (
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "h-6 px-2 text-lg font-pixel",
                                  isEquipped
                                    ? "border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
                                    : "border-green-500/50 bg-green-500/10 hover:bg-green-500/20"
                                )}
                                onClick={() => {
                                  if (isEquipped) {
                                    // Unequip
                                    const slot = state.loadout.weapon?.id === item.id ? 'weapon' :
                                                 state.loadout.armor?.id === item.id ? 'armor' : 'utility';
                                    dispatch({ type: 'UNEQUIP_ITEM', payload: { slot } });
                                    toast({ 
                                      title: "UNEQUIPPED", 
                                      description: item.name,
                                      className: "bg-yellow-900 border-yellow-500 text-yellow-100" 
                                    });
                                  } else {
                                    // Equip
                                    dispatch({ type: 'EQUIP_ITEM', payload: { slot: item.type as 'weapon' | 'armor' | 'utility', item } });
                                    toast({ 
                                      title: "EQUIPPED", 
                                      description: item.name,
                                      className: "bg-green-900 border-green-500 text-green-100" 
                                    });
                                  }
                                }}
                              >
                                {isEquipped ? 'UNEQUIP' : 'EQUIP'}
                              </Button>
                            )}
                          </div>
                          {item.stats && (
                            <div className="text-lg font-mono text-muted-foreground space-y-0.5">
                              {item.stats.damage && <div>DMG: +{item.stats.damage}</div>}
                              {item.stats.defense && <div>DEF: +{item.stats.defense}</div>}
                              {item.stats.speed && <div>SPD: +{item.stats.speed}</div>}
                              {item.stats.vision && <div>VIS: +{item.stats.vision}</div>}
                              {item.stats.heal && <div>HEAL: +{item.stats.heal}</div>}
                            </div>
                          )}
                          {item.type === 'consumable' && (
                            <div className="text-lg text-cyan-400 font-mono mt-1">[CONSUMABLE]</div>
                          )}
                        </div>
                      );
                      
                      return (
                        <InventoryItemWithHover
                          key={item.id}
                          item={item}
                          itemContent={itemContent}
                          equippedItem={equippedItem}
                          canEquip={canEquip}
                          isMobile={isMobile}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Game Over Overlay */}
        {gameOverState && (
          <div className="absolute inset-0 z-[199] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
            <div className="bg-card/95 border-2 border-primary/50 pixel-corners p-8 max-w-md w-full mx-4 text-center space-y-6 pointer-events-auto">
              <h2 className="text-4xl font-pixel text-destructive mb-2">
                {gameOverState.type === 'death' ? 'SYSTEM FAILURE' : 'SIGNAL LOST'}
              </h2>
              <p className="text-muted-foreground font-mono text-sm">
                {gameOverState.type === 'death' 
                  ? 'HP critical. Mission aborted.' 
                  : 'Time limit exceeded. Mission failed.'}
              </p>
              <Button
                size="lg"
                className="w-full bg-primary text-black hover:bg-primary/80 font-pixel text-lg py-6 pixel-corners pointer-events-auto"
                onClick={handleReturnToMenu}
              >
                RETURN HOME
              </Button>
            </div>
          </div>
        )}

        {/* Consumables Panel - hidden during game over */}
        {!gameOverState && consumables.length > 0 && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2 pointer-events-auto consumables-panel">
            <div className="text-xs font-pixel text-white mb-1 text-right">CONSUMABLES</div>
            {consumables.map(consumable => {
              const rarityColor = RARITY_COLORS[consumable.rarity];
              return (
                <button
                  key={consumable.id}
                  className="consumable-button p-2 border border-white/20 bg-black/70 hover:bg-primary/20 transition-all pixel-corners min-w-[80px] flex flex-col items-center gap-1"
                  onClick={() => {
                    dispatch({ type: 'USE_CONSUMABLE', payload: { itemId: consumable.id } });
                    if (consumable.stats?.heal) {
                      toast({ 
                        title: "USED", 
                        description: `${consumable.name} - Healed ${consumable.stats.heal} HP`,
                        className: "bg-green-900 border-green-500 text-green-100"
                      });
                    }
                  }}
                >
                  <div className="consumable-icon-wrapper flex items-center justify-center">
                    <FlaskConical className="consumable-icon" size={24} style={{ color: rarityColor }} />
                  </div>
                  <div className="consumable-name text-xs font-pixel" style={{ color: rarityColor }}>
                    {consumable.name}
                  </div>
                  <div className="consumable-stats flex flex-col items-center gap-0.5">
                    {consumable.stats?.heal && (
                      <div className="text-xs font-mono text-cyan-400">+{consumable.stats.heal} HP</div>
                    )}
                    {consumable.stats?.speed && (
                      <div className="text-xs font-mono text-blue-400">+{consumable.stats.speed} SPD</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Commerce Scroll Vendor Modal */}
        <Dialog open={showCommerceVendor} onOpenChange={setShowCommerceVendor}>
          <DialogContent className="bg-card/95 border-primary/20 pixel-corners max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-pixel text-primary text-2xl">SCROLL VENDOR STATION</DialogTitle>
              <p className="text-xs font-mono text-muted-foreground mt-2">SPECIAL VENDOR • 6 ITEMS AVAILABLE</p>
            </DialogHeader>
            <div className="space-y-6">
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded">
                <p className="text-2xl font-mono text-muted-foreground text-right">
                  COINS: <span className="text-yellow-400 font-bold">${state.stats.coins}</span>
                </p>
              </div>
              
              <div>
                <h4 className="font-pixel text-sm text-primary mb-2">ITEMS</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {commerceVendorItems && commerceVendorItems.length > 0 && commerceVendorItems.map(item => {
                    const rarityColor = RARITY_COLORS[item.rarity];
                    // Apply soft assist price reduction if economy ratio is low
                    const metrics = getOfferPowerMetrics(state.currentLevel, state.loadout);
                    const assists = getSoftAssistAdjustments(metrics.economyRatio);
                    const adjustedPrice = Math.floor(item.price * assists.shopPriceMultiplier);
                    const canAfford = state.stats.coins >= adjustedPrice;
                    return (
                      <button
                        key={item.id}
                        className={cn(
                          "p-4 border transition-all text-left relative overflow-hidden",
                          canAfford 
                            ? "border-primary/30 hover:bg-primary/10 hover:border-primary/50 hover:scale-105" 
                            : "border-gray-700/50 opacity-60 cursor-not-allowed"
                        )}
                        disabled={!canAfford}
                        onClick={() => {
                          if (canAfford) {
                            audioManager.playSound('purchase');
                            // Use adjusted price for purchase
                            const metrics = getOfferPowerMetrics(state.currentLevel, state.loadout);
                            const assists = getSoftAssistAdjustments(metrics.economyRatio);
                            const adjustedPrice = Math.floor(item.price * assists.shopPriceMultiplier);
                            dispatch({ type: 'UPDATE_STATS', payload: { coins: state.stats.coins - adjustedPrice } });
                            dispatch({ type: 'ADD_ITEM', payload: item });
                            // Mark offer as purchased
                            markOfferPurchased(item.id);
                            toast({ 
                              title: "PURCHASED", 
                              description: item.name, 
                              className: "bg-green-900 border-green-500 text-green-100" 
                            });
                            
                            // Remove purchased item from vendor
                            setCommerceVendorItems(prev => prev.filter(i => i.id !== item.id));
                          }
                        }}
                      >
                        <div className="absolute top-0 right-0 w-2 h-2 bg-primary/20" />
                        <p className="absolute top-2 right-2 text-2xl text-yellow-400 font-mono font-bold">${item.price}</p>
                        <div className="mb-1 flex items-center gap-2">
                          <h4 className="font-pixel text-sm" style={{ color: rarityColor }}>
                            {item.name}{'  '}
                            <span 
                              className="px-2 py-0.5 font-pixel uppercase"
                              style={{ 
                                backgroundColor: rarityColor,
                                color: 'hsl(240, 20%, 8%)',
                                fontSize: '6px',
                                verticalAlign: 'super'
                              }}
                            >
                              {item.rarity}
                            </span>
                          </h4>
                        </div>
                        {item.stats && (
                          <div className="font-mono text-muted-foreground space-y-0 mb-2" style={{ fontSize: '1.25rem' }}>
                            {item.stats.damage && <div>DMG: +{item.stats.damage}</div>}
                            {item.stats.defense && <div>DEF: +{item.stats.defense}</div>}
                            {item.stats.speed && <div>SPD: +{item.stats.speed}</div>}
                            {item.stats.vision && <div>VIS: +{item.stats.vision}</div>}
                            {item.stats.heal && <div>HEAL: +{item.stats.heal}</div>}
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 text-xs font-mono text-muted-foreground/60">
                          {item.type.toUpperCase()}
                        </div>
                        {!canAfford && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                            <p className="insufficient-funds-text text-3xl text-red-400 font-mono">INSUFFICIENT FUNDS</p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
