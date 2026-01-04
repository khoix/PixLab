import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../lib/store';
import { MobSubtype } from '../../lib/game/types';
import { renderOperatorWithGear, getMobCardData, getAllMobSubtypes, MOB_CARD_DATA, getMobPreviewRenderer, renderMobImageOnly } from '../../lib/game/compendium';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';

export const Compendium: React.FC = () => {
  const { state } = useGame();
  const playerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedCard, setSelectedCard] = useState<MobSubtype | null>(null);
  const [playerLoading, setPlayerLoading] = useState(true);

  // Render player when loadout changes
  useEffect(() => {
    if (playerCanvasRef.current) {
      setPlayerLoading(true);
      renderOperatorWithGear(playerCanvasRef.current, state.loadout)
        .then(() => setPlayerLoading(false))
        .catch((err) => {
          console.error('Failed to render operator:', err);
          setPlayerLoading(false);
        });
    }
  }, [state.loadout]);

  const unlockedCount = state.compendium.length;
  const totalCount = getAllMobSubtypes().length;

  const isUnlocked = (subtype: MobSubtype): boolean => {
    return state.compendium.includes(subtype);
  };

  const selectedCardData = selectedCard ? getMobCardData(selectedCard) : null;

  return (
    <div className="space-y-6">
      {/* Player Section */}
      <Card className="bg-card/90 border-primary/20 pixel-corners">
        <CardHeader>
          <CardTitle className="text-primary text-xl font-pixel">OPERATOR</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <div className="relative">
            <canvas
              ref={playerCanvasRef}
              className="border border-primary/30 bg-black"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Mob Cards Section */}
      <Card className="bg-card/90 border-primary/20 pixel-corners">
        <CardHeader>
          <CardTitle className="text-primary text-xl font-pixel">
            COMPENDIUM ({unlockedCount}/{totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {MOB_CARD_DATA.map((cardData) => (
              <MobCard
                key={cardData.subtype}
                cardData={cardData}
                unlocked={isUnlocked(cardData.subtype)}
                onSelect={() => setSelectedCard(cardData.subtype)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Card Detail Overlay - Shows only uploaded image */}
      {selectedCard && (
        <MobImageOverlay
          subtype={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
};

// Individual mob card component
const MobCard: React.FC<{
  cardData: typeof MOB_CARD_DATA[0];
  unlocked: boolean;
  onSelect: () => void;
}> = ({ cardData, unlocked, onSelect }) => {
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);

  // Render mob preview using canvas renderer (as it looks in-game)
  useEffect(() => {
    if (cardCanvasRef.current && unlocked) {
      const previewRenderer = getMobPreviewRenderer(cardData.subtype);
      previewRenderer(cardCanvasRef.current);
    }
  }, [unlocked, cardData.subtype]);


  return (
    <button
      onClick={() => {
        if (unlocked) {
          onSelect();
        }
      }}
      className={cn(
        "relative border transition-all aspect-square",
        unlocked
          ? "border-primary/30 hover:border-primary/50 hover:bg-primary/10 cursor-pointer"
          : "border-white/10 bg-black/40 opacity-50 cursor-not-allowed"
      )}
      disabled={!unlocked}
    >
      {unlocked ? (
        <canvas
          ref={cardCanvasRef}
          className="w-full h-full"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-muted-foreground font-mono text-xs text-center">
            ???
          </div>
        </div>
      )}
      {unlocked && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-1">
          <div className="mob-card-caption">
            {cardData.name}
          </div>
        </div>
      )}
    </button>
  );
};

// Overlay component to show uploaded mob image
const MobImageOverlay: React.FC<{
  subtype: MobSubtype;
  onClose: () => void;
}> = ({ subtype, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Ensure we're mounted before rendering portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    // Wait for canvas to be mounted before loading image
    const loadImage = async () => {
      if (canvasRef.current) {
        try {
          const loaded = await renderMobImageOnly(canvasRef.current, subtype);
          setImageLoaded(loaded);
        } catch (err) {
          console.error('Failed to load mob image:', err);
          setImageLoaded(false);
        }
      } else {
        // Retry after a short delay if canvas isn't ready
        setTimeout(loadImage, 10);
      }
    };
    
    loadImage();
  }, [subtype]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Render overlay using portal to document body for full-screen coverage
  const overlayContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
    >
      {/* Close button - visible on mobile */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white hover:text-primary transition-colors p-2 md:hidden"
        aria-label="Close"
        style={{ fontSize: '24px', lineHeight: '1', fontWeight: 'bold' }}
      >
        ×
      </button>
      <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className={cn(
            "max-w-full max-h-[90vh] object-contain",
            imageLoaded ? "block" : "hidden"
          )}
          style={{ imageRendering: 'pixelated' }}
          onClick={(e) => e.stopPropagation()}
        />
        {!imageLoaded && (
          <div className="text-muted-foreground">Loading image...</div>
        )}
      </div>
    </div>
  );

  // Use portal to render outside component tree for full-screen overlay
  if (!mounted) return null;
  return createPortal(overlayContent, document.body);
};

