import React, { useRef, useEffect } from 'react';
import { generateLevel } from '../lib/game/engine';
import { TILE_SIZE, COLORS } from '../lib/game/constants';

export const MazeBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const offsetRef = useRef({ x: 0, y: 0 });
  const levelRef = useRef(generateLevel(1, 50, 50));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to cover viewport
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Animation loop - pan the maze slowly
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update offset for panning animation
      offsetRef.current.x += 0.2;
      offsetRef.current.y += 0.15;

      // Reset offset when it gets too large to prevent overflow
      if (offsetRef.current.x > levelRef.current.width * TILE_SIZE) {
        offsetRef.current.x = 0;
      }
      if (offsetRef.current.y > levelRef.current.height * TILE_SIZE) {
        offsetRef.current.y = 0;
      }

      // Calculate visible tile range
      const startCol = Math.floor(-offsetRef.current.x / TILE_SIZE);
      const endCol = Math.ceil((canvas.width - offsetRef.current.x) / TILE_SIZE);
      const startRow = Math.floor(-offsetRef.current.y / TILE_SIZE);
      const endRow = Math.ceil((canvas.height - offsetRef.current.y) / TILE_SIZE);

      // Draw visible tiles
      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          // Wrap coordinates for seamless tiling effect
          const wrappedX = ((x % levelRef.current.width) + levelRef.current.width) % levelRef.current.width;
          const wrappedY = ((y % levelRef.current.height) + levelRef.current.height) % levelRef.current.height;
          
          const tile = levelRef.current.tiles[wrappedY][wrappedX];
          
          const screenX = x * TILE_SIZE + offsetRef.current.x;
          const screenY = y * TILE_SIZE + offsetRef.current.y;

          if (tile === 'wall') {
            ctx.fillStyle = COLORS.wall;
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(screenX + 4, screenY + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          } else if (tile === 'floor') {
            ctx.fillStyle = COLORS.floor;
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full -z-10"
      style={{
        filter: 'blur(8px)',
        opacity: 0.3,
      }}
    />
  );
};

