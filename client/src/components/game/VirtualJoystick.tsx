import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface VirtualJoystickProps {
  onMove: (dir: { x: number; y: number }) => void;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove }) => {
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const activeDirectionRef = useRef<{ x: number; y: number } | null>(null);

  const applyDirection = (direction: { x: number; y: number }) => {
    const prev = activeDirectionRef.current;
    if (prev && prev.x === direction.x && prev.y === direction.y) {
      return;
    }
    activeDirectionRef.current = direction;
    onMove(direction);
  };

  const stopMovement = () => {
    if (!activeDirectionRef.current) return;
    activeDirectionRef.current = null;
    onMove({ x: 0, y: 0 });
  };

  const getDirectionFromAngle = (angle: number): { x: number; y: number } | null => {
    const normalizedAngle = ((angle * 180 / Math.PI) + 360) % 360;

    if (normalizedAngle >= 315 || normalizedAngle < 45) {
      return { x: 1, y: 0 };
    } else if (normalizedAngle >= 45 && normalizedAngle < 135) {
      return { x: 0, y: 1 };
    } else if (normalizedAngle >= 135 && normalizedAngle < 225) {
      return { x: -1, y: 0 };
    } else if (normalizedAngle >= 225 && normalizedAngle < 315) {
      return { x: 0, y: -1 };
    }
    return null;
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setActive(true);
    setOrigin({ x: clientX, y: clientY });
    setPos({ x: 0, y: 0 });
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!active) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const dx = clientX - origin.x;
    const dy = clientY - origin.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const containerRadius = 64;
    const handleRadius = 24;
    const maxDist = containerRadius - handleRadius;

    const deadzone = 10;
    if (distance < deadzone) {
      stopMovement();
      setPos({ x: 0, y: 0 });
      return;
    }

    const angle = Math.atan2(dy, dx);
    const direction = getDirectionFromAngle(angle);

    if (direction) {
      applyDirection(direction);

      const clampedDist = Math.min(distance, maxDist);
      const newX = (dx / distance) * clampedDist;
      const newY = (dy / distance) * clampedDist;

      setPos({ x: newX, y: newY });
    }
  };

  const handleEnd = () => {
    setActive(false);
    setPos({ x: 0, y: 0 });
    stopMovement();
  };

  useEffect(() => {
    const handleWindowEnd = () => {
      if (active) handleEnd();
    };
    window.addEventListener('mouseup', handleWindowEnd);
    window.addEventListener('touchend', handleWindowEnd);
    return () => {
      window.removeEventListener('mouseup', handleWindowEnd);
      window.removeEventListener('touchend', handleWindowEnd);
    };
  }, [active]);

  return (
    <div
      className="absolute bottom-[140px] left-[10px] w-32 h-32 rounded-full border-2 border-primary/30 bg-black/20 backdrop-blur-sm z-50 touch-none flex items-center justify-center"
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onMouseMove={handleMove}
      onTouchMove={handleMove}
    >
      <div
        className={cn(
            "w-12 h-12 rounded-full bg-primary/80 shadow-[0_0_15px_rgba(0,255,245,0.6)] transition-transform duration-75",
            active ? "scale-110" : "scale-100"
        )}
        style={{
            transform: `translate(${pos.x}px, ${pos.y}px)`
        }}
      />
    </div>
  );
};
