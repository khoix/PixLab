import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../../lib/store';
import { generateLevel, checkCollision } from '../../lib/game/engine';
import { TILE_SIZE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, COLORS } from '../../lib/game/constants';
import { Level, Position, Entity } from '../../lib/game/types';

interface GameCanvasProps {
  inputDirection: { x: number; y: number };
  onGameOver: () => void;
  onLevelComplete: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ inputDirection, onGameOver, onLevelComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, dispatch } = useGame();
  
  // Local mutable state for the game loop to avoid React render overhead
  const levelRef = useRef<Level | null>(null);
  const playerPosRef = useRef<Position>({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(0);
  const moveTimerRef = useRef<number>(0);
  const isMovingRef = useRef<boolean>(false);
  
  // Initialize Level
  useEffect(() => {
    // Generate new level if needed or load from state if we had persistence for mid-level (omitted for now)
    const level = generateLevel(state.currentLevel, 30, 30); // 30x30 maze
    levelRef.current = level;
    playerPosRef.current = { ...level.startPos };
    
    // Initial draw
    draw();
  }, [state.currentLevel]);

  // Game Loop
  useEffect(() => {
    let animationFrameId: number;

    const loop = (time: number) => {
      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      update(deltaTime);
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [inputDirection]); // Re-bind loop if input changes (actually input is ref-based usually, but here passed as prop)

  const update = (deltaTime: number) => {
    if (!levelRef.current) return;

    // Movement Logic
    // Simple grid movement with delay based on speed
    const moveDelay = 1000 / (state.stats.speed * 4); // Speed multiplier
    
    // Check input
    const dx = Math.round(inputDirection.x);
    const dy = Math.round(inputDirection.y);
    const hasInput = dx !== 0 || dy !== 0;

    if (hasInput) {
       moveTimerRef.current += deltaTime;
       if (!isMovingRef.current || moveTimerRef.current > moveDelay) {
         // Try to move
         const nextPos = { x: playerPosRef.current.x + dx, y: playerPosRef.current.y + dy };
         
         if (!checkCollision(nextPos, levelRef.current)) {
            playerPosRef.current = nextPos;
            moveTimerRef.current = 0;
            isMovingRef.current = true;
            
            // Check tile triggers
            const tile = levelRef.current.tiles[nextPos.y][nextPos.x];
            if (tile === 'exit') {
                onLevelComplete();
            }
         } else {
             // Wall slide logic (optional, keep simple for now)
         }
       }
    } else {
        isMovingRef.current = false;
        moveTimerRef.current = moveDelay; // Ready to move instantly on next input
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !levelRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Camera follow player
    const camX = playerPosRef.current.x * TILE_SIZE - canvas.width / 2 + TILE_SIZE / 2;
    const camY = playerPosRef.current.y * TILE_SIZE - canvas.height / 2 + TILE_SIZE / 2;

    ctx.save();
    ctx.translate(-camX, -camY);

    // Draw Map (Optimization: only draw visible tiles)
    const startCol = Math.floor(camX / TILE_SIZE);
    const endCol = startCol + (canvas.width / TILE_SIZE) + 1;
    const startRow = Math.floor(camY / TILE_SIZE);
    const endRow = startRow + (canvas.height / TILE_SIZE) + 1;

    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        if (y >= 0 && y < levelRef.current.height && x >= 0 && x < levelRef.current.width) {
          const tile = levelRef.current.tiles[y][x];
          
          if (tile === 'wall') {
            ctx.fillStyle = COLORS.wall;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            // Add pixel detail
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          } else if (tile === 'floor') {
            ctx.fillStyle = COLORS.floor;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            // Grid lines
             ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
             ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          } else if (tile === 'exit') {
             ctx.fillStyle = COLORS.exit;
             ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
             // Glow
             ctx.shadowColor = COLORS.exit;
             ctx.shadowBlur = 10;
             ctx.fillRect(x * TILE_SIZE + 8, y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
             ctx.shadowBlur = 0;
          }
        }
      }
    }

    // Draw Entities
    levelRef.current.entities.forEach(entity => {
      ctx.fillStyle = COLORS.enemy;
      ctx.fillRect(entity.pos.x * TILE_SIZE + 4, entity.pos.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
    });

    // Draw Player
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(playerPosRef.current.x * TILE_SIZE + 6, playerPosRef.current.y * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
    // Player Glow
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 15;
    ctx.fillStyle = 'white';
    ctx.fillRect(playerPosRef.current.x * TILE_SIZE + 10, playerPosRef.current.y * TILE_SIZE + 10, TILE_SIZE - 20, TILE_SIZE - 20);
    ctx.shadowBlur = 0;

    ctx.restore();

    // Draw Fog / Spotlight
    // Create a radial gradient for the spotlight
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = state.stats.visionRadius * TILE_SIZE;

    const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Solid black outside radius (optimization: simple fill for outer areas)
    // Actually the gradient handles the transition, but we need solid black beyond the radius.
    // Easier way: Draw a giant hollow rectangle? No, Composite Operation.
    
    ctx.globalCompositeOperation = 'source-over';
    
    // Draw "Darkness" everywhere except the hole?
    // Let's use path clipping for a cleaner "Spotlight"
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true); // Counter-clockwise for hole
    ctx.clip();
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Vignette / Scanlines overlay
    ctx.fillStyle = 'rgba(0, 20, 20, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <canvas 
      ref={canvasRef} 
      width={window.innerWidth} 
      height={window.innerHeight}
      className="block touch-none"
    />
  );
};
