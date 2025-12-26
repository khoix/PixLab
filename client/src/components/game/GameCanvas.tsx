import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../../lib/store';
import { generateLevel, checkCollision, getEntitiesInRadius } from '../../lib/game/engine';
import { TILE_SIZE, COLORS, LEVEL_TIME_LIMIT, MODS } from '../../lib/game/constants';
import { Level, Position, Entity } from '../../lib/game/types';

interface GameCanvasProps {
  inputDirection: { x: number; y: number };
  onGameOver: () => void;
  onLevelComplete: () => void;
  onTimeOut: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ inputDirection, onGameOver, onLevelComplete, onTimeOut }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, dispatch } = useGame();
  
  const levelRef = useRef<Level | null>(null);
  const playerPosRef = useRef<Position>({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(0);
  const moveTimerRef = useRef<number>(0);
  const levelStartTimeRef = useRef<number>(0);
  const gameOverTriggeredRef = useRef<boolean>(false);
  
  // Calculate mod modifiers
  const getModifiers = () => {
    let modifiers = { enemyHp: 1, coinMult: 1, timerMult: 1, visionMult: 1, explosiveDeaths: false, autoReveal: false };
    state.activeMods.forEach(modId => {
      const mod = MODS.find(m => m.id === modId);
      if (mod?.modifiers) {
        Object.assign(modifiers, mod.modifiers);
      }
    });
    return modifiers;
  };

  // Initialize Level
  useEffect(() => {
    const level = generateLevel(state.currentLevel, 30, 30);
    levelRef.current = level;
    playerPosRef.current = { ...level.startPos };
    levelStartTimeRef.current = Date.now();
    gameOverTriggeredRef.current = false;
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
  }, [inputDirection]);

  const update = (deltaTime: number) => {
    if (!levelRef.current) return;

    // Check time limit
    if (!levelRef.current.isShop && !levelRef.current.isBoss) {
      const modifiers = getModifiers();
      const timeLimit = LEVEL_TIME_LIMIT * modifiers.timerMult * 1000; // ms
      const elapsed = Date.now() - levelStartTimeRef.current;
      
      if (elapsed > timeLimit && !gameOverTriggeredRef.current) {
        gameOverTriggeredRef.current = true;
        onTimeOut();
        return;
      }
    }

    // Movement Logic
    const moveDelay = 1000 / (state.stats.speed * 4);
    const dx = Math.round(inputDirection.x);
    const dy = Math.round(inputDirection.y);
    const hasInput = dx !== 0 || dy !== 0;

    if (hasInput) {
      moveTimerRef.current += deltaTime;
      if (moveTimerRef.current > moveDelay) {
        const nextPos = { x: playerPosRef.current.x + dx, y: playerPosRef.current.y + dy };
        
        if (!checkCollision(nextPos, levelRef.current)) {
          playerPosRef.current = nextPos;
          moveTimerRef.current = 0;
          
          // Check tile triggers
          const tile = levelRef.current.tiles[nextPos.y][nextPos.x];
          if (tile === 'exit') {
            onLevelComplete();
          }

          // Auto-attack nearby enemies
          const nearby = getEntitiesInRadius(nextPos, 1, levelRef.current.entities);
          nearby.forEach(enemy => {
            if (enemy.type === 'enemy' || enemy.type === 'boss_enemy') {
              enemy.hp -= state.stats.damage;
              
              if (enemy.hp <= 0) {
                // Remove enemy and award coins
                levelRef.current!.entities = levelRef.current!.entities.filter(e => e.id !== enemy.id);
                const coinReward = (enemy.isBoss ? 100 : 10) * (getModifiers().coinMult);
                dispatch({ type: 'UPDATE_STATS', payload: { coins: state.stats.coins + coinReward } });
              }
            }
          });
        }
      }
    } else {
      moveTimerRef.current = moveDelay;
    }

    // Basic enemy AI (move towards player)
    levelRef.current.entities.forEach(entity => {
      if (entity.type === 'enemy' || entity.type === 'boss_enemy') {
        const dx = Math.sign(playerPosRef.current.x - entity.pos.x);
        const dy = Math.sign(playerPosRef.current.y - entity.pos.y);
        const nextPos = { x: entity.pos.x + dx, y: entity.pos.y + dy };
        
        if (!checkCollision(nextPos, levelRef.current!)) {
          entity.pos = nextPos;
        }

        // Check collision with player
        if (entity.pos.x === playerPosRef.current.x && entity.pos.y === playerPosRef.current.y) {
          const damage = Math.max(1, entity.damage - (state.stats.maxHp - state.stats.hp)); // Def reduces dmg
          dispatch({ type: 'UPDATE_STATS', payload: { hp: Math.max(0, state.stats.hp - damage) } });
          
          if (state.stats.hp - damage <= 0) {
            onGameOver();
          }
        }
      }
    });
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !levelRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const camX = playerPosRef.current.x * TILE_SIZE - canvas.width / 2 + TILE_SIZE / 2;
    const camY = playerPosRef.current.y * TILE_SIZE - canvas.height / 2 + TILE_SIZE / 2;

    ctx.save();
    ctx.translate(-camX, -camY);

    // Draw Map
    const startCol = Math.max(0, Math.floor(camX / TILE_SIZE));
    const endCol = Math.min(levelRef.current.width, startCol + (canvas.width / TILE_SIZE) + 2);
    const startRow = Math.max(0, Math.floor(camY / TILE_SIZE));
    const endRow = Math.min(levelRef.current.height, startRow + (canvas.height / TILE_SIZE) + 2);

    for (let y = startRow; y < endRow; y++) {
      for (let x = startCol; x < endCol; x++) {
        const tile = levelRef.current.tiles[y][x];
        
        if (tile === 'wall') {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        } else if (tile === 'floor') {
          ctx.fillStyle = COLORS.floor;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else if (tile === 'exit') {
          ctx.fillStyle = COLORS.exit;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.shadowColor = COLORS.exit;
          ctx.shadowBlur = 10;
          ctx.fillRect(x * TILE_SIZE + 8, y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
          ctx.shadowBlur = 0;
        }
      }
    }

    // Draw Entities
    levelRef.current.entities.forEach(entity => {
      const color = entity.isBoss ? COLORS.boss : COLORS.enemy;
      ctx.fillStyle = color;
      const size = entity.isBoss ? TILE_SIZE - 4 : TILE_SIZE - 8;
      ctx.fillRect(entity.pos.x * TILE_SIZE + (TILE_SIZE - size) / 2, entity.pos.y * TILE_SIZE + (TILE_SIZE - size) / 2, size, size);
      
      // Health bar
      ctx.fillStyle = '#ff0000';
      const barWidth = TILE_SIZE - 4;
      const barHeight = 3;
      ctx.fillRect(entity.pos.x * TILE_SIZE + 2, entity.pos.y * TILE_SIZE + 2, barWidth, barHeight);
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(entity.pos.x * TILE_SIZE + 2, entity.pos.y * TILE_SIZE + 2, (entity.hp / entity.maxHp) * barWidth, barHeight);
    });

    // Draw Player
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(playerPosRef.current.x * TILE_SIZE + 6, playerPosRef.current.y * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 15;
    ctx.fillStyle = 'white';
    ctx.fillRect(playerPosRef.current.x * TILE_SIZE + 10, playerPosRef.current.y * TILE_SIZE + 10, TILE_SIZE - 20, TILE_SIZE - 20);
    ctx.shadowBlur = 0;

    ctx.restore();

    // Spotlight + Fog
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const modifiers = getModifiers();
    const radius = state.stats.visionRadius * modifiers.visionMult * TILE_SIZE;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // CRT Scanlines
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
