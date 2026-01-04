import React from 'react';

/**
 * GameOverlay - Renders the CRT scanline overlay effect over all game elements
 * This ensures consistent overlay application across canvas and React UI components
 * Matches the scanline pattern from the CSS .crt class
 */
export const GameOverlay: React.FC = () => {
  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 200,
        background: `
          linear-gradient(
            rgba(18, 16, 16, 0) 50%,
            rgba(0, 0, 0, 0.25) 50%
          ),
          linear-gradient(
            90deg,
            rgba(255, 0, 0, 0.06),
            rgba(0, 255, 0, 0.02),
            rgba(0, 0, 255, 0.06)
          )
        `,
        backgroundSize: '100% 2px, 3px 100%',
      }}
    />
  );
};

